-- 041_contact_geo
--
-- District + mandal as first-class contact fields, so broadcasts can
-- target them with dropdowns instead of free-text tags.
--
-- Why columns and not tags
--   The Excel import wrote `district:X` / `mandal:Y` tags. Tags can't
--   drive a dropdown (no distinct list without a join), can't be
--   indexed for a geo filter, and mix administrative geography in with
--   marketing labels. Tags remain, but purely as optional labels.
--
-- Why the values are (re)derived from the mandal in app code
--   The dealer's spreadsheets predate the 4 Apr 2022 AP reorganisation:
--   they record the Kovvur revenue division (Undrajavaram, Nidadavole,
--   Kovvur, Chagallu, Peravali, Tallapudi, Gopalapuram, Devarapalle,
--   Nallajerla) as "West Godavari", but those mandals are now EAST
--   Godavari. 97 of the dealer's contacts are affected. Trusting the
--   imported district string would silently mis-target ~23% of the
--   mapped base, so the backfill derives district from the canonical
--   mandal via `src/lib/geo/ap-districts.ts` rather than copying the
--   stale tag.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mandal   TEXT;

-- Partial indexes: the geo filter always constrains by account first,
-- and only non-null rows are ever targeted.
CREATE INDEX IF NOT EXISTS idx_contacts_account_district
  ON contacts(account_id, district) WHERE district IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_account_mandal
  ON contacts(account_id, mandal) WHERE mandal IS NOT NULL;
