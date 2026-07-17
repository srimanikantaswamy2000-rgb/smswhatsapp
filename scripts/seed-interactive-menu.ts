/**
 * Seed the dealership's interactive WhatsApp menu + the automations
 * that answer every menu choice.
 *
 * What it creates (idempotent — re-running updates by automation name):
 *   1. "Interactive menu"      keyword_match (menu/మెనూ/list/options)
 *                              → send_list with 7 rows
 *   2–8. one interactive_reply automation per menu row id
 *        (menu_tractors, menu_harvesters, menu_tillers, menu_demo,
 *         menu_service, menu_finance, menu_talk)
 *   Plus tags `demo-request` / `service-request` (created if missing)
 *   so the team can filter hot leads in Contacts.
 *
 * The customer never types anything after the first word — every path
 * is buttons/list taps, and the demo/service paths tag the contact.
 * Team numbers shown to customers: +91 85006 66928 / +91 94938 47755.
 *
 * Usage: npx tsx scripts/seed-interactive-menu.ts
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

interface StepDef {
  step_type: string
  step_config: Record<string, unknown>
}

interface AutomationDef {
  name: string
  description: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  steps: StepDef[]
}

const CALL_LINE = '📞 +91 85006 66928 / +91 94938 47755'

const MENU_LIST = {
  kind: 'list',
  header: 'Sri Manikanta Swamy Agri Farm',
  body:
    'నమస్తే! 🙏 మీకు ఏం కావాలో ఎంచుకోండి.\n' +
    'Namaste! Please choose what you need.',
  footer: 'మీ కుబోటా డీలర్ · తాడేపల్లిగూడెం',
  button_label: 'Menu / మెనూ',
  sections: [
    {
      title: 'Machines / యంత్రాలు',
      rows: [
        { id: 'menu_tractors', title: '🚜 Tractors', description: 'ట్రాక్టర్లు — MU4501, L4508, B-series' },
        { id: 'menu_harvesters', title: '🌾 Harvesters', description: 'హార్వెస్టర్లు — DC-68G, DC-99' },
        { id: 'menu_tillers', title: '🔧 Tillers & more', description: 'టిల్లర్లు, రోటావేటర్లు, transplanters' },
      ],
    },
    {
      title: 'Services / సేవలు',
      rows: [
        { id: 'menu_demo', title: '🏡 Free demo', description: 'మీ పొలంలో ఉచిత డెమో' },
        { id: 'menu_service', title: '🛠️ Service & spares', description: 'సర్వీస్ & అసలైన స్పేర్స్' },
        { id: 'menu_finance', title: '💰 Finance / EMI', description: 'ఫైనాన్స్ — 55 పైసల నుంచి' },
        { id: 'menu_emi', title: '🧮 EMI calculator', description: 'ట్రాక్టర్ & హార్వెస్టర్ EMI లెక్క' },
        { id: 'menu_talk', title: '📞 Talk to team', description: 'మా టీమ్‌తో మాట్లాడండి' },
      ],
    },
  ],
}

function buildAutomations(tagIds: { demo: string; service: string }): AutomationDef[] {
  return [
    {
      name: 'Interactive menu',
      description: 'Customer types menu/మెనూ → sends the tap-to-choose list of everything we offer.',
      trigger_type: 'keyword_match',
      trigger_config: { keywords: ['menu', 'మెనూ', 'list', 'options'], match_type: 'contains' },
      steps: [{ step_type: 'send_list', step_config: MENU_LIST }],
    },
    {
      name: 'Menu → Tractors',
      description: 'Answers the 🚜 Tractors menu choice with the lineup + next-step buttons.',
      trigger_type: 'interactive_reply',
      trigger_config: { reply_ids: ['menu_tractors'] },
      steps: [
        {
          step_type: 'send_buttons',
          step_config: {
            kind: 'buttons',
            body:
              '🚜 కుబోటా ట్రాక్టర్లు / Kubota tractors:\n\n' +
              '• MU4501 — 45 HP, #1 బెస్ట్‌సెల్లర్ (దమ్ము + మెట్ట + రవాణా)\n' +
              '• MU5502 — 55 HP పవర్\n' +
              '• L4508 — 45 HP, తోటలకూ పొలాలకూ\n' +
              '• B-series — చిన్న తోట ట్రాక్టర్లు\n\n' +
              'ధర, ఫోటోలు, ఫైనాన్స్ వివరాలకు ఎంచుకోండి:',
            footer: CALL_LINE,
            buttons: [
              { id: 'menu_demo', title: '🏡 ఉచిత డెమో' },
              { id: 'menu_finance', title: '💰 ఫైనాన్స్' },
              { id: 'menu_talk', title: '📞 మాట్లాడాలి' },
            ],
          },
        },
      ],
    },
    {
      name: 'Menu → Harvesters',
      description: 'Answers the 🌾 Harvesters menu choice.',
      trigger_type: 'interactive_reply',
      trigger_config: { reply_ids: ['menu_harvesters'] },
      steps: [
        {
          step_type: 'send_buttons',
          step_config: {
            kind: 'buttons',
            body:
              '🌾 కుబోటా హార్వెస్టర్లు / Combine harvesters:\n\n' +
              '• DC-68G — 68 HP, రోజుకు 5.75+ ఎకరాలు\n' +
              '• DC-99 హార్వెస్‌కింగ్ — 98 HP, రోజుకు 10 ఎకరాల వరకు\n\n' +
              '💪 బురద పొలాల్లోనూ పనిచేసే క్రాలర్ ట్రాక్స్. ఫైనాన్స్ సౌకర్యం ఉంది.\n' +
              'Crawler tracks for wet Godavari fields. Finance available.',
            footer: CALL_LINE,
            buttons: [
              { id: 'menu_demo', title: '🏡 ఉచిత డెమో' },
              { id: 'menu_finance', title: '💰 EMI వివరాలు' },
              { id: 'menu_talk', title: '📞 మాట్లాడాలి' },
            ],
          },
        },
      ],
    },
    {
      name: 'Menu → Tillers & implements',
      description: 'Answers the 🔧 Tillers & more menu choice.',
      trigger_type: 'interactive_reply',
      trigger_config: { reply_ids: ['menu_tillers'] },
      steps: [
        {
          step_type: 'send_buttons',
          step_config: {
            kind: 'buttons',
            body:
              '🔧 టిల్లర్లు & పరికరాలు / Tillers & implements:\n\n' +
              '• కుబోటా పవర్ టిల్లర్లు\n' +
              '• రైస్ ట్రాన్స్‌ప్లాంటర్లు (నడక & రైడ్-ఆన్)\n' +
              '• కుబోటా & Maschio రోటావేటర్లు\n' +
              '• మల్చర్లు, బేలర్లు, చాఫ్ కట్టర్లు\n\n' +
              'ఏది కావాలో చెప్పండి, వివరాలు పంపుతాము.',
            footer: CALL_LINE,
            buttons: [
              { id: 'menu_demo', title: '🏡 ఉచిత డెమో' },
              { id: 'menu_talk', title: '📞 మాట్లాడాలి' },
            ],
          },
        },
      ],
    },
    {
      name: 'Menu → Free demo request',
      description: 'Demo tap → tags the contact demo-request and asks for village + day.',
      trigger_type: 'interactive_reply',
      trigger_config: { reply_ids: ['menu_demo'] },
      steps: [
        { step_type: 'add_tag', step_config: { tag_id: tagIds.demo } },
        {
          step_type: 'send_message',
          step_config: {
            text:
              '🏡 సూపర్! మీ పొలంలోనే ఉచిత డెమో ఏర్పాటు చేస్తాము.\n\n' +
              'మీ ఊరు పేరు, ఏ యంత్రం చూడాలో, ఏ రోజు అనుకూలమో రిప్లై చేయండి — మా టీమ్ కాల్ చేసి సమయం ఖరారు చేస్తుంది.\n\n' +
              'Great! We will arrange a FREE demo in your own field. Reply with your village, the machine you want to see, and a convenient day — our team will call to confirm.\n\n' +
              CALL_LINE,
          },
        },
      ],
    },
    {
      name: 'Menu → Service & spares request',
      description: 'Service tap → tags the contact service-request and collects machine details.',
      trigger_type: 'interactive_reply',
      trigger_config: { reply_ids: ['menu_service'] },
      steps: [
        { step_type: 'add_tag', step_config: { tag_id: tagIds.service } },
        {
          step_type: 'send_message',
          step_config: {
            text:
              '🛠️ సర్వీస్ / స్పేర్స్ కోసం మీ యంత్రం మోడల్ (ఉదా: MU4501, DC-68G) మరియు సమస్య రిప్లై చేయండి.\n' +
              'అసలైన కుబోటా స్పేర్స్‌తో మీ దగ్గరే సర్వీస్ చేస్తాము.\n\n' +
              'For service or spares, reply with your machine model (e.g. MU4501, DC-68G) and the issue. We service at your place with genuine Kubota spares.\n\n' +
              CALL_LINE,
          },
        },
      ],
    },
    {
      name: 'Menu → Finance / EMI',
      description: 'Finance tap → financier list + 55-paise rate and a callback offer.',
      trigger_type: 'interactive_reply',
      trigger_config: { reply_ids: ['menu_finance'] },
      steps: [
        {
          step_type: 'send_buttons',
          step_config: {
            kind: 'buttons',
            body:
              '💰 ఫైనాన్స్ / Finance:\n\n' +
              '🏦 Axis Bank · HDFC · Kotak · DCB Bank · Bajaj Finance · Shriram Finance · IFFCO Kisan — ఇంకా ఎన్నో ప్రధాన బ్యాంకులు & కంపెనీలు\n\n' +
              '✨ వడ్డీ రేట్లు నెలకు 100కి కేవలం 55 పైసల నుంచి!\n' +
              'Interest rates from just 55 paise per ₹100 per month.\n\n' +
              '• తక్కువ డౌన్ పేమెంట్ ఆప్షన్లు\n' +
              '• ఇన్సూరెన్స్, TR/PR రిజిస్ట్రేషన్ కూడా మేమే చూసుకుంటాము\n\n' +
              'EMI లెక్క కావాలంటే క్రింద నొక్కండి 👇',
            footer: CALL_LINE,
            buttons: [
              { id: 'menu_emi', title: '🧮 EMI లెక్క' },
              { id: 'menu_talk', title: '📞 కాల్ కావాలి' },
            ],
          },
        },
      ],
    },
    {
      name: 'Menu → EMI calculator',
      description: 'EMI tap → sample tractor/harvester EMIs at 55p flat + how to get an exact quote from the AI.',
      trigger_type: 'interactive_reply',
      trigger_config: { reply_ids: ['menu_emi'] },
      steps: [
        {
          step_type: 'send_message',
          step_config: {
            text:
              '🧮 EMI లెక్క (55 పైసలు / నెల / ₹100 చొప్పున, ఉదాహరణ):\n\n' +
              '🚜 ట్రాక్టర్ ₹8,00,000 —\n' +
              '   • 4 సంవత్సరాలు: సుమారు ₹21,100 / నెల\n' +
              '   • 5 సంవత్సరాలు: సుమారు ₹17,750 / నెల\n\n' +
              '🌾 హార్వెస్టర్ ₹25,00,000 —\n' +
              '   • 4 సంవత్సరాలు: సుమారు ₹65,850 / నెల\n' +
              '   • 5 సంవత్సరాలు: సుమారు ₹55,400 / నెల\n\n' +
              'మీ సొంత లెక్క కావాలా? మొత్తం & సంవత్సరాలు రిప్లై చేయండి (ఉదా: "10 లక్షలు 5 సంవత్సరాలు") — వెంటనే లెక్కించి పంపుతాము.\n\n' +
              'Want your own number? Reply with amount & years (e.g. "10 lakhs 5 years") and we will calculate instantly. Final rate depends on the finance company & down payment.',
          },
        },
      ],
    },
    {
      name: 'Menu → Talk to team',
      description: 'Talk tap → shares the MD-approved numbers and promises a callback.',
      trigger_type: 'interactive_reply',
      trigger_config: { reply_ids: ['menu_talk'] },
      steps: [
        {
          step_type: 'send_message',
          step_config: {
            text:
              '📞 మా టీమ్ త్వరలో మీకు కాల్ చేస్తుంది!\n' +
              'వెంటనే మాట్లాడాలంటే ఈ నంబర్లకు కాల్ చేయండి:\n\n' +
              '☎️ +91 85006 66928\n' +
              '☎️ +91 94938 47755\n\n' +
              'Our team will call you shortly. To talk right now, call either number above.\n' +
              '🕘 సోమ–శని ఉ.9 – సా.6 · Mon–Sat 9 AM–6 PM\n' +
              '📍 ఇండియన్ ఆయిల్ బంక్ ఎదురుగా, ఆలంపురం, తాడేపల్లిగూడెం',
          },
        },
      ],
    },
  ]
}

async function main() {
  loadEnvLocal()
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Sole account/owner in this instance — same resolution the other
  // seeds use.
  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('user_id, account_id')
    .not('account_id', 'is', null)
    .limit(1)
    .single()
  if (profErr || !profile) throw new Error(`no profile found: ${profErr?.message}`)
  const { user_id, account_id } = profile

  // Tags for the two lead-capturing paths.
  async function ensureTag(name: string, color: string): Promise<string> {
    const { data: existing } = await sb
      .from('tags')
      .select('id')
      .eq('account_id', account_id)
      .eq('name', name)
      .maybeSingle()
    if (existing) return existing.id
    const { data: created, error } = await sb
      .from('tags')
      .insert({ user_id, account_id, name, color })
      .select('id')
      .single()
    if (error || !created) throw new Error(`failed to create tag ${name}: ${error?.message}`)
    return created.id
  }
  const tagIds = {
    demo: await ensureTag('demo-request', '#22c55e'),
    service: await ensureTag('service-request', '#f97316'),
  }

  const defs = buildAutomations(tagIds)
  for (const def of defs) {
    // Upsert by name: replace steps wholesale so re-runs converge.
    const { data: existing } = await sb
      .from('automations')
      .select('id')
      .eq('account_id', account_id)
      .eq('name', def.name)
      .maybeSingle()

    let automationId: string
    if (existing) {
      automationId = existing.id
      const { error } = await sb
        .from('automations')
        .update({
          description: def.description,
          trigger_type: def.trigger_type,
          trigger_config: def.trigger_config,
          is_active: true,
        })
        .eq('id', automationId)
      if (error) throw new Error(`update ${def.name}: ${error.message}`)
      await sb.from('automation_steps').delete().eq('automation_id', automationId)
    } else {
      const { data: created, error } = await sb
        .from('automations')
        .insert({
          user_id,
          account_id,
          name: def.name,
          description: def.description,
          trigger_type: def.trigger_type,
          trigger_config: def.trigger_config,
          is_active: true,
        })
        .select('id')
        .single()
      if (error || !created) throw new Error(`insert ${def.name}: ${error?.message}`)
      automationId = created.id
    }

    const rows = def.steps.map((s, i) => ({
      automation_id: automationId,
      step_type: s.step_type,
      step_config: s.step_config,
      position: i,
    }))
    const { error: stepErr } = await sb.from('automation_steps').insert(rows)
    if (stepErr) throw new Error(`steps for ${def.name}: ${stepErr.message}`)

    console.log(`✔ ${existing ? 'updated' : 'created'}: ${def.name} (${def.steps.length} step${def.steps.length > 1 ? 's' : ''})`)
  }

  console.log(`\nDone — ${defs.length} automations active. Customer types "menu" to start.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
