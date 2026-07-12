# WhatsApp CRM (wacrm fork + agri modules) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a restyled WhatsApp CRM from a wacrm fork, trimmed of MCP/public-API/team UI, with ported agri modules (inventory, appointments, catalog), wired to a fresh Supabase project and WhatsApp Cloud API test credentials.

**Architecture:** wacrm (Next.js 16 App Router + Supabase) is copied into a new folder with fresh git history. Trimming is deletion + reference cleanup. Restyle is done via wacrm's existing token system in `src/app/globals.css` (mode + accent variables). Each agri module is a Supabase migration + one dashboard page + API route(s), written in wacrm idioms (shadcn/Base UI components, `createClient` from `@/lib/supabase`).

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, shadcn/Base UI, Supabase (Postgres + Auth + RLS), recharts, next-intl (kept, English-only), vitest.

## Global Constraints

- Project directory: `C:\Users\DELL\Documents\whatsapp-crm-test` (NEW folder; never modify `C:\Users\DELL\Documents\SMS-2 CRM`).
- Local git only. No remote. Commit after every task.
- Secrets go in `.env.local` ONLY (git-ignored). Never in any committed file.
- Supabase project: `https://hgvnrjbdklvxufrmdius.supabase.co` (keys already supplied by user; they are in `.env.local` after Task 3 — read them from there, never echo them into committed files or logs).
- WhatsApp: phone_number_id `<WHATSAPP_PHONE_NUMBER_ID - see .env.local>`, verify token `<WHATSAPP_VERIFY_TOKEN - see .env.local>`, system-user token supplied by user (in `.env.local` after Task 3 as `SEED_WHATSAPP_ACCESS_TOKEN`).
- `META_APP_SECRET` is a placeholder until the user supplies it — webhook GET verify works, inbound POSTs will 401 until then. Do not "fix" this.
- Keep next-intl. New UI strings are added to `messages/en.json`.
- Team accounts: hide UI only (nav + pages); do NOT touch account-sharing migrations/RLS.
- Source of wacrm code: fresh clone from `https://github.com/ArnasDon/wacrm` (a scratch clone exists but re-clone into place for a clean tree).
- All checks green before each commit: `npm run typecheck` and `npm test`.

---

### Task 1: Fork wacrm into the new project folder

**Files:**
- Create: `C:\Users\DELL\Documents\whatsapp-crm-test\**` (entire tree from wacrm)

**Interfaces:**
- Produces: a building, testing wacrm checkout with fresh git history that every later task edits.

- [ ] **Step 1: Clone wacrm into place and strip its history**

```powershell
git clone --depth 1 https://github.com/ArnasDon/wacrm "C:\Users\DELL\Documents\whatsapp-crm-test"
Remove-Item -Recurse -Force "C:\Users\DELL\Documents\whatsapp-crm-test\.git"
```

- [ ] **Step 2: Fresh git init + baseline commit**

```powershell
cd C:\Users\DELL\Documents\whatsapp-crm-test
git init
git add -A
git commit -m "chore: import wacrm 0.8.0 as project base"
```

- [ ] **Step 3: Install deps and verify baseline is green**

Run: `npm install` then `npm run typecheck` then `npm test`
Expected: typecheck exits 0; vitest suite passes (all green). If baseline fails, STOP and report — do not fix upstream failures silently.

- [ ] **Step 4: Copy the spec + this plan into the new repo and commit**

```powershell
New-Item -ItemType Directory -Force docs\superpowers\specs, docs\superpowers\plans
Copy-Item "C:\Users\DELL\Documents\SMS-2 CRM\docs\superpowers\specs\2026-07-12-whatsapp-crm-merge-design.md" docs\superpowers\specs\
Copy-Item "C:\Users\DELL\Documents\SMS-2 CRM\docs\superpowers\plans\2026-07-12-whatsapp-crm-build.md" docs\superpowers\plans\
git add docs; git commit -m "docs: add design spec and implementation plan"
```

---

### Task 2: Trim — MCP server, public API, team-accounts UI

