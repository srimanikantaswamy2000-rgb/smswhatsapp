-- ============================================================
-- 038_appointments
--
-- Appointments module: booking calendar for the agri modules.
-- Ported from SMS-2 CRM and account-scoped like wacrm's other
-- tables — same `user_id` ownership column + RLS policy shape as
-- `contacts` (see 001_initial_schema.sql). Adds an optional link
-- to wacrm's `contacts` table so an appointment can be tied back
-- to a known contact.
--
-- Idempotent. Safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  customer_name TEXT,
  requested_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'completed', 'no_show', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointments_user_time_idx ON appointments (user_id, requested_time);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own appointments" ON appointments;
CREATE POLICY "Users can manage own appointments" ON appointments FOR ALL USING (auth.uid() = user_id);
