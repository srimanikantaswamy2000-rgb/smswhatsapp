// ============================================================
// Department alert — a utility-template ping to a team number when a
// service complaint or a spares order comes in through the bot.
//
// Uses the approved `dept_alert_te` UTILITY template so it reaches the
// team even outside a 24h session window (a free-form text would not).
// Best-effort: a not-yet-approved template or a Meta hiccup logs and
// returns false — it must never break the customer-facing reply.
// ============================================================

import { supabaseAdmin } from './admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'

const DEPT_ALERT_TEMPLATE = 'dept_alert_te'
const DEPT_ALERT_LANG = 'te'

/** Service complaints → the service desk; spares orders → the spares
 *  desk. Env-overridable, same pattern as PARTS_TEAM_PHONE. */
export const SERVICE_TEAM_PHONE = process.env.SERVICE_TEAM_PHONE ?? '919154942477'
export const SPARES_TEAM_PHONE = process.env.SPARES_TEAM_PHONE ?? '919154942499'

/** Bilingual `{{1}}` department labels the template renders after "New:". */
export const DEPT_LABEL = {
  service: 'సర్వీస్ కంప్లైంట్ / Service Complaint',
  spares: 'స్పేర్స్ ఆర్డర్ / Spares Order',
} as const

export interface DeptAlertArgs {
  accountId: string
  /** Team number to alert (digits, no +). */
  toPhone: string
  /** {{1}} — use DEPT_LABEL.service / DEPT_LABEL.spares. */
  type: string
  /** {{2}} customer name. */
  customerName: string | null
  /** {{3}} customer phone. */
  customerPhone: string | null
  /** {{4}} machine model / part. */
  item: string | null
  /** {{5}} complaint text / quantity. */
  details: string | null
}

/**
 * Send the dept_alert_te template to a team number. Returns true on a
 * confirmed send. Swallows all errors (returns false) so callers can
 * fall back to a dashboard notification.
 */
export async function sendDeptAlert(args: DeptAlertArgs): Promise<boolean> {
  try {
    const db = supabaseAdmin()
    const { data: cfg } = await db
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', args.accountId)
      .limit(1)
      .maybeSingle()
    if (!cfg?.access_token) return false
    const accessToken = decrypt(cfg.access_token)
    await sendTemplateMessage({
      phoneNumberId: cfg.phone_number_id,
      accessToken,
      to: args.toPhone,
      templateName: DEPT_ALERT_TEMPLATE,
      language: DEPT_ALERT_LANG,
      // dept_alert_te has no header — the legacy body-only params path
      // builds the 5-variable body component directly.
      params: [
        args.type,
        args.customerName || '—',
        args.customerPhone || '—',
        args.item || '—',
        args.details || '—',
      ],
    })
    return true
  } catch (err) {
    console.error(
      '[dept-alert] send failed (template pending approval or Meta error):',
      err instanceof Error ? err.message : err,
    )
    return false
  }
}
