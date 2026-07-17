import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendInteractiveButtons } from '@/lib/flows/meta-send'

/**
 * Before-the-window-closes follow-up queue.
 *
 * Runs hourly. Finds conversations whose LAST customer message is
 * 20–23 hours old — the 24h WhatsApp session window is about to close,
 * after which we can only reach them with a paid template. Each gets
 * one interactive nudge asking what they'd like next:
 *
 *   📅 Book appointment   → followup_appointment (AI takes the reply,
 *   🏢 Visit showroom     → followup_showroom     asks day/time, books
 *                                                 via [[VISIT:...]])
 *   📞 Talk to our team   → menu_talk (existing automation sends the
 *                           team's numbers)
 *
 * Skips: conversations a human agent owns, team-number threads, and
 * conversations already nudged since the customer's last message
 * (the FOLLOWUP_MARKER prefix makes the send idempotent across the
 * 3 hourly runs that see the same window).
 *
 * Auth: x-cron-secret (AUTOMATION_CRON_SECRET) or Vercel Cron's
 * `Authorization: Bearer CRON_SECRET`, same as the lead-report cron.
 */
const FOLLOWUP_MARKER = '⏳ '
const BODY =
  FOLLOWUP_MARKER +
  'నమస్తే! మీ ఆసక్తికి ధన్యవాదాలు 🙏 మీకు ఎలా ముందుకు వెళ్లాలో ఎంచుకోండి:\n' +
  'Thank you for your interest! How would you like to continue?'
const BUTTONS = [
  { id: 'followup_appointment', title: '📅 అపాయింట్మెంట్' },
  { id: 'followup_showroom', title: '🏢 షోరూమ్ విజిట్' },
  { id: 'menu_talk', title: '📞 టీమ్‌తో మాట్లాడాలి' },
]

/** Team numbers that must never receive customer follow-ups. */
function teamDigits(): Set<string> {
  const raw = [
    process.env.TEAM_REPORT_PHONES ?? '918639562351,919063855903,918500666928,919493652555',
    process.env.PARTS_TEAM_PHONE ?? '918500666928',
  ].join(',')
  return new Set(raw.split(',').map((p) => p.replace(/\D/g, '')).filter(Boolean))
}

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const bearer = request.headers.get('authorization')
  const vercelSecret = process.env.CRON_SECRET ?? expected
  const authorized =
    request.headers.get('x-cron-secret') === expected ||
    bearer === `Bearer ${vercelSecret}`
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const now = Date.now()
  const bandStart = new Date(now - 23 * 60 * 60 * 1000).toISOString()
  const bandEnd = new Date(now - 20 * 60 * 60 * 1000).toISOString()

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

  // Customer messages inside the closing band, newest first per query
  // order; the per-conversation newest is what matters.
  const { data: inBand, error: msgErr } = await db
    .from('messages')
    .select('conversation_id, created_at, conversations!inner(id, contact_id, account_id, assigned_agent_id)')
    .eq('sender_type', 'customer')
    .eq('conversations.account_id', accountId)
    .gte('created_at', bandStart)
    .lt('created_at', bandEnd)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  interface Candidate {
    conversationId: string
    contactId: string
    lastInboundAt: string
  }
  const byConversation = new Map<string, Candidate>()
  for (const m of inBand ?? []) {
    const conv = m.conversations as unknown as {
      id: string
      contact_id: string | null
      assigned_agent_id: string | null
    }
    if (!conv?.contact_id) continue
    if (conv.assigned_agent_id) continue // a human owns this thread
    if (!byConversation.has(conv.id)) {
      byConversation.set(conv.id, {
        conversationId: conv.id,
        contactId: conv.contact_id,
        lastInboundAt: m.created_at as string,
      })
    }
  }

  const team = teamDigits()
  let sent = 0
  const skipped: Record<string, number> = {}
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1 }

  for (const cand of byConversation.values()) {
    // The band message must be their LATEST inbound — if they wrote
    // again afterwards, the window restarted and they're not closing.
    const { data: newer } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', cand.conversationId)
      .eq('sender_type', 'customer')
      .gt('created_at', cand.lastInboundAt)
      .limit(1)
    if (newer && newer.length > 0) { skip('window_restarted'); continue }

    // Already nudged since their last message?
    const { data: prior } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', cand.conversationId)
      .neq('sender_type', 'customer')
      .gt('created_at', cand.lastInboundAt)
      .like('content_text', `${FOLLOWUP_MARKER}%`)
      .limit(1)
    if (prior && prior.length > 0) { skip('already_sent'); continue }

    // Team numbers never get customer nudges.
    const { data: contact } = await db
      .from('contacts')
      .select('phone')
      .eq('id', cand.contactId)
      .maybeSingle()
    const digits = (contact?.phone ?? '').replace(/\D/g, '')
    if (!digits || team.has(digits)) { skip('team_or_no_phone'); continue }

    try {
      await engineSendInteractiveButtons({
        accountId,
        userId: ownerUserId,
        conversationId: cand.conversationId,
        contactId: cand.contactId,
        bodyText: BODY,
        buttons: BUTTONS,
        footerText: 'మీ కుబోటా డీలర్ · తాడేపల్లిగూడెం',
      })
      sent++
    } catch (err) {
      console.error(`[follow-up] send failed for ${cand.conversationId}:`, err)
      skip('send_failed')
    }
  }

  return NextResponse.json({ candidates: byConversation.size, sent, skipped })
}
