// ============================================================
// Daily department digests — Service & Spares.
//
// Rides the daily lead-report cron. Each department admin gets a
// dashboard notification plus a `dept_digest_te` UTILITY-template
// WhatsApp (so it lands even outside a 24h window) summarising the
// items still open for their desk. Sent only when something is pending
// — no "0 pending" noise. Best-effort: a failure here never affects the
// lead report.
//
// Sales isn't here — the lead report itself IS the sales digest.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { SERVICE_TEAM_PHONE, SPARES_TEAM_PHONE } from '@/lib/ai/dept-alert'

const DIGEST_TEMPLATE = 'dept_digest_te'
const MAX_ITEMS = 12
const MAX_ITEMS_CHARS = 600 // keep the {{4}} param well under Meta's limit

function todayLabel(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

/** Join numbered items with " · ", capped by count and total length. */
function itemsLine(items: string[]): string {
  const out: string[] = []
  let len = 0
  for (let i = 0; i < items.length && i < MAX_ITEMS; i++) {
    const piece = `${i + 1}. ${items[i]}`
    if (len + piece.length > MAX_ITEMS_CHARS) {
      out.push(`…+${items.length - i} more`)
      break
    }
    out.push(piece)
    len += piece.length + 3
  }
  return out.join(' · ')
}

export interface DeptDigestResult {
  service: { pending: number; sent: boolean }
  spares: { pending: number; sent: boolean }
}

export async function sendDepartmentDigests(args: {
  db: SupabaseClient
  accountId: string
  ownerUserId: string
  phoneNumberId: string | null
  accessToken: string | null
}): Promise<DeptDigestResult> {
  const { db, accountId, ownerUserId, phoneNumberId, accessToken } = args
  const date = todayLabel()
  const result: DeptDigestResult = {
    service: { pending: 0, sent: false },
    spares: { pending: 0, sent: false },
  }

  const canWhatsApp = Boolean(phoneNumberId && accessToken)

  const sendTpl = async (to: string, dept: string, count: number, line: string) => {
    if (!canWhatsApp) return false
    try {
      await sendTemplateMessage({
        phoneNumberId: phoneNumberId!,
        accessToken: accessToken!,
        to,
        templateName: DIGEST_TEMPLATE,
        language: 'te',
        params: [dept, date, String(count), line || '—'],
      })
      return true
    } catch (err) {
      console.error(`[dept-digest] template send to ${to} failed:`, err instanceof Error ? err.message : err)
      return false
    }
  }

  const notify = async (title: string, body: string) => {
    try {
      await db.from('notifications').insert({
        account_id: accountId,
        user_id: ownerUserId,
        type: 'conversation_assigned',
        title,
        body,
      })
    } catch (err) {
      console.error('[dept-digest] notification insert failed:', err)
    }
  }

  // ── Service ────────────────────────────────────────────────
  try {
    const { data: svc } = await db
      .from('service_requests')
      .select('customer_name, customer_phone, machine_model, complaint')
      .eq('user_id', ownerUserId)
      .in('status', ['pending', 'contacted'])
      .order('created_at', { ascending: false })
      .limit(50)
    const rows = svc ?? []
    result.service.pending = rows.length
    if (rows.length > 0) {
      const line = itemsLine(
        rows.map((r) =>
          [r.customer_name || r.customer_phone || 'Customer', r.machine_model || null, r.complaint]
            .filter(Boolean)
            .join(' — '),
        ),
      )
      await notify(`Service digest — ${rows.length} pending`, line)
      result.service.sent = await sendTpl(
        SERVICE_TEAM_PHONE,
        'సర్వీస్ కంప్లైంట్స్ / Service Complaints',
        rows.length,
        line,
      )
    }
  } catch (err) {
    console.error('[dept-digest] service digest failed:', err)
  }

  // ── Spares ─────────────────────────────────────────────────
  try {
    const { data: ord } = await db
      .from('part_orders')
      .select('customer_name, customer_phone, part_number, part_name, qty')
      .eq('user_id', ownerUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)
    const rows = ord ?? []
    result.spares.pending = rows.length
    if (rows.length > 0) {
      const line = itemsLine(
        rows.map((r) =>
          [
            r.customer_name || r.customer_phone || 'Customer',
            [r.part_number, r.part_name].filter(Boolean).join(' '),
            `x${r.qty}`,
          ]
            .filter(Boolean)
            .join(' — '),
        ),
      )
      await notify(`Spares digest — ${rows.length} pending`, line)
      result.spares.sent = await sendTpl(
        SPARES_TEAM_PHONE,
        'స్పేర్స్ ఆర్డర్స్ / Spares Orders',
        rows.length,
        line,
      )
    }
  } catch (err) {
    console.error('[dept-digest] spares digest failed:', err)
  }

  return result
}
