-- 042_broadcast_queue
--
-- Makes broadcasts server-driven, duplicate-proof and rate-limited.
--
-- Three changes:
--
-- 1. UNIQUE (broadcast_id, contact_id)
--    The only real guarantee that a customer can't receive the same
--    campaign twice. A retry, a double-click, two open tabs or two
--    overlapping cron runs are all defeated in the database rather
--    than by UI logic.
--
-- 2. 'queued' / 'paused' statuses
--    WhatsApp caps business-initiated conversations per rolling 24h
--    (a new number starts at 250). A campaign larger than the quota
--    can't finish today, so it parks in 'queued' and the cron drains
--    it over subsequent days. 'paused' lets a human stop a run.
--
-- 3. daily_send_limit column
--    Meta raises the cap automatically as the number earns trust
--    (250 -> 1k -> 10k -> unlimited). A column means raising it is a
--    settings change, not a redeploy.

-- 1. No duplicate recipients within a campaign ---------------------
-- Defensive: collapse any pre-existing duplicates before the index,
-- keeping the earliest row (it holds the real send history).
DELETE FROM broadcast_recipients a
USING broadcast_recipients b
WHERE a.broadcast_id = b.broadcast_id
  AND a.contact_id   = b.contact_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS broadcast_recipients_unique_contact
  ON broadcast_recipients(broadcast_id, contact_id);

-- 2. Queue-aware statuses -----------------------------------------
ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_status_check
  CHECK (status IN ('draft','scheduled','queued','sending','paused','sent','failed'));

-- 3. Per-account daily cap ----------------------------------------
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS daily_send_limit INTEGER NOT NULL DEFAULT 250;

-- Drives both the rolling-24h quota count and the cron's scan for
-- work still to do.
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_sent_at
  ON broadcast_recipients(sent_at) WHERE sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_pending
  ON broadcast_recipients(broadcast_id) WHERE status = 'pending';
