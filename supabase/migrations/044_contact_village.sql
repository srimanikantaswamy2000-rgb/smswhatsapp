-- 044_contact_village
--
-- Village as its own contact field.
--
-- Why
--   The dealer's customer sheets carry a village per customer
--   (Vadisaleru, Duvva, Madduru...). The Excel import had nowhere to
--   put it and wrote it into `company`, so 922 contacts have a village
--   masquerading as a company name. Broadcast personalisation needs to
--   offer "Village" honestly ("మీ ఊరు {{2}} కి promotions ఉన్నాయి"),
--   and `company` needs to mean company again.
--
-- The move below only touches rows whose company looks like imported
-- village data: no real company row should be collateral. At the time
-- of writing every non-null company on this account IS a village except
-- the seeded test contact, so the guard is deliberately narrow — it
-- skips values containing company-ish words.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS village TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_account_village
  ON contacts(account_id, village) WHERE village IS NOT NULL;

-- One-time move: company -> village, for rows that have not already
-- been migrated. Idempotent (village IS NULL guard).
UPDATE contacts
SET village = company,
    company = NULL
WHERE village IS NULL
  AND company IS NOT NULL
  AND company <> ''
  AND company !~* '(pvt|ltd|limited|inc|llp|corp|company|traders|agencies|enterprises|farm)';
