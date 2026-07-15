# Broadcast Redesign — Architecture

**Goal:** a non-technical user picks a message, picks a district (and
optionally a mandal), and sends — safely, in Indian Rupees, never
sending the same message to the same customer twice, and automatically
looping within WhatsApp's 250-messages-per-day limit.

## 1. What exists today (findings from the code)

| Area | Current state | Verdict |
|---|---|---|
| Sending | **Runs client-side** in `use-broadcast-sending.ts`: the browser resolves the audience, inserts recipients, and loops `/api/whatsapp/broadcast` in batches | **Blocker.** The tab must stay open. A 250/day cap that loops across days is impossible. |
| `broadcasts` | `account_id`, `template_name`, `audience_filter` JSONB, `status ∈ (draft, scheduled, sending, sent, failed)` | No `queued`/`paused` state for a multi-day loop. |
| `broadcast_recipients` | `(broadcast_id, contact_id, status)` | **No UNIQUE(broadcast_id, contact_id)** → retries can double-send. |
| Targeting | `audience_filter = { type, tagIds, customField, excludeTagIds, contactIds }` | Tag-first. No district/mandal. |
| District/mandal | Only as tags I created on import (`district:West Godavari`, `mandal:UNDRAJAVARAM`) | Not queryable as fields; can't drive dropdowns. |
| Variables | `resolveVariables` returns `''` for a missing field | **Meta rejects empty parameters** → the send fails. See §5. |
| Audience size | Client does `.in('id', ids)` | PostgREST caps ~1000 rows; 928 contacts today. Fragile as they grow. |
| Precedent to copy | `filter_contacts_by_tags` RPC (server-side paging), `/api/automations/cron`, `/api/flows/cron` | Reuse both patterns. |

**Data reality (measured, 928 contacts):** 100% have a name, 99.9% have
a district, **only 38% (354) have a mandal**. Mandal targeting is only
useful after enrichment (§7).

## 2. Principles

1. **Server owns the send.** The browser starts a campaign; it never
   drives delivery. This is what makes 250/day, looping, scheduling and
   resumption possible.
2. **The DB is the guard-rail.** Uniqueness and quota are enforced in
   Postgres, not in UI logic — a retry, a double-click, or two open tabs
   must not be able to double-send.
3. **District/mandal are first-class fields**, not tags. Tags stay, but
   demoted to an optional advanced filter.
4. **Simple by default.** The wizard's happy path is 3 clicks. Every
   safety feature (dedupe, quota) is on by default and needs no thought.

## 3. Data model changes

```sql
-- 041: district/mandal as first-class, indexed contact fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mandal   TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_account_district ON contacts(account_id, district);
CREATE INDEX IF NOT EXISTS idx_contacts_account_mandal   ON contacts(account_id, mandal);
-- Backfill from the tags written by the Excel import, then the tags
-- remain purely optional labels.

-- 042: broadcast safety + queueing
ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_unique_contact UNIQUE (broadcast_id, contact_id);
-- 'queued'  — accepted, waiting for daily quota
-- 'paused'  — user stopped it
ALTER TABLE broadcasts DROP CONSTRAINT broadcasts_status_check;
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_status_check
  CHECK (status IN ('draft','scheduled','queued','sending','paused','sent','failed'));
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS daily_send_limit INTEGER NOT NULL DEFAULT 250;
-- Index for the quota window count.
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_sent_at ON broadcast_recipients(sent_at);
```

`audience_filter` JSONB gains the new shape (backwards compatible —
old broadcasts keep working):

```jsonc
{
  "type": "geo",              // 'all' | 'geo' | 'tags' | 'manual'
  "districts": ["West Godavari"],
  "mandals": ["Tadepalligudem", "Tanuku"],   // optional; empty = whole district
  "tagIds": [],               // optional advanced filter (AND with geo)
  "excludeTagIds": [],
  "skipAlreadySent": true     // §4
}
```

## 4. Never send the same message twice

**DECIDED: scope = within the same campaign only.**

`UNIQUE (broadcast_id, contact_id)` on `broadcast_recipients`. The
recipient insert uses
`upsert(..., { onConflict: 'broadcast_id,contact_id', ignoreDuplicates: true })`,
and the cron claims each recipient atomically (§6). A retry, a refresh,
a double-click, two open tabs, or two overlapping cron runs physically
cannot send a contact the same campaign twice — the database refuses it.

**Explicitly out of scope (by decision):** cross-campaign suppression.
Re-running `harvester_promo_te` next month *will* reach people who
already got it — that's intentional, so a seasonal promo can be re-sent.
If "never repeat a template, ever" is wanted later, it's an additive
`NOT EXISTS` on (account_id, template_name) at audience-resolution time
plus a wizard checkbox; no schema change needed.

## 5. `{{1}}` = customer name — and the empty-value trap

Requested: *"{{1}} name from the contact database; if there is no name
should be blank."*

