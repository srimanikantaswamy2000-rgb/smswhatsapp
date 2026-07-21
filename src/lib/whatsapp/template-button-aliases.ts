// ============================================================
// Template QUICK_REPLY button → canonical menu id aliases.
//
// A marketing template's QUICK_REPLY buttons carry NO custom payload —
// Meta echoes the button's visible label back as `button.payload` when a
// customer taps it. The rest of the bot (flows, interactive_reply
// automations, and the AI's PRODUCT_MENU_TAPS set) routes on canonical
// ids like `menu_harvesters` / `menu_emi`. So a raw label such as
// "హార్వెస్టర్ వివరాలు" matches nothing, the tap gets no reply, and the AI
// stands down — the customer taps "harvester details" and hears silence.
//
// Mapping each known template-button label to its canonical id makes a
// template tap behave EXACTLY like the equivalent in-app menu tap, with
// zero duplicated content: the existing harvester/EMI automations + the
// AI photo follow-up just fire. Add a line here for every new template
// button label that should route into an existing menu handler.
// ============================================================

export const TEMPLATE_BUTTON_ALIASES: Record<string, string> = {
  // harvester_promo_te_2 (the promo broadcast)
  'హార్వెస్టర్ వివరాలు': 'menu_harvesters',
  'EMI వివరాలు': 'menu_emi',
  // harvester_reengage_te_1 (the re-engagement template)
  'అపాయింట్మెంట్': 'followup_appointment',
  'షోరూమ్ విజిట్': 'followup_showroom',
  'టీమ్‌తో మాట్లాడాలి': 'menu_talk',
}

/**
 * Resolve a template button's raw payload/label to its canonical menu
 * id. Unknown labels pass through unchanged (trimmed) so a real
 * canonical id sent as a payload still works, and an unmapped button
 * still carries a stable routing key.
 */
export function canonicalizeTemplateButtonId(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return TEMPLATE_BUTTON_ALIASES[trimmed] ?? trimmed
}
