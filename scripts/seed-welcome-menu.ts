/**
 * Seed / repair the conversational flow around the interactive menu.
 *
 *  1. "Welcome — greeting + menu" (first_inbound_message): a brand-new
 *     customer's very first message gets the dealership greeting AND
 *     the interactive menu in one list message. (The AI stands down on
 *     that message — see dispatchInboundToAiReply.)
 *  2. "Interactive menu" keyword fix: drop the over-broad "list"
 *     keyword ("price list" was showing the menu and muting the AI).
 *  3. "🎁 Offers" row appended to the menu + "Menu → Offers"
 *     interactive_reply automation + an offers keyword automation.
 *
 * Idempotent — safe to re-run. Usage: npx tsx scripts/seed-welcome-menu.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const MENU_KEYWORDS = ['menu', 'మెనూ', 'మెను', 'options', 'start'];
const OFFER_KEYWORDS = ['offer', 'offers', 'ఆఫర్', 'ఆఫర్లు', 'discount', 'promotion'];

const GREETING_TEXT =
  '🙏 నమస్తే! శ్రీ మణికంఠ స్వామి అగ్రి ఫార్మ్‌కు స్వాగతం — మీ కుబోటా డీలర్, తాడేపల్లిగూడెం.\n' +
  'Welcome to Sri Manikanta Swamy Agri Farm — your Kubota dealer, Tadepalligudem.\n\n' +
  'తెలుగు లేదా English — ఏ భాషలోనైనా రిప్లై చేయవచ్చు. Reply in Telugu or English.';

const WELCOME_MENU_BODY =
  'మీకు ఏం కావాలో ఎంచుకోండి 👇\nPlease choose what you need.';

const OFFERS_TEXT =
  '🎁 ప్రస్తుత ఆఫర్లు / Current offers:\n\n' +
  '🏡 ఉచిత ఫీల్డ్ డెమో — మీ పొలంలోనే\n' +
  '💰 ఫైనాన్స్ నెలకు 100కి కేవలం 55 పైసల నుంచి — తక్కువ డౌన్ పేమెంట్ ఆప్షన్లు\n' +
  '🛠️ మీ దగ్గరే సర్వీస్ — అసలైన కుబోటా స్పేర్స్‌తో\n' +
  '📋 ఇన్సూరెన్స్ + TR/PR రిజిస్ట్రేషన్ మేమే చూసుకుంటాము\n\n' +
  'Free field demo at your farm · Finance from 55 paise per ₹100/month · Doorstep service with genuine Kubota spares · Insurance + registration handled by us.\n\n' +
  'ఈ రోజు ప్రత్యేక ధర కోసం కాల్ చేయండి / Call for today’s best price:\n' +
  '📞 +91 85006 66928 / +91 94938 47755';

const OFFERS_ROW = {
  id: 'menu_offers',
  title: '🎁 Offers',
  description: 'ఆఫర్లు — డెమో, ఫైనాన్స్, సర్వీస్',
};

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Anchor tenancy + the canonical menu list config on the existing
  // "Interactive menu" keyword automation.
  const { data: menuAuto, error: menuErr } = await db
    .from('automations')
    .select('id, account_id, user_id, trigger_config')
    .eq('trigger_type', 'keyword_match')
    .ilike('name', '%interactive menu%')
    .limit(1)
    .maybeSingle();
  if (menuErr) throw menuErr;
  if (!menuAuto) throw new Error('no "Interactive menu" automation found');
  const { account_id, user_id } = menuAuto;

  const { data: menuStep, error: stepErr } = await db
    .from('automation_steps')
    .select('id, step_config')
    .eq('automation_id', menuAuto.id)
    .eq('step_type', 'send_list')
    .limit(1)
    .single();
  if (stepErr) throw stepErr;

  // 1) Menu keywords: drop "list", add Telugu variants.
  await db
    .from('automations')
    .update({ trigger_config: { keywords: MENU_KEYWORDS, match_type: 'contains' } })
    .eq('id', menuAuto.id);
  console.log('menu keywords ->', MENU_KEYWORDS.join(', '));

  // 2) Append the Offers row to the menu list (both the keyword menu
  //    and the welcome copy below reuse this config).
  const listConfig = menuStep.step_config as {
    body: string;
    sections: Array<{ title: string; rows: Array<{ id: string }> }>;
  };
  const lastSection = listConfig.sections[listConfig.sections.length - 1];
  const totalRows = listConfig.sections.reduce((n, s) => n + s.rows.length, 0);
  if (!listConfig.sections.some((s) => s.rows.some((r) => r.id === 'menu_offers'))) {
    if (totalRows >= 10) throw new Error('menu already at 10 rows — cannot add offers');
    lastSection.rows.push(OFFERS_ROW);
    await db
      .from('automation_steps')
      .update({ step_config: listConfig })
      .eq('id', menuStep.id);
    console.log('offers row appended to menu list');
  } else {
    console.log('offers row already present');
  }

  /** Create-or-replace an automation with the given steps. */
  const upsertAutomation = async (
    name: string,
    trigger_type: string,
    trigger_config: Record<string, unknown>,
    steps: Array<{ step_type: string; step_config: Record<string, unknown> }>,
  ) => {
    const { data: existing } = await db
      .from('automations')
      .select('id')
      .eq('account_id', account_id)
      .eq('name', name)
      .maybeSingle();
    let id = existing?.id as string | undefined;
    if (id) {
      await db.from('automations').update({ trigger_type, trigger_config, is_active: true }).eq('id', id);
      await db.from('automation_steps').delete().eq('automation_id', id);
    } else {
      const { data: created, error } = await db
        .from('automations')
        .insert({ account_id, user_id, name, trigger_type, trigger_config, is_active: true })
        .select('id')
        .single();
      if (error) throw error;
      id = created.id as string;
    }
    for (let i = 0; i < steps.length; i++) {
      const { error } = await db
        .from('automation_steps')
        .insert({ automation_id: id, position: i, ...steps[i] });
      if (error) throw error;
    }
    console.log(`automation ready: ${name}`);
  };

  // 3) Welcome: ONE list message carrying the greeting as its body,
  //    on the very first inbound from a contact (and on a first reply
  //    to a broadcast — see the webhook). Single message by design —
  //    a separate greeting text + menu read as spam on the customer's
  //    phone.
  await upsertAutomation('Welcome — greeting + menu', 'first_inbound_message', {}, [
    {
      step_type: 'send_list',
      step_config: {
        ...listConfig,
        body: `${GREETING_TEXT}\n\n${WELCOME_MENU_BODY}`,
      },
    },
  ]);

  // 4) Offers — menu row tap + keyword.
  await upsertAutomation(
    'Menu → Offers',
    'interactive_reply',
    { reply_ids: ['menu_offers'] },
    [{ step_type: 'send_message', step_config: { text: OFFERS_TEXT } }],
  );
  await upsertAutomation(
    'Offers keywords',
    'keyword_match',
    { keywords: OFFER_KEYWORDS, match_type: 'contains' },
    [{ step_type: 'send_message', step_config: { text: OFFERS_TEXT } }],
  );

  console.log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
