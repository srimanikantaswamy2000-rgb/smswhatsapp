# Sri Manikanta Swamy Agri Farm — AI WhatsApp Sales Agent

**Goal:** turn the CRM into an autonomous WhatsApp sales agent for the
Kubota dealership in Tadepalligudem — it opens conversations, learns the
customer's language, answers product/finance/insurance/TR-PR questions
from a knowledge base, qualifies leads, books showroom appointments,
takes spare-part orders with payment hand-off, and runs district/mandal
targeted campaigns. Anyone in India can message the number and get full
information in Telugu or English.

## Dealership facts (source of truth)

- Authorized Kubota dealer · Tadepalligudem, West Godavari, AP
  (Opposite Indian Oil Petrol Bunk, Alampuram).
- Product lines: Kubota tractors (B-series compact: B2441, B2741;
  L-series: L4508; MU-series: MU4201, MU4501, MU5502), Kubota combine
  harvesters (DC-68G-HK King Pro, DC-99 Harvesking), Virat Shrachi 13 HP
  power tillers, Kubota rice transplanters (4-row walk-behind, 6-row
  ride-on), Maschio and Kubota rotavators, Maschio mulchers, bull
  balers, Redlands balers, grass chaff cutters, genuine spare parts.
- Also sells **old (used) tractors** — separate inventory, shown ONLY
  when the customer explicitly asks for old/used/second-hand tractors.
  After a sale the unit is marked out-of-stock (add/delete supported).
- Services: finance support, insurance, TR (temporary registration),
  PR (permanent registration), free field demos, genuine spares &
  service.
- Detailed model data (specs, pain points, best-for, en+te) lives in
  `docs/dealership/catalog/` — extracted from the dealer's HTML catalog.
- Media: photos + field videos per model in
  `C:\Users\DELL\Documents\SMS-2 CRM\Media` (B-SERIES, DC 68G, DC 99G,
  L-4508, MU SERIES). To be uploaded to WhatsApp media / Supabase
  storage in Phase 3.

## Conversation policy (AI behaviour)

1. **Language**: first contact → ask exactly one question: “Which
   language do you prefer — Telugu or English? / మీకు ఏ భాష కావాలి —
   తెలుగా లేక ఇంగ్లీష్?” Persist the choice on the contact (custom field
   `language`) and speak only that language afterwards. If the customer
   just writes in Telugu or English, adopt it and update the field.
2. **Kubota-first**: “tractor” questions get NEW Kubota models only.
   Old-tractor inventory is offered only on explicit ask
   (old/used/second/పాత). Then list available units from the old-tractor
   inventory and let them choose.
3. **Category routing**: harvesters, tractors, tillers, transplanters,
   rotavators/mulchers/balers, spare parts, old tractors — each mapped
   to catalog content and its automation group.
4. **Sales drive**: answer product, price-range, financing, insurance,
   TR/PR questions; always move toward a showroom visit or field demo;
   capture name, village/mandal/district, crop, acreage, current
   machine, budget window → lead qualification.
5. **Appointments**: offer slots Mon–Sat, 09:00–18:00 (multiple
   bookings per slot allowed), book in the CRM appointments module,
   send a reminder before the visit, and after the visit follow up —
   further questions requalify as hot leads.
6. **Spare parts**: customer describes part or sends catalog page/photo
   → AI identifies part number from the parts catalog → creates order
   summary (part number, qty, price) → sends payment QR (scanner image)
   or bank details → human confirms payment received → order handed to
   parts desk. (Payment confirmation is always human-verified.)
7. **Handoff**: pricing commitments, discounts, trade-in valuation,
   payment confirmation and complaints → human handoff (existing
   auto-reply cap + handoff mechanism).

## Campaigns

- Types: seasonal promotions, new vehicle launches, harvester
  promotions, offers, follow-ups, appointment reminders.
- Targeting: district- and mandal-wise. Contacts carry custom fields
  `district`, `mandal` (+ `language`, `crop`, `acreage`). The user has
  an .xlsx of contacts with district/mandal — imported via the Excel
  importer; targeting via tags per district/mandal until the broadcast
  filter learns custom fields.
- Templates: enterprise-grade, en + te variants, with buttons
  (quick-reply + CTA), catalog/media headers. Drafted in
  `docs/dealership/templates/` as ready-to-submit JSON for the existing
  `/api/whatsapp/templates/submit` route (one-click submit from the
  Templates settings page). A few templates are already approved on the
  new WhatsApp Business number — sync via Settings → Templates → Sync.

## Technical plan (phases)

### Phase 1 — foundations (this session)
- [x] Master spec (this file).
- [ ] **aicredits.in**: add optional `base_url` to `ai_configs` and the
  OpenAI-compatible provider so the aicredits.in key works (it is an
  OpenAI-compatible gateway). TDD.
- [ ] **System prompt**: full dealership sales-agent prompt (en/te
  policies above) in `docs/dealership/system-prompt.md` + seed script
  `scripts/seed-ai-sales-agent.ts` that writes it to `ai_configs`.
- [ ] **Knowledge base**: per-model markdown (13 machines from the HTML
  catalog, specs + pains + best-for, en/te) in
  `docs/dealership/catalog/`, seedable into the AI knowledge base.
- [ ] **Templates**: draft JSON payloads (en/te, buttons) in
  `docs/dealership/templates/`.
- [ ] Commit + push to GitHub (Vercel deploys from the repo).

### Phase 2 — automations & data (needs user inputs below)
- Seed automations: language ask on new contact, keyword → category
  replies, spare-part order flow, appointment reminder, post-visit
  follow-up, re-engagement.
- Old-tractor inventory: use `catalog_models`/`inventory` with
  `in_stock` flag + “sold” action; AI reads availability live.
- District/mandal: extend contact custom fields; import the user's
  .xlsx; auto-tag `district:X` / `mandal:Y` on import for targeting.
- Parts catalog import (user's tractor-parts catalog) so the AI can
  resolve part numbers; QR scanner image + bank details stored in
  settings and sent by the parts automation.

### Phase 3 — media, launch, scale
- Upload model photos/videos to Supabase storage + WhatsApp media;
  attach to catalog cards and templates.
- Submit templates to Meta (one click) once WhatsApp number creds are
  in Settings; sync approved ones.
- Second user invite (details to come); role member.
- Vercel production deploy + webhook URL swap; end-to-end test with a
  real customer number.

## Blockers needing user input
1. aicredits.in **API key** (paste into Settings → AI once base_url
   support lands, or give it to me to seed).
2. The **districts/mandals .xlsx** and the **parts catalog** file.
3. WhatsApp Business creds for the NEW number (phone number ID, WABA
   ID, system-user token) — current Settings point at the old/test
   number.
4. Names/texts of the already-approved templates (or just creds — sync
   will pull them).
5. Payment **QR image** + **bank details** for the spare-parts flow.
6. Second user's email for the invite.
