# Spare-parts chat ordering + daily PDF lead report

User request (2026-07-17): (1) daily lead report as a PDF sent to the team,
(2) customers order spare parts in the WhatsApp chat by part name **or photo**
— AI searches the MU4501 catalogue, places the order, spare-parts team gets
notified, team accepts → customer is told the part is available,
(3) later: photograph purchase invoices → stock table updates.

## Plan

### A. Parts catalogue → database
- [ ] Parse `C:\Users\DELL\Documents\tractor catalogue\MU4501 2024.pdf`
      (278 pp, clean text layer) into `scripts/data/mu4501-parts.json`
      (section, part_no, part_name, qty per assembly, page)
- [ ] `scripts/import-parts-catalogue.ts` — upsert into existing `parts`
      table (037), `model_compatibility=['MU4501']`, `category`=section name
- [ ] Run the import; verify row count

### B. Ordering in chat
- [ ] Migration `046_part_orders.sql` — `part_orders` (serial order_no,
      contact/conversation refs, part_number, part_name, qty, status
      pending|accepted|declined, RLS like parts) — **needs manual SQL run**
- [ ] `src/lib/ai/parts.ts` — `searchParts()` (token ILIKE over
      part_name/part_number), `buildPartsBlock()` prompt injection,
      `parseOrderDirective()` for `[[ORDER:part_no|part_name|qty]]`
- [ ] Wire into `auto-reply.ts`: inject catalogue matches into system
      prompt; on `[[ORDER:...]]` insert part_orders row + notification +
      WhatsApp ping to PARTS_TEAM_PHONE (env, default MD number)
- [ ] Webhook: inbound from parts-team number matching `OK <n>` / `NO <n>`
      → set order status, WhatsApp the customer availability
- [ ] System prompt (docs + live ai_configs row): teach the parts flow

### C. Part photos (vision)
- [ ] Include the latest inbound image in the AI context (fetch bytes from
      Meta via stored media id, base64) — OpenAI-format `image_url` content
      part (live provider = OpenRouter/claude-sonnet-4.6)

### D. Daily PDF report
- [ ] `pdf-lib` dep; `src/lib/leads/report-pdf.ts` builds the PDF
- [ ] Upload to new public `reports` bucket (created programmatically)
- [ ] Cron sends it as a WhatsApp document to the team (window permitting)

### E. Verify
- [ ] vitest + tsc clean; unit tests for the PDF parser mapping,
      directive parsing, team-reply parsing
- [ ] Live-ish check: import count, generated PDF opens, simulated order

## Later phase (designed, not built): invoice photos → stock
Team WhatsApps a purchase-invoice photo to the business number →
webhook routes team-sender images to an invoice queue
(`purchase_invoices` table: media id, status) → vision extraction of
line items (part_no, qty, price) → operator confirms in dashboard →
`parts.stock_qty` incremented. Needs: table + dashboard review page +
extraction prompt. Building after the ordering flow is proven.

## Review (2026-07-17)

Built and verified:
- Catalogue: 2,262 unique MU4501 parts parsed (144 assemblies, 15 systems)
  and imported into `parts`. Parser: `scripts/parse-parts-pdf.py` →
  `scripts/data/mu4501-parts.json` → `scripts/import-parts-catalogue.ts`
  (idempotent; never touches stock_qty/price).
- Chat ordering: `src/lib/ai/parts.ts` (weighted search — name/number
  hits over category hits, generic fasteners demoted; Telugu glossary),
  `[[ORDER:...]]` directive wired into auto-reply → part_orders insert +
  notification + WhatsApp ping to PARTS_TEAM_PHONE; webhook handles
  "OK <n>" / "NO <n>" from the team and messages the customer.
- Vision: latest customer photo resolved to a base64 data URL and passed
  to the model (OpenAI-format image_url + Anthropic image block); webhook
  now AI-dispatches caption-less photos.
- PDF report: `src/lib/leads/report-pdf.ts` (pdf-lib), uploaded to public
  `reports` bucket (auto-created), sent as WhatsApp document in the cron.
- 673 tests pass, tsc clean. Live prompt row re-seeded from the doc.

**USER ACTION NEEDED:** run `supabase/migrations/046_part_orders.sql`
(and 045 for the reply-cap raise) in the Supabase SQL editor — no DB
password available here, DDL can't be applied via the service key.
Orders fail gracefully (logged, reply still sends) until then.
