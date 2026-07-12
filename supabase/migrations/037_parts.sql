-- ============================================================
-- 037_parts
--
-- Inventory module: parts catalog for the agri modules. Ported
-- from SMS-2 CRM. Per-user (owner-only) RLS: `auth.uid() = user_id`.
-- This deliberately diverges from the account-membership policies
-- migration 017 applies to core tables — if team accounts are ever
-- un-hidden, this table must be migrated to the account model.
-- The Telugu name column from the source schema
-- (`part_name_telugu`) is dropped; not in scope for the rebuilt
-- CRM.
--
-- Idempotent. Safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  part_name TEXT,
  model_compatibility TEXT[],
  category TEXT,
  price NUMERIC,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, part_number)
);

CREATE INDEX IF NOT EXISTS idx_parts_user_id ON parts(user_id);

ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own parts" ON parts;
CREATE POLICY "Users can manage own parts" ON parts FOR ALL USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON parts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON parts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
