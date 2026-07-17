/**
 * Replace the 11 Telugu templates that were submitted to Meta with the
 * old (wrong) farm-name spelling మాణిక్యంత. Meta refuses to edit
 * PENDING templates ("can only be edited if rejected") and blocks
 * re-using a deleted name for 30 days, so each one is:
 *
 *   1. deleted from the WABA (by its exact name — the _en twin has a
 *      different name and is untouched), and
 *   2. resubmitted with the corrected spelling under `<name>_2`,
 *   3. mirrored into message_templates (old row out, new row in),
 *   4. renamed in the local JSON drafts so future syncs line up.
 *
 * Idempotent: names already ending in _2 on the WABA are skipped.
 * Usage: npx tsx scripts/resubmit-fixed-templates.ts
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const AFFECTED = [
  'tractor_social_te',
  'seasonal_promo_te',
  'seasonal_promo_video_te',
  'new_launch_video_te',
  'new_launch_te',
  'harvester_promo_te',
  'offer_generic_te',
  'appointment_reminder_te',
  'visit_followup_te',
  'harvester_promo_local_te',
  'village_demo_invite_te',
]

const FILES = [
  'docs/dealership/templates/templates.json',
  'docs/dealership/templates/personalised-templates.json',
]

function loadEnvLocal() {
  for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
  }
}

async function main() {
  loadEnvLocal()
  const { decrypt } = await import('../src/lib/whatsapp/encryption')
  const { buildMetaTemplatePayload } = await import('../src/lib/whatsapp/template-components')
  const { validateTemplatePayload } = await import('../src/lib/whatsapp/template-validators')
  const { uploadResumableMedia, submitMessageTemplate } = await import('../src/lib/whatsapp/meta-api')
  const { normalizeStatus } = await import('../src/lib/whatsapp/template-status-normalize')

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: cfg } = await sb.from('whatsapp_config').select('*').limit(1).single()
  if (!cfg?.waba_id) throw new Error('no whatsapp_config')
  const accessToken = decrypt(cfg.access_token)

  let appId = process.env.META_APP_ID
  if (!appId) {
    const dbg = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`,
    ).then((r) => r.json())
    appId = dbg?.data?.app_id
    if (!appId) throw new Error('cannot resolve META_APP_ID')
  }

  // Current WABA names, to make re-runs safe.
  const onWaba = new Set<string>()
  let url = `https://graph.facebook.com/v21.0/${cfg.waba_id}/message_templates?fields=name&limit=100`
  while (url) {
    const page = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json())
    for (const t of page.data ?? []) onWaba.add(t.name)
    url = page.paging?.next ?? ''
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsons: Array<{ file: string; data: any }> = FILES.map((f) => ({
    file: f,
    data: JSON.parse(fs.readFileSync(f, 'utf8')),
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findDraft = (name: string): any => {
    for (const j of jsons) {
      const d = j.data.templates.find(
        (t: { name: string }) => t.name === name || t.name === `${name}_2`,
      )
      if (d) return d
    }
    return null
  }

  const handleCache = new Map<string, string>()
  let ok = 0, failed = 0

  for (const oldName of AFFECTED) {
    const newName = `${oldName}_2`
    const draft = findDraft(oldName)
    if (!draft) { console.error(`FAIL ${oldName} — draft not found`); failed++; continue }
    if (onWaba.has(newName)) { console.log(`SKIP ${newName} — already on WABA`); continue }

    // 1) Delete the old (wrong-spelling) template.
    if (onWaba.has(oldName)) {
      const del = await fetch(
        `https://graph.facebook.com/v21.0/${cfg.waba_id}/message_templates?name=${encodeURIComponent(oldName)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
      ).then((r) => r.json())
      if (del.success !== true) {
        console.error(`FAIL ${oldName} — delete refused:`, JSON.stringify(del).slice(0, 200))
        failed++
        continue
      }
      console.log(`DEL  ${oldName}`)
    }

    // 2) Resubmit corrected content under the new name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      name: newName,
      category: draft.category,
      language: draft.language,
      header_type: draft.header_type,
      header_media_url: draft.header_media_url,
      body_text: draft.body_text,
      footer_text: draft.footer_text,
      buttons: draft.buttons,
      sample_values: draft.sample_values,
    }
    try {
      validateTemplatePayload(payload)
      if ((draft.header_type === 'image' || draft.header_type === 'video') && draft.header_media_url) {
        let handle = handleCache.get(draft.header_media_url)
        if (!handle) {
          const res = await fetch(draft.header_media_url)
          let contentType = ''
          let bytes: Uint8Array
          if (res.ok) {
            contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
            bytes = new Uint8Array(await res.arrayBuffer())
          } else {
            const localPath = path.resolve('public', new URL(draft.header_media_url).pathname.replace(/^\//, ''))
            if (!fs.existsSync(localPath)) throw new Error(`header URL ${res.status}, no local file`)
            bytes = new Uint8Array(fs.readFileSync(localPath))
          }
          const mimeType = draft.header_type === 'video' ? 'video/mp4'
            : contentType === 'image/png' ? 'image/png' : 'image/jpeg'
          const up = await uploadResumableMedia({
            appId: appId!,
            accessToken,
            fileName: draft.header_type === 'video' ? 'header.mp4' : 'header.jpg',
            mimeType,
            bytes,
          })
          handle = up.handle
          handleCache.set(draft.header_media_url, handle)
        }
        payload.header_handle = handle
      }
      const metaPayload = buildMetaTemplatePayload(payload)
      const meta = await submitMessageTemplate({ wabaId: cfg.waba_id, accessToken, payload: metaPayload })

      // 3) Mirror into message_templates.
      await sb.from('message_templates')
        .delete()
        .eq('account_id', cfg.account_id)
        .eq('name', oldName)
        .eq('language', draft.language)
      await sb.from('message_templates').upsert(
        {
          account_id: cfg.account_id,
          user_id: cfg.user_id,
          name: newName,
          category: payload.category,
          language: payload.language,
          header_type: payload.header_type ?? null,
          header_media_url: payload.header_media_url ?? null,
          header_handle: payload.header_handle ?? null,
          body_text: payload.body_text,
          footer_text: payload.footer_text ?? null,
          buttons: payload.buttons ?? null,
          sample_values: payload.sample_values ?? null,
          status: normalizeStatus(meta.status),
          meta_template_id: meta.id,
          submission_error: null,
          last_submitted_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,name,language' },
      )

      // 4) Rename in the local draft JSON.
      draft.name = newName
      console.log(`OK   ${newName} — meta id ${meta.id}, status ${meta.status}`)
      ok++
    } catch (e) {
      console.error(`FAIL ${newName} —`, e instanceof Error ? e.message : e)
      failed++
    }
  }

  for (const j of jsons) fs.writeFileSync(j.file, JSON.stringify(j.data, null, 2) + '\n')
  console.log(`\nDone. Replaced ${ok}, failed ${failed}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