**Files:**
- Delete: `mcp-server/` (whole dir), `docs/mcp.md`, `docs/public-api.md`
- Delete: `src/app/api/v1/` (whole dir), `src/lib/api/v1/` (whole dir, incl. tests)
- Delete: API-keys settings UI — find with `Grep "api-keys|api_keys|ApiKey" src/components/settings src/app` and remove the settings section component + its route `src/app/api/account/api-keys/`
- Delete: team UI — `src/app/join/` (invite acceptance), invitation/member settings sections in `src/components/settings/`, `src/app/api/account/invitations/`, `src/app/api/account/members/`, `src/app/api/account/transfer-ownership/`, `src/app/api/invitations/`
- Modify: `src/components/layout/sidebar.tsx` (remove any nav item whose href was deleted; the `navItems` array is the single source)
- Modify: `README.md` (delete MCP / public API / team sections)

**Interfaces:**
- Consumes: baseline repo from Task 1.
- Produces: a trimmed tree where `npm run typecheck` and `npm test` still pass; later tasks assume `/api/v1` and team routes no longer exist.

- [ ] **Step 1: Delete the directories/files listed above**

Use `git rm -r` so deletions are staged. After each deletion batch, run `npm run typecheck` and fix dangling imports it reports (delete the importing dead code — e.g. settings page sections that rendered the removed components, `middleware`/`config` references to `/api/v1`, notification types for invitations if orphaned). Rule: prefer deleting the orphaned caller over stubbing it.

- [ ] **Step 2: Check DB-facing code is untouched**

Run: `Grep "api_keys" supabase/migrations` — migration `026_api_keys.sql` STAYS (hide-UI-only decision applies to all DB objects). No migration file is edited in this task.

- [ ] **Step 3: Verify green**

Run: `npm run typecheck` then `npm test`
Expected: both pass. Some tests under `src/lib/api/v1` were deleted with the module; no remaining test may reference deleted paths.

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "chore: remove MCP server, public API, and team-account UI"
```

---

### Task 3: Environment wiring (`.env.local`)

**Files:**
- Create: `.env.local` (git-ignored — verify `.gitignore` covers it before writing)

**Interfaces:**
- Produces: env vars every later task uses: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `META_APP_SECRET`, `WHATSAPP_TEMPLATES_DRY_RUN`, and seed-only vars `SEED_WHATSAPP_PHONE_NUMBER_ID`, `SEED_WHATSAPP_ACCESS_TOKEN`, `SEED_WHATSAPP_VERIFY_TOKEN`.

- [ ] **Step 1: Generate encryption key and write `.env.local`**

```powershell
$enc = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Write `.env.local` with (real values come from the conversation / user):

```
NEXT_PUBLIC_SUPABASE_URL=https://hgvnrjbdklvxufrmdius.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from user>
SUPABASE_SERVICE_ROLE_KEY=<service-role key from user>
ENCRYPTION_KEY=<generated 64-hex>
META_APP_SECRET=REPLACE_ME_WITH_META_APP_SECRET
NEXT_PUBLIC_APP_LOCALE=en
WHATSAPP_TEMPLATES_DRY_RUN=true
SEED_WHATSAPP_PHONE_NUMBER_ID=<WHATSAPP_PHONE_NUMBER_ID - see .env.local>
SEED_WHATSAPP_ACCESS_TOKEN=<system-user token from user>
SEED_WHATSAPP_VERIFY_TOKEN=<WHATSAPP_VERIFY_TOKEN - see .env.local>
```

- [ ] **Step 2: Verify it is ignored**

Run: `git status --porcelain` → `.env.local` must NOT appear. Expected: no output mentioning it.

- [ ] **Step 3: Commit (nothing secret should be staged)**

Only commit if some non-secret file changed; otherwise skip.

---

### Task 4: Apply database migrations to the new Supabase project

**Files:**
- Create: `scripts/concat-migrations.mjs` (dev utility)
- Create (generated, git-ignored or committed — commit it, it has no secrets): `supabase/combined.sql`

