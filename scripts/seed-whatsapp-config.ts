/**
 * Seed a `whatsapp_config` row for the sole account in this instance,
 * using the SEED_WHATSAPP_* credentials from `.env.local`.
 *
 * Mirrors exactly what POST /api/whatsapp/config would write (see
 * src/app/api/whatsapp/config/route.ts), minus the live Meta API
 * verification/registration calls — this is a local dev seed, not a
 * real Cloud API connection.
 *
 * Usage: npx tsx scripts/seed-whatsapp-config.ts
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  const contents = fs.readFileSync(envPath, 'utf8')
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, value] = match
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  loadEnvLocal()

  // Imported dynamically (after env vars are loaded) because
  // encryption.ts reads process.env.ENCRYPTION_KEY at module load time.
  const { encrypt } = await import('../src/lib/whatsapp/encryption')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const phoneNumberId = process.env.SEED_WHATSAPP_PHONE_NUMBER_ID!
  const accessToken = process.env.SEED_WHATSAPP_ACCESS_TOKEN!
  const verifyToken = process.env.SEED_WHATSAPP_VERIFY_TOKEN!

  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SEED_WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
    SEED_WHATSAPP_ACCESS_TOKEN: accessToken,
    SEED_WHATSAPP_VERIFY_TOKEN: verifyToken,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  })) {
    if (!value) throw new Error(`Missing required env var: ${name}`)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Single-tenant local dev instance: seed the account owned by the
  // sole profile row.
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, account_id')

  if (profilesError) throw profilesError
  if (!profiles || profiles.length === 0) {
    throw new Error('No profiles found — create the owner account first.')
  }
  if (profiles.length > 1) {
    throw new Error(
      `Expected exactly one profile, found ${profiles.length}. Seed script assumes a single-tenant dev instance.`,
    )
  }

  const { user_id: userId, account_id: accountId } = profiles[0]

  const row = {
    account_id: accountId,
    user_id: userId,
    phone_number_id: phoneNumberId,
    access_token: encrypt(accessToken),
    verify_token: encrypt(verifyToken),
    status: 'connected',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error: upsertError } = await supabase
    .from('whatsapp_config')
    .upsert(row, { onConflict: 'account_id' })

  if (upsertError) throw upsertError

  console.log(
    `Seeded whatsapp_config for account ${accountId} (phone_number_id=${phoneNumberId}).`,
  )
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
