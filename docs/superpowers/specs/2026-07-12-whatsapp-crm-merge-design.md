# WhatsApp CRM — wacrm Fork with Agri Modules (Design)

**Date:** 2026-07-12
**Status:** Approved by user
**Target repo:** none for now — local git only (no GitHub account associated; a remote can be added later)

## Goal

Build a WhatsApp CRM by forking [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm),
trimming modules that are not needed, porting the agri-specific modules from the
local SMS-2 CRM project, restyling the UI to a blend of the two reference
screenshots, and wiring WhatsApp Cloud API test credentials. The result lives
in a local git repo; no GitHub remote for now.

## Base & Repo Layout

- Fork wacrm into a **fresh working directory**: `C:\Users\DELL\Documents\whatsapp-crm-test`.
  The existing `SMS-2 CRM` folder is left untouched (used as reference only).
- Fresh git history (`git init`); no remote configured for now.
- Stack is wacrm's: Next.js 16, React 19, Tailwind CSS 4, shadcn/Base UI,
  Supabase (Postgres + Auth), recharts, vitest.

## Modules

### Kept from wacrm
- Shared inbox (single-user), conversations, quick replies
- Contacts: tags, custom fields, CSV import, deduplication
- Broadcasts: Meta-approved templates, delivery/read/click tracking,
  per-recipient variables, re-target ("Smart Segregation") flows
- Sales pipelines (Kanban) with deals linked to conversations
- Automations (no-code visual builder) + WhatsApp Flows
- AI reply assistant: AI drafts, auto-reply bot, knowledge base
  (bring-your-own OpenAI/Anthropic key)
- Dashboard, notifications, settings, auth (login/signup/forgot-password)

### Removed from wacrm
- MCP server (`mcp-server/`, docs, related config)
- Public REST API (`src/app/api/v1/**`) and API-key management UI
- i18n: **kept** (revised with user during planning) — next-intl is wired
  through 75 files and the app ships English-only anyway; removal was all
  churn, no benefit.
- Team accounts: **UI hidden only** (revised with user during planning) —
  invitation/member pages, nav, and API routes removed; DB schema and RLS
  (migrations 017–020, 024) untouched. Auth remains; the app is single-user.

### Ported from SMS-2 CRM (rewritten, not copy-pasted)
- Inventory / parts
- Appointments
- Tractor catalog (incl. catalog feed generation if still relevant)

Ported modules are rewritten in wacrm idioms: shadcn components, wacrm's
Supabase client/query patterns, React 19 conventions. Their tables are added
to the consolidated Supabase migrations.

## UI / UX — Blend of Both Reference Images

- **Layout from image 1 (Runo):** full labeled left sidebar
  (Dashboard, Inbox, Contacts, Pipelines, Broadcasts, Automations,
  Appointments, Inventory, Catalog, Analytics, Settings); top bar with global
  search; three-pane WhatsApp-style inbox (conversation list → chat thread →
  contact detail panel).
- **Palette from image 2:** dark teal/green sidebar; warm cream page
  background; white cards with soft corner radius; teal primary buttons;
  purple/lilac accents for charts.
- **Broadcast detail page** reproduces image 2: stat-tab header with % and
  counts, donut chart (recharts), "Smart Segregation" audience table with
  checkbox rows and a Broadcast re-target button. Note: wacrm tracks
  sent/delivered/read/replied/failed but has no link-click tracking, so the
  tabs are Overview / Sent / Read / Replied / Failed and the donut shows
  read-rate. True click tracking would be a follow-up project.
- The palette/layout is applied consistently app-wide via Tailwind 4 theme
  tokens, not per-page overrides.

## WhatsApp Cloud API Wiring

- Credentials live in `.env.local` only (git-ignored, never committed):
  - `WHATSAPP_PHONE_NUMBER_ID` = test phone id provided by user
  - `WHATSAPP_ACCESS_TOKEN` = system-user token provided by user
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` = `<WHATSAPP_VERIFY_TOKEN - see .env.local>`
  - (exact variable names follow wacrm's `.env.local.example`)
- Webhook endpoint: wacrm's existing `/api/whatsapp/webhook`.
- **Security note:** the system-user token was shared in plaintext chat and
  should be rotated in Meta Business Settings.

## Supabase

- **New, separate Supabase project** (not the one in the local `.env.local`).
- Project provided by user: `https://hgvnrjbdklvxufrmdius.supabase.co`
  (anon + service-role keys supplied; stored in `.env.local` only, never
  committed).
- wacrm's migrations plus the new agri tables are consolidated and applied
  via Supabase CLI (or SQL provided for the user to paste).

## Error Handling & Data Flow

- Follows wacrm's existing patterns: server routes with Supabase RLS,
  webhook signature/verify-token validation, toast-level error surfacing
  (sonner). No new error-handling architecture is introduced.
- Removing team accounts must not break RLS policies: policies that reference
  account membership are simplified to owner-only during migration
  consolidation.

## Verification / Success Criteria

1. `tsc --noEmit` and `vitest run` pass after trimming and porting.
2. App boots with `next dev`; all sidebar pages render without errors.
3. Webhook GET verify handshake succeeds against `<WHATSAPP_VERIFY_TOKEN - see .env.local>`.
4. Broadcast detail page visually matches image 2 (Playwright screenshot
   compared by eye).
5. No secrets in any committed file; `.env.local` git-ignored.
6. All work committed to the local git repo (no remote).

## Out of Scope

- Multi-agent/team features, public API consumers, multi-language UI.
- Production deployment (Vercel) — test/deploy later if requested.
- Rotating the Meta token (user action).