**Interfaces:**
- Consumes: `supabase/migrations/001…036` (unmodified).
- Produces: all wacrm tables live in project `hgvnrjbdklvxufrmdius`. Later agri migrations (Tasks 7–9) are applied the same way.

- [ ] **Step 1: Try the Supabase CLI path**

Run: `npx supabase --version`, then `npx supabase login` status. If a session exists:

```powershell
npx supabase link --project-ref hgvnrjbdklvxufrmdius
npx supabase db push
```

- [ ] **Step 2: Fallback — concatenate migrations for manual paste**

If the CLI is not authenticated (likely — it needs an access token and DB password the user hasn't provided), write `scripts/concat-migrations.mjs`:

```js
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const combined = files
  .map((f) => `-- ===== ${f} =====\n` + readFileSync(`${dir}/${f}`, "utf8"))
  .join("\n\n");
writeFileSync("supabase/combined.sql", combined);
console.log(`Wrote supabase/combined.sql (${files.length} migrations)`);
```

Run: `node scripts/concat-migrations.mjs` → hand `supabase/combined.sql` to the user to paste in the Supabase SQL editor, and PAUSE the plan until they confirm. (Ask the user which path; they may prefer to run `npx supabase login` themselves.)

- [ ] **Step 3: Verify schema landed**

Query PostgREST with the service key (read from `.env.local`, do not print it):

```powershell
# expect JSON [] (empty table) not an error
Invoke-RestMethod -Uri "https://hgvnrjbdklvxufrmdius.supabase.co/rest/v1/broadcasts?select=id&limit=1" -Headers @{apikey=$svc; Authorization="Bearer $svc"}
```

Expected: `[]` (HTTP 200). An error like `relation ... does not exist` means migrations didn't apply.

- [ ] **Step 4: Commit**

```powershell
git add scripts/concat-migrations.mjs supabase/combined.sql; git commit -m "chore: add migration concat script and combined schema"
```

---

### Task 5: Theme restyle — cream/teal light mode with purple charts

**Files:**
- Modify: `src/app/globals.css` (MODE + ACCENT token blocks)
- Modify: `src/app/layout.tsx` (default `data-mode` to `light`, `data-theme` to the new `teal` accent — find the boot script that replays saved mode/accent)

**Interfaces:**
- Produces: Tailwind utilities (`bg-background`, `bg-card`, `bg-sidebar`, `text-primary`, `--chart-1..5`) now resolve to the image-2 palette. Every page inherits it with no per-page work.

- [ ] **Step 1: Read the existing `:root` / mode / accent blocks in `globals.css`** to copy their exact variable list, then override the LIGHT mode block with the cream palette and add a `teal` ACCENT block. Target values:

```css
/* MODE light — warm cream surfaces (image 2) */
[data-mode="light"] {
  --background: oklch(0.97 0.02 95);        /* warm cream #faf7ec-ish */
  --foreground: oklch(0.25 0.02 180);
  --card: oklch(1 0 0);                      /* white cards */
  --card-2: oklch(0.985 0.01 95);
  --border: oklch(0.92 0.01 95);
  --muted: oklch(0.95 0.015 95);
  --muted-foreground: oklch(0.5 0.02 180);
  --sidebar: oklch(0.32 0.06 180);           /* dark teal/green rail */
  --sidebar-foreground: oklch(0.97 0.01 95);
  --sidebar-border: oklch(0.38 0.05 180);
  --sidebar-accent: oklch(0.4 0.06 180);
  --sidebar-accent-foreground: oklch(1 0 0);
  --chart-2: oklch(0.72 0.12 300);           /* lilac/purple (image 2 donut) */
  --chart-3: oklch(0.85 0.06 300);
  --radius: 0.75rem;
}
/* ACCENT teal — primary buttons (image 2 "Broadcast" button) */
[data-theme="teal"] {
  --primary: oklch(0.45 0.08 190);
  --primary-foreground: oklch(1 0 0);
  --primary-hover: oklch(0.4 0.08 190);
  --primary-soft: oklch(0.9 0.04 190);
  --primary-soft-2: oklch(0.95 0.02 190);
  --ring: oklch(0.45 0.08 190);
  --chart-1: oklch(0.72 0.12 300);
  --sidebar-primary: oklch(0.55 0.09 190);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-ring: oklch(0.55 0.09 190);
}
```

Keep the variable NAMES identical to the existing blocks — only values change. Match any additional variables the real file defines (check before writing; the list above may be incomplete).

- [ ] **Step 2: Default new visitors to light + teal** in `layout.tsx`'s boot script (and wherever the default is duplicated, e.g. a theme provider): fallback mode `"light"`, fallback theme `"teal"`.

- [ ] **Step 3: Visual check**

Run: `npm run dev`, open `http://localhost:3000/login`, screenshot with Playwright MCP.
Expected: cream background, white card, teal button.

- [ ] **Step 4: typecheck + test + commit**

```powershell
npm run typecheck; npm test
git add -A; git commit -m "feat: cream/teal theme matching reference design"
```

---

### Task 6: Sidebar — labeled nav with agri entries (image-1 layout)

**Files:**
- Modify: `src/components/layout/sidebar.tsx` (`navItems` array + label rendering)
- Modify: `messages/en.json` (add `appointments`, `inventory`, `catalog` nav labels)

**Interfaces:**
- Consumes: existing `NavItem { href, labelKey, icon }` shape in `sidebar.tsx`.
- Produces: routes `/appointments`, `/inventory`, `/catalog` in nav — pages arrive in Tasks 7–9 (nav will 404 until then; acceptable inside the same working session, or reorder: add each nav item within its module task if executing with subagents. DECISION: add each nav item in its own module task; THIS task only ensures labels always render (image-1 style) and nav order is Dashboard, Inbox, Contacts, Pipelines, Broadcasts, Automations, Flows, AI Agents, Appointments, Inventory, Catalog, Notifications, Settings).

- [ ] **Step 1: Ensure labels always visible.** wacrm's sidebar already renders `{t(item.labelKey)}` per row; if it has a collapsed/icon-only default, set expanded as default. Reorder `navItems` per the order above (agri items added later).

- [ ] **Step 2: Visual check** — dev server, screenshot `/dashboard`: dark-teal sidebar, labeled rows.

- [ ] **Step 3: Commit**

```powershell
git add -A; git commit -m "feat: labeled sidebar nav ordering"
```

---

### Task 7: Inventory module (parts)

**Files:**
- Create: `supabase/migrations/037_parts.sql`
- Create: `src/app/api/parts/route.ts`, `src/app/api/parts/[id]/route.ts`
- Create: `src/app/(dashboard)/inventory/page.tsx`
- Create: `src/lib/parts/queries.ts`, Test: `src/lib/parts/queries.test.ts`
- Modify: `src/components/layout/sidebar.tsx` (add `{ href: "/inventory", labelKey: "inventory", icon: Package }`), `messages/en.json` (`"inventory": "Inventory"`)

**Interfaces:**
- Produces: `Part` type `{ id: string; part_number: string; part_name: string | null; category: string | null; price: number | null; stock_qty: number; model_compatibility: string[] | null; updated_at: string }`; `listParts(supabase, { search?: string }): Promise<Part[]>`; `upsertPart(supabase, part: Omit<Part,'id'|'updated_at'> & { id?: string }): Promise<Part>` in `src/lib/parts/queries.ts`.

- [ ] **Step 1: Migration `037_parts.sql`** — port from SMS-2 CRM but account-scope it like wacrm's other tables (copy the ownership/RLS pattern from `supabase/migrations/001_initial_schema.sql`'s `contacts` table verbatim — same `user_id` column + policies):

