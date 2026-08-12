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
  // appointment_reminder_te_2 (the appointment-reminder broadcast).
  // Unmapped, these two taps matched nothing at all — 7 customers
  // confirmed or asked to reschedule on 23 Jul 2026 and got silence,
  // with no automation and no team alert.
  'వస్తాను': 'appt_confirm',
  'సమయం మార్చాలి': 'appt_reschedule',

  // ---- Remaining broadcast templates (audited 2026-08-12) ----
  // An audit of all 38 templates found 52 of 59 QUICK_REPLY buttons
  // routed nowhere: only harvester_promo_te_2, harvester_reengage_te_1
  // and appointment_reminder_te_2 had aliases, so every other broadcast
  // sent customers a button that did nothing when tapped.
  //
  // Telugu — appointment reminder (EN pair of వస్తాను/సమయం మార్చాలి)
  'Confirm visit': 'appt_confirm',
  'Reschedule': 'appt_reschedule',

  // Harvester promos
  'Harvester details': 'menu_harvesters',
  'EMI options': 'menu_emi',
  'వివరాలు కావాలి': 'menu_harvesters',

  // Demo requests — every "book a demo" phrasing lands on menu_demo
  'Free demo': 'menu_demo',
  'Book free demo': 'menu_demo',
  'Book demo': 'menu_demo',
  'Book field demo': 'menu_demo',
  'ఉచిత డెమో': 'menu_demo',
  'ఉచిత డెమో బుక్': 'menu_demo',
  'డెమో బుక్': 'menu_demo',
  'డెమో బుక్ చేయండి': 'menu_demo',
  'పొల డెమో బుక్': 'menu_demo',

  // Finance / EMI
  'Finance options': 'menu_finance',
  'Finance details': 'menu_finance',
  'ఫైనాన్స్': 'menu_finance',
  'ఫైనాన్స్ వివరాలు': 'menu_finance',

  // Price / generic "send me details" → the offers handler.
  // NOTE: 'Send details' is shared by harvester_promo_local_en and both
  // seasonal_promo_*_en templates. A flat label→id map cannot tell them
  // apart, so it routes to the generic offers reply rather than the
  // harvester one. The Telugu equivalents are distinct labels and do
  // route precisely.
  'Send details': 'menu_offers',
  'Price details': 'menu_offers',
  'ధర వివరాలు': 'menu_offers',
  'వివరాలు పంపండి': 'menu_offers',

  // Product categories
  'Show tractors': 'menu_tractors',
  'ట్రాక్టర్లు చూడండి': 'menu_tractors',

  // Service
  'Need service': 'menu_service',
  'సర్వీస్ కావాలి': 'menu_service',

  // Soft interest → hand to the team
  'I am interested': 'menu_talk',
  'నాకు ఆసక్తి ఉంది': 'menu_talk',

  // DELIBERATELY NOT MAPPED — negative intent. Routing these to any
  // existing automation would reply with a promo to someone asking to
  // be left alone, which is worse than silence:
  //   'Stop offers' / 'ఆఫర్లు ఆపండి'  → needs a real opt-out
  //   'Later' / 'తర్వాత'              → needs a defer/snooze
  //   'Not now' / 'ఇప్పుడు వద్దు'      → needs a decline
  // There is no opt-out handling anywhere in the webhook today; the
  // offer_generic templates even say "Reply STOP to opt out" and
  // nothing listens for STOP.
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
