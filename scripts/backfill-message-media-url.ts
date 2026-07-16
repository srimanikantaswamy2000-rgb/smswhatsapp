/**
 * One-off: repair image messages whose media_url is NULL.
 *
 * engineSendMedia sent the photo to Meta but never stored the link, so
 * the customer saw the image on WhatsApp while the inbox rendered
 * "photo unavailable". The sender is fixed; these rows predate it.
 * Captions are unique per manifest item, so they identify the photo.
 *
 * Usage: npx tsx scripts/backfill-message-media-url.ts [--apply]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const { MEDIA_MANIFEST } = await import('../src/lib/ai/media-manifest');
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const base = 'https://whatsapp-crm-test.vercel.app';

  // caption -> absolute URL, from the same manifest the agent sends from
  const byCaption = new Map<string, string>();
  for (const product of Object.values(MEDIA_MANIFEST)) {
    for (const item of product.items) {
      byCaption.set(item.captionEn, base + item.path);
      byCaption.set(item.captionTe, base + item.path);
    }
  }

  const { data, error } = await db
    .from('messages')
    .select('id, content_text, content_type, media_url')
    .in('content_type', ['image', 'video'])
    .is('media_url', null);
  if (error) throw error;

  console.log(`${data?.length ?? 0} media rows with NULL media_url`);
  let fixed = 0;
  for (const m of data ?? []) {
    const url = byCaption.get((m.content_text ?? '').trim());
    if (!url) {
      console.log(`  ? no manifest match: "${String(m.content_text).slice(0, 50)}"`);
      continue;
    }
    console.log(`  -> ${url.split('/').pop()}  ("${String(m.content_text).slice(0, 40)}")`);
    if (process.argv.includes('--apply')) {
      const { error: e } = await db.from('messages').update({ media_url: url }).eq('id', m.id);
      if (e) console.error('     FAILED:', e.message);
      else fixed++;
    }
  }
  console.log(process.argv.includes('--apply') ? `\nrepaired ${fixed}` : '\nDRY RUN — re-run with --apply');
}
main().catch((e) => { console.error(e); process.exit(1); });