```sql
create table if not exists parts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  part_number text not null,
  part_name text,
  model_compatibility text[],
  category text,
  price numeric,
  stock_qty integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, part_number)
);
alter table parts enable row level security;
-- copy the exact policy shape used for contacts in 001 (incl. account-sharing
-- helper functions if contacts' policies use them) targeting table parts
```

Drop the Telugu column (`part_name_telugu`) — not in scope for the rebuilt CRM.

- [ ] **Step 2: Write failing test `src/lib/parts/queries.test.ts`** — follow the mocking style of an existing lib test (e.g. `src/lib/inbox/conversations.test.ts`): mock the Supabase client, assert `listParts` queries table `parts` ordered by `part_number` and `upsertPart` upserts on `user_id,part_number`. Run `npx vitest run src/lib/parts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/parts/queries.ts`** minimal to pass, mirroring wacrm's query helpers (typed `SupabaseClient`, `.throwOnError()` if that's the local idiom — copy from `src/lib/dashboard/queries.ts`).

- [ ] **Step 4: Run test → PASS.** `npx vitest run src/lib/parts`

- [ ] **Step 5: API routes.** `GET /api/parts` (list, `?search=`), `POST /api/parts` (create), `PATCH/DELETE /api/parts/[id]`. Copy auth/session boilerplate from `src/app/api/quick-replies/route.ts` (nearest simple CRUD route) and delegate to `src/lib/parts/queries.ts`.

