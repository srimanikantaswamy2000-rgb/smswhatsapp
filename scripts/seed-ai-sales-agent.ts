/**
 * Seed / refresh the dealership's AI sales agent.
 *
 *   - points the account at Claude via the aicredits.in gateway
 *   - installs the system prompt from docs/dealership/system-prompt.md
 *   - de-duplicates knowledge-base documents by title
 *
 * The API key itself is NOT touched here — it is already stored
 * encrypted by the settings route. This only updates the model and the
 * prompt, both plain columns.
 *
 * Usage: npx tsx scripts/seed-ai-sales-agent.ts [--apply]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const MODEL = 'anthropic/claude-sonnet-4.6';
const PROMPT_FILE = 'docs/dealership/system-prompt.md';

/** The file is a doc: everything below the first `---` rule is the prompt. */
function loadPrompt(): string {
  const md = readFileSync(PROMPT_FILE, 'utf8');
  const idx = md.indexOf('\n---\n');
  if (idx === -1) throw new Error(`no --- separator in ${PROMPT_FILE}`);
  return md.slice(idx + 5).trim();
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const prompt = loadPrompt();
  console.log(`prompt: ${prompt.length} chars, model: ${MODEL}`);

  const { data: cfg, error: cfgErr } = await db
    .from('ai_configs')
    .select('id, account_id, provider, model, base_url')
    .limit(1)
    .maybeSingle();
  if (cfgErr) throw cfgErr;
  if (!cfg) throw new Error('no ai_configs row — configure the AI in Settings first');
  console.log(`current: provider=${cfg.provider} model=${cfg.model} base_url=${cfg.base_url}`);

  // Knowledge-base duplicates: earlier seeding runs inserted the same
  // titles more than once, which wastes retrieval slots on repeats.
  const { data: docs, error: docErr } = await db
    .from('ai_knowledge_documents')
    .select('id, title, created_at')
    .eq('account_id', cfg.account_id)
    .order('created_at');
  if (docErr) throw docErr;

  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const d of docs ?? []) {
    if (seen.has(d.title)) dupes.push(d.id);
    else seen.add(d.title);
  }
  console.log(`knowledge: ${docs?.length ?? 0} docs, ${seen.size} unique, ${dupes.length} duplicates`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write.');
    return;
  }

  const { error: upErr } = await db
    .from('ai_configs')
    .update({ model: MODEL, system_prompt: prompt })
    .eq('id', cfg.id);
  if (upErr) throw upErr;
  console.log('config updated.');

  if (dupes.length > 0) {
    const { error: delErr } = await db
      .from('ai_knowledge_documents')
      .delete()
      .in('id', dupes);
    if (delErr) throw delErr;
    console.log(`deleted ${dupes.length} duplicate knowledge docs.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
