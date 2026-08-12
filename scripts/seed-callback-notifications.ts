// ============================================================
// Seed the team-notification wiring for callback + appointment taps.
//
// Fixes two silent-failure bugs found on 23 Jul 2026:
//
//   1. "Menu → Talk to team" replied to the customer promising a call
//      back, but nothing ever told the business to make it — the
//      automation's only step was send_message. Adds a notify_team step.
//
//   2. The appointment_reminder_te_2 buttons (వస్తాను / సమయం మార్చాలి)
//      matched no automation at all, so 7 taps that day produced total
//      silence. Creates one automation per button: acknowledge the
//      customer, then alert the team.
//
// Idempotent — safe to re-run; existing rows are updated in place.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const ACCT = '334e7eb8-3e32-4cf9-9c90-36ef5a3002f6';

/** The two numbers the bot already advertises to customers as "the team". */
const TEAM_PHONES = ['919063855903', '918500666928'];

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function upsertStep(
  automationId: string,
  position: number,
  stepType: string,
  stepConfig: Record<string, unknown>,
) {
  const { data: existing } = await db
    .from('automation_steps')
    .select('id')
    .eq('automation_id', automationId)
    .eq('position', position)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from('automation_steps')
      .update({ step_type: stepType, step_config: stepConfig })
      .eq('id', existing.id);
    if (error) throw error;
    return `updated step #${position} (${stepType})`;
  }
  const { error } = await db.from('automation_steps').insert({
    automation_id: automationId,
    position,
    step_type: stepType,
    step_config: stepConfig,
    parent_step_id: null,
  });
  if (error) throw error;
  return `inserted step #${position} (${stepType})`;
}

async function upsertAutomation(
  name: string,
  replyIds: string[],
  userId: string,
  steps: { type: string; config: Record<string, unknown> }[],
) {
  const { data: existing } = await db
    .from('automations')
    .select('id')
    .eq('account_id', ACCT)
    .eq('name', name)
    .maybeSingle();

  let id: string;
  if (existing) {
    id = existing.id;
    const { error } = await db
      .from('automations')
      .update({
        trigger_type: 'interactive_reply',
        trigger_config: { reply_ids: replyIds },
        is_active: true,
      })
      .eq('id', id);
    if (error) throw error;
    console.log(`\n= ${name} (existing)`);
  } else {
    const { data, error } = await db
      .from('automations')
      .insert({
        account_id: ACCT,
        user_id: userId,
        name,
        trigger_type: 'interactive_reply',
        trigger_config: { reply_ids: replyIds },
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    id = data.id;
    console.log(`\n+ ${name} (created)`);
  }

  for (let i = 0; i < steps.length; i++) {
    console.log('   ' + (await upsertStep(id, i, steps[i].type, steps[i].config)));
  }
  return id;
}

function notifyStep(label: string, details: string) {
  return {
    type: 'notify_team',
    config: { label, details, phones: TEAM_PHONES, inapp: true },
  };
}

async function main() {
  // Reuse the owning user of an existing automation so RLS/audit stays
  // consistent with everything else in the account.
  const { data: seed } = await db
    .from('automations')
    .select('user_id')
    .eq('account_id', ACCT)
    .limit(1)
    .single();
  const userId = seed!.user_id;

  // ── 1. Talk to team — keep step #0 (the customer reply) exactly as
  //       it is; append the notification as step #1.
  const { data: talk } = await db
    .from('automations')
    .select('id')
    .eq('account_id', ACCT)
    .eq('name', 'Menu → Talk to team')
    .single();
  console.log('= Menu → Talk to team (existing)');
  console.log(
    '   ' +
      (await upsertStep(talk!.id, 1, 'notify_team', {
        label: 'కాల్ బ్యాక్ / Callback request',
        details: 'Customer tapped "మాట్లాడాలి" — wants the team to call back',
        phones: TEAM_PHONES,
        inapp: true,
      })),
  );

  // ── 2. Appointment confirmed (వస్తాను)
  await upsertAutomation('Menu → Appointment confirmed', ['appt_confirm'], userId, [
    {
      type: 'send_message',
      config: {
        text:
          '🙏 ధన్యవాదాలు! మీ రాక నిర్ధారించాము.\n' +
          '🕘 సోమ–శని ఉ.9 – సా.6 · Mon–Sat 9 AM–6 PM\n' +
          '📍 ఇండియన్ ఆయిల్ బంక్ ఎదురుగా, ఆలంపురం, తాడేపల్లిగూడెం\n\n' +
          'మార్పు ఉంటే ఈ నంబర్లకు కాల్ చేయండి:\n' +
          '☎️ +91 90638 55903\n☎️ +91 85006 66928',
      },
    },
    notifyStep(
      'అపాయింట్‌మెంట్ ఖరారు / Appointment confirmed',
      'Customer tapped "వస్తాను" — confirmed they are coming',
    ),
  ]);

  // ── 3. Reschedule requested (సమయం మార్చాలి)
  await upsertAutomation('Menu → Appointment reschedule', ['appt_reschedule'], userId, [
    {
      type: 'send_message',
      config: {
        text:
          '👍 సరే! మీకు అనుకూలమైన రోజు, సమయం ఇక్కడే మెసేజ్ చేయండి — మా టీమ్ కాల్ చేసి ఖరారు చేస్తుంది.\n\n' +
          'వెంటనే మాట్లాడాలంటే:\n☎️ +91 90638 55903\n☎️ +91 85006 66928',
      },
    },
    notifyStep(
      'సమయం మార్పు / Reschedule requested',
      'Customer tapped "సమయం మార్చాలి" — wants a different appointment time',
    ),
  ]);

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