**This will fail.** WhatsApp rejects template parameters that are empty,
and parameters may not contain newlines/tabs or >4 consecutive spaces
([Meta error codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes),
[template guidelines](https://support.wati.io/en/articles/11463458-whatsapp-template-message-guidelines-naming-formatting-and-translations)).
A blank `{{1}}` returns an error and that recipient's send fails.

**Design:** a `field` variable gains a required fallback used when the
value is missing/blank, plus sanitisation (collapse whitespace, strip
newlines/tabs) so a messy imported name can't break a send.

```ts
{ type: 'field', value: 'name', fallback: 'రైతు గారు' }  // te
{ type: 'field', value: 'name', fallback: 'Sir/Madam' }  // en
```

Today all 928 contacts have a name, so the fallback is a safety net —
but it must exist before the first nameless contact is added.
*(Fallback wording is your call — see the question at the end.)*

## 6. 250/day cap + automatic looping

WhatsApp limits business-initiated conversations per rolling 24h (new
numbers start at 250). Architecture:

```
Wizard (browser)                 Server                        Cron (every 15 min)
─────────────────                ──────                        ───────────────────
POST /api/broadcasts   ─────►    resolve audience (RPC)
  {template, geo, ...}           insert recipients (pending)
                                 status = 'queued'
                                 return immediately ──────►  browser can close ✅

                                                              /api/broadcasts/cron
                                                              ├─ quota = 250 − sent(24h)
                                                              ├─ claim next N pending
                                                              ├─ send via Meta
                                                              └─ all done? → 'sent'
                                                                 else stays 'queued'
```

- **Quota**: `SELECT count(*) FROM broadcast_recipients r JOIN broadcasts b … WHERE b.account_id = ? AND r.sent_at > now() - interval '24 hours'`. Rolling window, account-wide — so two campaigns can't jointly exceed 250.
- **Claim**: `UPDATE … SET status='sending' WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT quota)` — an atomic claim, so two overlapping cron runs never grab the same recipient. Mirrors `claim_ai_reply_slot`.
- **Loop**: leftover recipients simply stay `pending`; the next cron run picks them up when quota frees. 900 contacts ≈ 4 days, fully automatic.
- **`daily_send_limit` is a column** (default 250) so it's raised to 1k/10k/unlimited as Meta upgrades the number — no redeploy.
- Vercel cron entry in `vercel.json`, guarded by the same secret the existing crons use.

**This replaces the client-side send loop.** `use-broadcast-sending.ts`
shrinks to "POST and show progress".

## 7. Mandal coverage (data gap)

Only 354/928 contacts have a mandal. Enrich before mandal targeting is
useful, from sources already on disk:
- `SRI MANIKANTA (1).xlsx` — has `Tehsil` (= mandal) + `Village` + `Mobile_No`
- `OLD CUSTOMER LIST 2.xlsx` — per-mandal sheets + `Customer Address`
Match on normalised phone, then `normalizeMandal()` (from the geo
reference module) to canonicalise spellings.

## 8. UI — "easy for a non-technical user"

Wizard, 3 steps (down from 4):

1. **Choose message** — cards showing the template's real preview
   (image + text + buttons), filtered to Approved only.
2. **Choose who** — big radio: `All customers` / `By district & mandal`
   (default) / `Advanced (tags)`. District dropdown → mandal dropdown
   (multi-select, "All mandals" default). Live count: *"Sending to 213
   customers in West Godavari · Tadepalligudem"*.
   ☑ Skip customers who already got this message.
3. **Review & send** — rendered preview with a real customer's name
   substituted, the recipient count, and the honest delivery estimate:
   *"213 customers · 250/day limit · all delivered today"* or
   *"900 customers · sends over 4 days automatically"*.

Currency: account setting → **INR (₹)**.

## 9. Build order

1. `src/lib/geo/ap-districts.ts` — 26 new AP districts + mandal
   normalisation *(in progress)*.
2. Migration 041 + backfill district/mandal from tags.
3. Migration 042 (unique constraint, statuses, `daily_send_limit`).
4. `resolve_broadcast_audience` RPC (geo + tags + suppression + count).
5. `POST /api/broadcasts` (create + queue) and
   `/api/broadcasts/cron` (quota, claim, send, complete).
6. Rewrite `use-broadcast-sending` → thin client.
7. Wizard step 2 rebuild (dropdowns) + step 3 preview/estimate.
8. Variable fallback + sanitisation.
9. Mandal enrichment from the other spreadsheets.
10. INR currency.

## 10. Risks

- **Migration 042's status CHECK** must be applied before any code
  writes `queued`, or inserts fail. Ship SQL first.
- **Cron secret** must be set on Vercel or the endpoint is either open
  or dead.
- **Meta's real limit** may differ from 250 (it's per-number and tiers
  up automatically). The column makes this adjustable; we should also
  read the actual tier from the WABA when available rather than trusting
  a hard-coded 250.
- **Suppression is per template_name**: renaming a template resets its
  memory. Acceptable, but worth knowing.
