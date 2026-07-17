import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendText, engineSendMedia } from '@/lib/flows/meta-send'
import {
  scoreLead,
  followUpText,
  buildReportText,
  type LeadInput,
} from '@/lib/leads/qualify'
import { buildLeadReportPdf } from '@/lib/leads/report-pdf'

/**
 * Daily lead-qualification report + hot-lead follow-ups.
 *
 * GET, protected by `x-cron-secret` == AUTOMATION_CRON_SECRET (same
 * secret as the other crons). Hit once a day (GitHub Actions /
 * external pinger):
 *
 *   1. Collect every contact with an inbound message in the last 24h.
 *   2. Score them (see lib/leads/qualify.ts) into hot/warm/cold.
 *   3. Deliver the report to the team:
 *      - a `notifications` row for the account owner (always), and
 *      - a WhatsApp text to TEAM_REPORT_PHONE (default the MD's
 *        8500666928) when that number has an open conversation —
 *        Meta only allows free text inside a 24h customer window.
 *   4. Send each HOT lead one follow-up message in their language.
 *      Their window is open by definition (they wrote within 24h).
 *      A lead already followed up inside the window is skipped, so
 *      re-running the cron can't spam anyone.
 */
const TEAM_REPORT_PHONE = process.env.TEAM_REPORT_PHONE ?? '918500666928'
/** First characters of every follow-up — used to detect an already-sent one. */
const FOLLOWUP_MARKER = '🙏 '

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  if (request.headers.get('x-cron-secret') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Sole-account instance: resolve the account + owner once.
  const { data: cfg, error: cfgErr } = await db
    .from('whatsapp_config')
    .select('account_id, user_id')
    .limit(1)
    .single()
  if (cfgErr || !cfg) {
    return NextResponse.json({ error: 'no whatsapp_config' }, { status: 500 })
  }
  const accountId = cfg.account_id as string
  const ownerUserId = cfg.user_id as string

  // 1) Inbound messages in the window, joined to their conversation's
  //    contact. sender_type 'contact' = customer-authored.
  const { data: inbound, error: msgErr } = await db
    .from('messages')
    .select('content_text, created_at, conversation_id, conversations!inner(id, contact_id, account_id)')
    .eq('sender_type', 'contact')
    .eq('conversations.account_id', accountId)
    .gte('created_at', since)
    .limit(2000)
  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  interface ConvAgg {
    conversationId: string
    contactId: string
    texts: string[]
  }
  const byContact = new Map<string, ConvAgg>()
  for (const m of inbound ?? []) {
    const conv = m.conversations as unknown as { id: string; contact_id: string | null }
    if (!conv?.contact_id) continue
    const agg = byContact.get(conv.contact_id) ?? {
      conversationId: conv.id,
      contactId: conv.contact_id,
      texts: [],
    }
    if (m.content_text) agg.texts.push(m.content_text)
    byContact.set(conv.contact_id, agg)
  }

  if (byContact.size === 0) {
    return NextResponse.json({ leads: 0, followUps: 0, note: 'no enquiries in window' })
  }

  const contactIds = [...byContact.keys()]

  // Contact names/phones + intent tags in two bulk queries.
  const { data: contacts } = await db
    .from('contacts')
    .select('id, name, phone')
    .in('id', contactIds)
  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]))

  const { data: tagRows } = await db
    .from('contact_tags')
    .select('contact_id, tags!inner(name)')
    .in('contact_id', contactIds)
  const tagsByContact = new Map<string, string[]>()
  for (const r of tagRows ?? []) {
    const name = (r.tags as unknown as { name: string }).name
    const list = tagsByContact.get(r.contact_id) ?? []
    list.push(name)
    tagsByContact.set(r.contact_id, list)
  }

  // 2) Score.
  const leads = contactIds
    .map((id) => {
      const c = contactById.get(id)
      if (!c?.phone) return null
      const agg = byContact.get(id)!
      const input: LeadInput = {
        contactId: id,
        name: c.name ?? null,
        phone: c.phone,
        conversationId: agg.conversationId,
        inboundTexts: agg.texts,
        tags: tagsByContact.get(id) ?? [],
      }
      return scoreLead(input)
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => b.score - a.score)

  const windowLabel = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  })
  const report = buildReportText(leads, windowLabel)

  // 3) Deliver the report. Notification always; WhatsApp when possible.
  await db.from('notifications').insert({
    account_id: accountId,
    user_id: ownerUserId,
    // 'conversation_assigned' is the only value the CHECK allows today;
    // the title carries the real meaning. Extend the CHECK when a
    // migration window comes up.
    type: 'conversation_assigned',
    title: `Daily lead report — ${leads.filter((l) => l.grade === 'hot').length} hot / ${leads.length} total`,
    body: report,
  })

  // Render the same report as a PDF and park it in the public
  // `reports` bucket, so it can be WhatsApp'd as a document and pulled
  // up later. Best-effort: a PDF failure never blocks the text report.
  let pdfUrl: string | null = null
  const dateStamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  try {
    const pdfBytes = await buildLeadReportPdf(leads, windowLabel)
    const { data: buckets } = await db.storage.listBuckets()
    if (!(buckets ?? []).some((b: { name: string }) => b.name === 'reports')) {
      await db.storage.createBucket('reports', { public: true })
    }
    const objectPath = `lead-report-${dateStamp}.pdf`
    const { error: upErr } = await db.storage
      .from('reports')
      .upload(objectPath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: true, // re-running the cron the same day refreshes it
      })
    if (upErr) throw upErr
    pdfUrl = db.storage.from('reports').getPublicUrl(objectPath).data.publicUrl
  } catch (err) {
    console.error('[lead-report] PDF build/upload failed:', err)
  }

  let reportSentViaWhatsApp = false
  let pdfSentViaWhatsApp = false
  const teamDigits = TEAM_REPORT_PHONE.replace(/\D/g, '')
  const { data: teamContact } = await db
    .from('contacts')
    .select('id, phone')
    .eq('account_id', accountId)
    .or(`phone.eq.${teamDigits},phone.eq.+${teamDigits}`)
    .limit(1)
    .maybeSingle()
  if (teamContact) {
    const { data: teamConv } = await db
      .from('conversations')
      .select('id, last_message_at')
      .eq('contact_id', teamContact.id)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (teamConv) {
      try {
        await engineSendText({
          accountId,
          userId: ownerUserId,
          conversationId: teamConv.id,
          contactId: teamContact.id,
          text: report,
        })
        reportSentViaWhatsApp = true
      } catch (err) {
        console.error('[lead-report] WhatsApp report send failed:', err)
      }
      // The PDF rides along as a proper document (openable/printable).
      if (pdfUrl) {
        try {
          await engineSendMedia({
            accountId,
            userId: ownerUserId,
            conversationId: teamConv.id,
            contactId: teamContact.id,
            kind: 'document',
            link: pdfUrl,
            caption: `Lead report — ${windowLabel}`,
            filename: `lead-report-${dateStamp}.pdf`,
          })
          pdfSentViaWhatsApp = true
        } catch (err) {
          console.error('[lead-report] WhatsApp PDF send failed:', err)
        }
      }
    }
  }

  // 4) Follow up every hot lead, once per window.
  let followUps = 0
  for (const lead of leads) {
    if (lead.grade !== 'hot') continue
    // Skip if a follow-up already went out in this conversation today.
    const { data: prior } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', lead.conversationId)
      .neq('sender_type', 'contact')
      .gte('created_at', since)
      .like('content_text', `${FOLLOWUP_MARKER}%`)
      .limit(1)
    if (prior && prior.length > 0) continue

    try {
      await engineSendText({
        accountId,
        userId: ownerUserId,
        conversationId: lead.conversationId,
        contactId: lead.contactId,
        text: followUpText(lead),
      })
      followUps++
    } catch (err) {
      console.error(`[lead-report] follow-up to ${lead.phone} failed:`, err)
    }
  }

  return NextResponse.json({
    leads: leads.length,
    hot: leads.filter((l) => l.grade === 'hot').length,
    warm: leads.filter((l) => l.grade === 'warm').length,
    followUps,
    reportSentViaWhatsApp,
    pdfSentViaWhatsApp,
    pdfUrl,
  })
}
