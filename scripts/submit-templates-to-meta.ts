/**
 * Submit the dealership template drafts to Meta for approval.
 *
 * Mirrors POST /api/whatsapp/templates/submit (validate → header
 * sample via Resumable Upload → create on the WABA → upsert the local
 * message_templates row), but runs from the CLI with the service-role
 * key so it isn't blocked by the dashboard session or the
 * WHATSAPP_TEMPLATES_DRY_RUN flag.
 *
 * META_APP_ID is discovered from the stored access token via
 * /debug_token when the env var is absent.
 *
 * Skips: templates whose header URL still contains a REPLACE_WITH
 * placeholder (parts_payment_*), and names already PENDING/APPROVED
 * on the WABA (safe to re-run).
 *
 * Usage: npx tsx scripts/submit-templates-to-meta.ts [--dry]
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

interface DraftTemplate {
  name: string
  category: string
  language: string
  header_type?: 'image' | 'video'
  header_media_url?: string
  header_handle?: string
  body_text: string
  footer_text?: string
  buttons?: unknown[]
  sample_values?: { body?: string[] }
  variable_binding?: Record<string, string>
}

async function main() {
  loadEnvLocal()
  const dry = process.argv.includes('--dry')

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
  if (!cfg?.waba_id) throw new Error('whatsapp_config missing or no waba_id')
  const accessToken = decrypt(cfg.access_token)
  const accountId = cfg.account_id as string
  const ownerUserId = cfg.user_id as string

  // Resolve the Meta App id (needed for Resumable Upload).
  let appId = process.env.META_APP_ID
  if (!appId) {
    const dbg = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`,
    ).then((r) => r.json())
    appId = dbg?.data?.app_id
    if (!appId) throw new Error('Could not resolve META_APP_ID from token: ' + JSON.stringify(dbg).slice(0, 300))
    console.log('Resolved META_APP_ID from token:', appId)
  }

  // Existing templates on the WABA — skip anything already submitted.
  const existing = new Set<string>()
  let url = `https://graph.facebook.com/v21.0/${cfg.waba_id}/message_templates?fields=name,language,status&limit=100`
  while (url) {
    const page = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json())
    for (const t of page.data ?? []) existing.add(`${t.name}|${t.language}`)
    url = page.paging?.next ?? ''
  }
  console.log(`WABA already has ${existing.size} template(s).`)

  const load = (file: string): DraftTemplate[] =>
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'docs/dealership/templates', file), 'utf8')).templates
  const drafts: DraftTemplate[] = [...load('templates.json'), ...load('personalised-templates.json')]

  const handleCache = new Map<string, string>()
  let submitted = 0, skipped = 0, failed = 0

  for (const draft of drafts) {
    const key = `${draft.name}|${draft.language}`
    if (draft.header_media_url?.startsWith('REPLACE_WITH')) {
      console.log(`SKIP  ${key} — media placeholder not supplied yet`)
      skipped++
      continue
    }
    if (existing.has(key)) {
      console.log(`SKIP  ${key} — already on the WABA`)
      skipped++
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      name: draft.name,
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
            // Not deployed yet — fall back to the file under public/.
            const localPath = path.resolve(__dirname, '..', 'public', new URL(draft.header_media_url).pathname.replace(/^\//, ''))
            if (!fs.existsSync(localPath)) throw new Error(`header URL ${res.status} and no local file at ${localPath}`)
            bytes = new Uint8Array(fs.readFileSync(localPath))
            console.log(`      ${key} — header URL ${res.status}, using local file ${path.basename(localPath)}`)
          }
          const mimeType = draft.header_type === 'video' ? 'video/mp4'
            : contentType === 'image/png' ? 'image/png' : 'image/jpeg'
          if (dry) {
            handle = 'DRY-RUN-HANDLE'
          } else {
            const up = await uploadResumableMedia({
              appId: appId!,
              accessToken,
              fileName: draft.header_type === 'video' ? 'header.mp4' : 'header.jpg',
              mimeType,
              bytes,
            })
            handle = up.handle
          }
          handleCache.set(draft.header_media_url, handle)
        }
        payload.header_handle = handle
      }

      const metaPayload = buildMetaTemplatePayload(payload)
      if (dry) {
        console.log(`DRY   ${key} — would submit:`, JSON.stringify(metaPayload).slice(0, 160), '…')
        continue
      }

      const meta = await submitMessageTemplate({ wabaId: cfg.waba_id, accessToken, payload: metaPayload })

      await sb.from('message_templates').upsert(
        {
          account_id: accountId,
          user_id: ownerUserId,
          name: payload.name,
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

      console.log(`OK    ${key} — meta id ${meta.id}, status ${meta.status}`)
      submitted++
    } catch (e) {
      console.error(`FAIL  ${key} —`, e instanceof Error ? e.message : e)
      failed++
    }
  }

  console.log(`\nDone. Submitted ${submitted}, skipped ${skipped}, failed ${failed}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
