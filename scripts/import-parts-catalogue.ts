/**
 * Import a parsed parts-catalogue JSON (scripts/parse-parts-pdf.py
 * output) into the `parts` table (migration 037).
 *
 * Idempotent: upserts on (user_id, part_number); re-running refreshes
 * name/category/model but never touches stock_qty or price, which the
 * spare-parts team owns.
 *
 * Usage: npx tsx scripts/import-parts-catalogue.ts [scripts/data/mu4501-parts.json]
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

interface ParsedPart {
  part_number: string
  part_name: string
  section: string
  chapter: string | null
  model: string
  page: number
}

function loadEnvLocal() {
  const contents = fs.readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8')
  for (const line of contents.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
  }
}

async function main() {
  loadEnvLocal()
  const file = process.argv[2] ?? 'scripts/data/mu4501-parts.json'
  const { parts } = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'),
  ) as { parts: ParsedPart[] }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: cfg } = await db
    .from('whatsapp_config')
    .select('user_id')
    .limit(1)
    .single()
  if (!cfg) throw new Error('whatsapp_config missing')
  const userId = cfg.user_id as string

  // Existing rows: never clobber stock_qty/price the team may have set —
  // update only the catalogue-owned columns.
  const { data: existingRows } = await db
    .from('parts')
    .select('part_number')
    .eq('user_id', userId)
  const existing = new Set((existingRows ?? []).map((r) => r.part_number))

  const rows = parts.map((p) => ({
    user_id: userId,
    part_number: p.part_number,
    part_name: p.part_name,
    category: p.chapter ? `${p.chapter} / ${p.section}` : p.section,
    model_compatibility: [p.model],
  }))

  let inserted = 0
  let updated = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await db
      .from('parts')
      .upsert(batch, { onConflict: 'user_id,part_number' })
    if (error) throw new Error(`batch at ${i}: ${error.message}`)
    for (const r of batch) existing.has(r.part_number) ? updated++ : inserted++
  }

  console.log(`Done. Inserted ${inserted}, refreshed ${updated}, total in file ${rows.length}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
