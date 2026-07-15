-- 043_broadcast_rpcs
--
-- Server-side plumbing for geo-targeted, quota-limited broadcasts.
--
--   resolve_broadcast_audience  — who gets it (district/mandal first,
--                                 tags optional), counted server-side
--   broadcast_quota_remaining   — how many sends the 24h window allows
--   claim_broadcast_recipients  — atomically take the next N to send
--
-- Why RPCs rather than client queries
--   The wizard previously resolved the audience in the browser and
--   passed ids to `.in('id', ids)`. PostgREST silently caps that around
--   1000 rows, so both the count and the send list quietly went wrong
--   as the contact base grew. Same reasoning as 025_filter_contacts_by_tags.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- Audience: geo-first, tags optional
--
-- Filters compose with AND; an empty/NULL array means "no constraint
-- from this dimension". So:
--   districts=['West Godavari'], mandals=[]            -> whole district
--   districts=['East Godavari'], mandals=['Kovvur']    -> one mandal
--   districts=[], mandals=[], tags=[]                  -> all contacts
-- Only contacts with a usable phone are ever returned — a broadcast to
-- a row without a phone can only fail.
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_broadcast_audience(
  p_account_id UUID,
  p_districts TEXT[] DEFAULT NULL,
  p_mandals TEXT[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_exclude_tag_ids UUID[] DEFAULT NULL,
  p_limit INT DEFAULT NULL,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT c.id, c.created_at
    FROM contacts c
    WHERE c.account_id = p_account_id
      AND c.phone IS NOT NULL
      AND c.phone <> ''
      AND (p_districts IS NULL OR cardinality(p_districts) = 0
           OR c.district = ANY(p_districts))
      AND (p_mandals IS NULL OR cardinality(p_mandals) = 0
           OR c.mandal = ANY(p_mandals))
      -- Optional include-tags: contact must carry ANY of them.
      AND (p_tag_ids IS NULL OR cardinality(p_tag_ids) = 0 OR EXISTS (
            SELECT 1 FROM contact_tags ct
            WHERE ct.contact_id = c.id AND ct.tag_id = ANY(p_tag_ids)))
      -- Optional exclude-tags: contact must carry NONE of them.
      AND (p_exclude_tag_ids IS NULL OR cardinality(p_exclude_tag_ids) = 0
           OR NOT EXISTS (
            SELECT 1 FROM contact_tags ct
            WHERE ct.contact_id = c.id AND ct.tag_id = ANY(p_exclude_tag_ids)))
  ),
  page AS (
    -- count(*) OVER() runs before LIMIT, so it is the full audience
    -- size even when the caller only wants a preview page. Passing
    -- p_limit = NULL returns everyone (the send path).
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.resolve_broadcast_audience(UUID, TEXT[], TEXT[], UUID[], UUID[], INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_broadcast_audience(UUID, TEXT[], TEXT[], UUID[], UUID[], INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_broadcast_audience(UUID, TEXT[], TEXT[], UUID[], UUID[], INT, INT) TO authenticated, service_role;

-- ============================================================
-- Distinct geo values for the wizard's dropdowns.
-- Returns every district the account actually has contacts in, with
-- its mandals — one round trip, so the mandal list can filter as soon
-- as a district is picked.
-- ============================================================
CREATE OR REPLACE FUNCTION public.contact_geo_options(p_account_id UUID)
RETURNS TABLE (district TEXT, mandal TEXT, contact_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.district, c.mandal, count(*) AS contact_count
  FROM contacts c
  WHERE c.account_id = p_account_id
    AND c.district IS NOT NULL
    AND c.phone IS NOT NULL
    AND c.phone <> ''
  GROUP BY c.district, c.mandal
  ORDER BY c.district, c.mandal NULLS LAST;
$$;

ALTER FUNCTION public.contact_geo_options(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.contact_geo_options(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_geo_options(UUID) TO authenticated;

-- ============================================================
-- Rolling 24h quota.
--
-- Counts template sends across the WHOLE account (not per broadcast),
-- because WhatsApp's cap is per phone number — two campaigns running
-- together must share the 250, not get 250 each.
-- ============================================================
CREATE OR REPLACE FUNCTION public.broadcast_quota_remaining(
  p_account_id UUID,
  p_daily_limit INT DEFAULT 250
)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    p_daily_limit - (
      SELECT count(*)::INT
      FROM broadcast_recipients r
      JOIN broadcasts b ON b.id = r.broadcast_id
      WHERE b.account_id = p_account_id
        AND r.sent_at IS NOT NULL
        AND r.sent_at > now() - interval '24 hours'
    )
  );
$$;

ALTER FUNCTION public.broadcast_quota_remaining(UUID, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.broadcast_quota_remaining(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_quota_remaining(UUID, INT) TO authenticated, service_role;

-- ============================================================
-- Atomically claim the next N pending recipients.
--
-- FOR UPDATE SKIP LOCKED is what makes the cron safe to overlap: two
-- concurrent runs each take a disjoint set instead of both grabbing
-- the same rows and double-sending. Mirrors `claim_ai_reply_slot`.
--
-- Claimed rows flip to 'sending'; the caller MUST settle each one to
-- 'sent' or 'failed'. A row stuck in 'sending' (process died mid-send)
-- is recovered by `requeue_stale_broadcast_sends` below.
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_broadcast_recipients(
  p_broadcast_id UUID,
  p_limit INT
)
RETURNS TABLE (recipient_id UUID, contact_id UUID)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT r.id
    FROM broadcast_recipients r
    WHERE r.broadcast_id = p_broadcast_id
      AND r.status = 'pending'
    ORDER BY r.created_at
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE broadcast_recipients r
  SET status = 'sending'
  FROM claimed
  WHERE r.id = claimed.id
  RETURNING r.id, r.contact_id;
END;
$$;

ALTER FUNCTION public.claim_broadcast_recipients(UUID, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_broadcast_recipients(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_broadcast_recipients(UUID, INT) TO service_role;

-- ============================================================
-- Recover rows abandoned in 'sending' (deploy mid-run, crash, timeout).
-- Without this a campaign could stall forever with rows nothing owns.
-- 15 minutes is comfortably longer than any single send attempt.
-- ============================================================
CREATE OR REPLACE FUNCTION public.requeue_stale_broadcast_sends()
RETURNS INT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stale AS (
    UPDATE broadcast_recipients
    SET status = 'pending'
    WHERE status = 'sending'
      AND created_at < now() - interval '15 minutes'
      AND sent_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::INT FROM stale;
$$;

ALTER FUNCTION public.requeue_stale_broadcast_sends() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.requeue_stale_broadcast_sends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_stale_broadcast_sends() TO service_role;
