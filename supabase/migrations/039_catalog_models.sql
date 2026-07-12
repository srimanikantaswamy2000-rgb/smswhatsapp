-- ============================================================
-- 039_catalog_models
--
-- Catalog module: tractor/harvester models. Account-scoped like
-- wacrm's other tables — same `user_id` ownership column + RLS
-- policy shape as `contacts` (see 001_initial_schema.sql), modeled
-- on 037_parts.sql. The Telugu features column from the source
-- schema is dropped, same rationale as Task 7.
--
-- Idempotent. Safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tractor', 'harvester')),
  hp INTEGER,
  price_min NUMERIC,
  price_max NUMERIC,
  features TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_models_user_id ON catalog_models(user_id);

ALTER TABLE catalog_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own catalog models" ON catalog_models;
CREATE POLICY "Users can manage own catalog models" ON catalog_models FOR ALL USING (auth.uid() = user_id);