- [ ] **Step 6: Page `src/app/(dashboard)/inventory/page.tsx`.** Client page: search input + table (columns: Part #, Name, Category, Price, Stock, Compatibility) + "Add part" dialog. Reuse `src/components/ui` table/dialog/input/button primitives exactly as `src/app/(dashboard)/contacts/page.tsx` does. Stock ≤ 5 renders a red badge ("Low").

- [ ] **Step 7: Nav + i18n.** Add sidebar item and `en.json` label.

- [ ] **Step 8: Apply migration to Supabase** (same path as Task 4 — CLI push or hand SQL to user). Verify: `GET /rest/v1/parts?limit=1` with service key → `[]`.

- [ ] **Step 9: Verify + commit.** `npm run typecheck; npm test`; dev-server screenshot of `/inventory`; then

```powershell
git add -A; git commit -m "feat: inventory (parts) module"
```

---

### Task 8: Appointments module

**Files:**
- Create: `supabase/migrations/038_appointments.sql`
- Create: `src/app/api/appointments/route.ts`, `src/app/api/appointments/[id]/route.ts`
- Create: `src/app/(dashboard)/appointments/page.tsx`
- Create: `src/lib/appointments/queries.ts`, Test: `src/lib/appointments/queries.test.ts`
- Modify: `src/components/layout/sidebar.tsx` (`{ href: "/appointments", labelKey: "appointments", icon: CalendarDays }`), `messages/en.json`

**Interfaces:**
- Produces: `Appointment { id: string; user_id: string; contact_id: string | null; phone: string; customer_name: string | null; requested_time: string; status: "booked" | "completed" | "no_show" | "cancelled"; created_at: string }`; `listAppointments(supabase, { from?: string; to?: string; status?: Appointment["status"] }): Promise<Appointment[]>`; `setAppointmentStatus(supabase, id: string, status: Appointment["status"]): Promise<void>` in `src/lib/appointments/queries.ts`.

- [ ] **Step 1: Migration `038_appointments.sql`** — SMS-2 schema plus `user_id` scoping and an optional link to wacrm contacts:

```sql
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  phone text not null,
  customer_name text,
  requested_time timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked','completed','no_show','cancelled')),
  created_at timestamptz not null default now()
);
alter table appointments enable row level security;
-- copy contacts' RLS policy shape from 001 targeting appointments
create index appointments_user_time_idx on appointments (user_id, requested_time);
```

- [ ] **Step 2–4: TDD the queries lib** (same cycle as Task 7 Steps 2–4): failing test → implement → pass. Tests: `listAppointments` filters by `requested_time` range and status; `setAppointmentStatus` updates the row.

- [ ] **Step 5: API routes** — CRUD, copied boilerplate as in Task 7 Step 5.

- [ ] **Step 6: Page** — list view grouped by day (Today / Tomorrow / date headers), status badge with inline status-change menu (Base UI menu, as used in pipelines/deal cards), "New appointment" dialog (phone, name, datetime-local input).

- [ ] **Step 7: Nav + i18n; Step 8: apply migration + PostgREST check; Step 9: typecheck/test/screenshot/commit** (`feat: appointments module`).

---

### Task 9: Catalog module (tractor models)

**Files:**
- Create: `supabase/migrations/039_catalog_models.sql`
- Create: `src/app/api/catalog-models/route.ts`, `src/app/api/catalog-models/[id]/route.ts`
- Create: `src/app/(dashboard)/catalog/page.tsx`
- Create: `src/lib/catalog/queries.ts`, Test: `src/lib/catalog/queries.test.ts`
- Modify: `src/components/layout/sidebar.tsx` (`{ href: "/catalog", labelKey: "catalog", icon: Tractor }` — lucide has `Tractor`; if the installed version lacks it use `Truck`), `messages/en.json`

**Interfaces:**
- Produces: `CatalogModel { id: string; user_id: string; model_name: string; type: "tractor" | "harvester"; hp: number | null; price_min: number | null; price_max: number | null; features: string | null }`; `listModels(supabase): Promise<CatalogModel[]>`; `upsertModel(...)` in `src/lib/catalog/queries.ts`.

- [ ] **Step 1: Migration `039_catalog_models.sql`**

```sql
create table if not exists catalog_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_name text not null,
  type text not null check (type in ('tractor','harvester')),
  hp integer,
  price_min numeric,
  price_max numeric,
  features text,
  created_at timestamptz not null default now()
);
alter table catalog_models enable row level security;
-- copy contacts' RLS policy shape from 001 targeting catalog_models
```

(Telugu features column dropped, same rationale as Task 7.)

- [ ] **Steps 2–4: TDD queries lib** (list ordered by `model_name`; upsert). Same cycle as Task 7.

- [ ] **Step 5: API routes** (CRUD). **Step 6: Page** — card grid (white cards on cream, image-2 card style): model name, type chip, HP, price range formatted `₹X – ₹Y`, features text; "Add model" dialog.

- [ ] **Step 7–9: Nav/i18n, apply migration + check, typecheck/test/screenshot, commit** (`feat: tractor catalog module`).

---

### Task 10: Broadcast detail page — image-2 analytics layout

**Files:**
- Modify: `src/app/(dashboard)/broadcasts/[id]/page.tsx`
- Create: `src/components/broadcasts/stat-tabs.tsx`, `src/components/broadcasts/clicked-donut.tsx`
- Modify: `messages/en.json` (labels: `overview`, `read`, `clicked`→ omit clicked (no click tracking in schema — see note), `replied`, `failed`, `smartSegregation`, `reBroadcast`)

**Note on "Clicked":** wacrm's schema has sent/delivered/read/replied/failed but NO link-click tracking. Adding click tracking (a redirect/shortener + per-recipient click rows) is out of scope for this plan — the stat-tab row shows Overview / Sent / Read / Replied / Failed, and the donut charts Read-rate instead of Clicked. If the user wants true click tracking, that's a follow-up plan.

**Interfaces:**
- Consumes: `Broadcast` type (`total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count` — `src/types/index.ts:384`); existing recipients query on the detail page.
- Produces: `<StatTabs broadcast={Broadcast} active={key} onSelect={(key)=>void} />` where `key ∈ "overview"|"sent"|"read"|"replied"|"failed"`; `<ClickedDonut value={number} total={number} label={string} />`.

- [ ] **Step 1: `stat-tabs.tsx`** — horizontal row of stat tabs, each: `%` big, `(count)` muted, icon + label under, active tab gets a purple underline (image 2):

```tsx
const TABS = [
  { key: "overview", label: "Overview", value: (b: Broadcast) => b.total_recipients, pct: () => 100 },
  { key: "sent",     label: "Sent",     value: (b) => b.sent_count,    pct: (b) => rate(b.sent_count, b.total_recipients) },
  { key: "read",     label: "Read",     value: (b) => b.read_count,    pct: (b) => rate(b.read_count, b.sent_count) },
  { key: "replied",  label: "Replied",  value: (b) => b.replied_count, pct: (b) => rate(b.replied_count, b.sent_count) },
  { key: "failed",   label: "Failed",   value: (b) => b.failed_count,  pct: (b) => rate(b.failed_count, b.total_recipients) },
] as const;
// rate(n, d) = d > 0 ? Math.round((n / d) * 100) : 0
```

- [ ] **Step 2: `clicked-donut.tsx`** — recharts `PieChart` donut, filled arc `var(--chart-1)` (purple), track `var(--chart-3)`, centered label. recharts is already a dependency.

- [ ] **Step 3: Rework `broadcasts/[id]/page.tsx`** — header: back arrow + broadcast name; StatTabs under it; left column: template preview card (already exists — restyle only); right: "Smart Segregation" card = heading, audience line ("`<label>` by N contacts"), Cancel + **Broadcast** (primary teal) buttons, and the recipients table filtered by the active tab (recipients already load on this page; filter client-side on recipient status). Checkbox column selects rows; **Broadcast** opens `/broadcasts/new` prefilled with the selected contact ids via querystring `?contacts=id1,id2` (extend `new/page.tsx` to read it).

- [ ] **Step 4: Tests + visual check** — `npm run typecheck; npm test`; dev server: create a dry-run broadcast (WHATSAPP_TEMPLATES_DRY_RUN=true) or seed a broadcast row via service key, screenshot `/broadcasts/[id]`, compare to image 2.

- [ ] **Step 5: Commit** — `feat: broadcast analytics detail page (stat tabs, donut, re-target)`.

---

### Task 11: Seed WhatsApp config + webhook verification

**Files:**
- Create: `scripts/seed-whatsapp-config.ts`

**Interfaces:**
- Consumes: `encrypt()` from wacrm's crypto lib (find at `src/lib/crypto*` — same module the webhook's `decrypt` imports), `SEED_*` vars from `.env.local`, the `whatsapp_config` table (see migration `013`/`015` for exact columns).
- Produces: a configured WhatsApp connection for the owner account.

- [ ] **Step 1: Create the owner account** — `npm run dev`, sign up via `/signup` (Playwright MCP) with a user-chosen email/password (ask user, or use a placeholder they can change: document what was used).

- [ ] **Step 2: Write `scripts/seed-whatsapp-config.ts`** — loads `.env.local` (dotenv), creates a service-role Supabase client, looks up the sole user id from `auth.users`, and upserts into `whatsapp_config` with `phone_number_id = SEED_WHATSAPP_PHONE_NUMBER_ID`, `access_token = encrypt(SEED_WHATSAPP_ACCESS_TOKEN)`, `verify_token = encrypt(SEED_WHATSAPP_VERIFY_TOKEN)` — match column names to the actual table (read migrations 001/013/015 first). Run with `npx tsx scripts/seed-whatsapp-config.ts`.

- [ ] **Step 3: Verify the webhook handshake**

```powershell
Invoke-RestMethod "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN - see .env.local>&hub.challenge=12345"
```

Expected: response body `12345`. (Inbound POSTs stay 401 until the user supplies META_APP_SECRET — expected, do not chase.)

- [ ] **Step 4: Check Settings → WhatsApp in the UI** shows the connected phone number id.

- [ ] **Step 5: Commit** — `feat: whatsapp config seed script` (script only; secrets stay in `.env.local`).

---

### Task 12: Final verification sweep

**Files:** none new.

- [ ] **Step 1:** `npm run typecheck` → 0 errors. `npm test` → all pass. `npm run build` → succeeds.
- [ ] **Step 2:** Dev server: click through every sidebar page (Dashboard, Inbox, Contacts, Pipelines, Broadcasts, Automations, Flows, AI Agents, Appointments, Inventory, Catalog, Notifications, Settings) — no runtime errors in terminal or browser console.
- [ ] **Step 3:** Screenshots: `/dashboard`, `/broadcasts/[id]`, `/inventory` — palette check against reference images.
- [ ] **Step 4:** `git log --oneline` sanity; `Grep` the repo for the token prefix `EAAT`, the service-role key prefix, and `<WHATSAPP_VERIFY_TOKEN - see .env.local>` — zero hits outside `.env.local`.
- [ ] **Step 5:** Final commit if anything changed; report results to the user with the screenshots.
