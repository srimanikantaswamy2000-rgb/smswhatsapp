import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import { engineSendText, engineSendMedia } from '@/lib/flows/meta-send'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import {
  parseMediaDirectives,
  detectReplyLanguage,
  resolveMediaForSend,
} from './media'
import { parseVisitDirective } from './visit'
import {
  extractPartTokens,
  searchParts,
  buildPartsBlock,
  parseOrderDirectives,
} from './parts'

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const { accountId, conversationId, contactId, configOwnerUserId } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config || !config.autoReplyEnabled) return

    // Deterministic, user-configured responders win over the LLM — the
    // caller already excludes messages a Flow consumed. Message-level
    // automations (`new_message_received` / `keyword_match`) are
    // dispatched independently for this same inbound and may send their
    // own reply, so if the account has any active one we stand down to
    // avoid double-texting the customer. (Relationship triggers like
    // `first_inbound_message` don't count — they're not per-message
    // auto-responders.)
    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1)
    if (autoResponders && autoResponders.length > 0) return

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) return
    if (conv.assigned_agent_id) return // a human owns this thread
    if (conv.ai_autoreply_disabled) return // handed off / turned off here
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) return

    // Resolve the latest customer photo (if any) so the vision model
    // can look at it — customers photograph spare parts and machines.
    // Lazy: the token is only fetched when a photo actually needs
    // resolving. Any failure degrades to the text placeholder.
    const resolveImage = async (mediaUrl: string): Promise<string | null> => {
      try {
        const mediaId = mediaUrl.match(/\/api\/whatsapp\/media\/(.+)$/)?.[1]
        if (!mediaId) return null
        const { data: waCfg } = await db
          .from('whatsapp_config')
          .select('access_token')
          .eq('account_id', accountId)
          .limit(1)
          .maybeSingle()
        if (!waCfg?.access_token) return null
        const accessToken = decrypt(waCfg.access_token)
        const { url } = await getMediaUrl({ mediaId, accessToken })
        const { buffer, contentType } = await downloadMedia({
          downloadUrl: url,
          accessToken,
        })
        if (buffer.length > 4 * 1024 * 1024) return null // bound the payload
        if (!contentType.startsWith('image/')) return null
        return `data:${contentType};base64,${buffer.toString('base64')}`
      } catch (err) {
        console.error('[ai auto-reply] image resolve failed:', err)
        return null
      }
    }

    const messages = await buildConversationContext(
      db,
      conversationId,
      undefined,
      resolveImage,
    )
    if (messages.length === 0) return

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages),
    )

    let systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    })

    // Spare-parts grounding: if the recent customer text mentions
    // anything catalogue-shaped, inject the matching genuine-part rows
    // so the model quotes real part numbers and can place an
    // `[[ORDER:...]]`. Best-effort — a search failure must not block
    // the reply.
    try {
      const recentCustomerText = messages
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => m.content)
        .join('\n')
      const partMatches = await searchParts(
        db,
        configOwnerUserId,
        extractPartTokens(recentCustomerText),
      )
      if (partMatches.length > 0) {
        systemPrompt += `\n\n${buildPartsBlock(partMatches)}`
      }
    } catch (err) {
      console.error('[ai auto-reply] parts search failed:', err)
    }

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    })

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a short internal note so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      }
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await db.from('conversations').update(update).eq('id', conversationId)
      return
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return // lost the per-conversation cap race

    // Split any `[[MEDIA:id]]` directives out of the customer-facing
    // text. The stripped text is what we send; the ids drive follow-up
    // media messages below.
    const { cleanedText: textAfterMedia, mediaIds } = parseMediaDirectives(text)

    // `[[VISIT:...]]` — the customer agreed on a showroom-visit/demo
    // slot; book it as an appointment. Best-effort: a booking failure
    // must never block the reply itself.
    const { cleanedText: textAfterVisit, requestedTimeIso } =
      parseVisitDirective(textAfterMedia)

    // `[[ORDER:...]]` — the customer confirmed a spare-part order.
    // Record it and ping the spare-parts team. Best-effort, like the
    // visit booking.
    const { cleanedText, orders } = parseOrderDirectives(textAfterVisit)
    if (orders.length > 0) {
      try {
        const { data: orderContact } = await db
          .from('contacts')
          .select('phone, name')
          .eq('id', contactId)
          .maybeSingle()
        for (const order of orders) {
          const { data: inserted, error: orderErr } = await db
            .from('part_orders')
            .insert({
              user_id: configOwnerUserId,
              contact_id: contactId,
              conversation_id: conversationId,
              part_number: order.partNumber,
              part_name: order.partName,
              qty: order.qty,
              customer_phone: orderContact?.phone ?? null,
              customer_name: orderContact?.name ?? null,
              team_notified_at: new Date().toISOString(),
            })
            .select('order_no')
            .single()
          if (orderErr || !inserted) {
            console.error('[ai auto-reply] part order insert failed:', orderErr)
            continue
          }
          await notifyPartsTeam(db, {
            accountId,
            configOwnerUserId,
            orderNo: inserted.order_no as number,
            order,
            customerName: orderContact?.name ?? null,
            customerPhone: orderContact?.phone ?? null,
            conversationId,
            contactId,
          })
        }
      } catch (err) {
        console.error('[ai auto-reply] part order handling failed:', err)
      }
    }
    if (requestedTimeIso) {
      try {
        const { data: visitContact } = await db
          .from('contacts')
          .select('phone, name')
          .eq('id', contactId)
          .maybeSingle()
        if (visitContact?.phone) {
          await db.from('appointments').insert({
            user_id: configOwnerUserId,
            contact_id: contactId,
            phone: visitContact.phone,
            customer_name: visitContact.name ?? null,
            requested_time: requestedTimeIso,
            status: 'booked',
          })
          await db.from('notifications').insert({
            account_id: accountId,
            user_id: configOwnerUserId,
            type: 'conversation_assigned',
            conversation_id: conversationId,
            contact_id: contactId,
            title: 'AI booked a showroom visit',
            body: `${visitContact.name ?? visitContact.phone} — ${requestedTimeIso.replace('T', ' ').slice(0, 16)} IST`,
          })
        }
      } catch (err) {
        console.error('[ai auto-reply] visit booking failed:', err)
      }
    }

    if (cleanedText) {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: cleanedText,
        aiGenerated: true,
      })
    }

    // Share the product media the assistant attached. Best-effort: a
    // failed media send (bad URL, Meta hiccup) must never throw — the
    // text reply already landed, and the whole method is contractually
    // non-throwing. Requires a public base URL Meta can fetch from
    // (unset on localhost → media is skipped, text still sends).
    if (mediaIds.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      if (baseUrl) {
        const lang = detectReplyLanguage(cleanedText || text)

        // Never send the same photo twice in one conversation. The model
        // keeps emitting [[MEDIA:mu4501]] on every turn about the MU4501;
        // a prompt rule alone doesn't stop it, so enforce it here: pull
        // the media_urls we've already sent in this thread and skip them.
        const { data: priorMedia } = await db
          .from('messages')
          .select('media_url')
          .eq('conversation_id', conversationId)
          .not('media_url', 'is', null)
        const alreadySent = new Set(
          (priorMedia ?? [])
            .map((m) => (m as { media_url: string | null }).media_url)
            .filter((u): u is string => !!u),
        )

        // Applies to photos AND videos: each media file goes out at most
        // once per conversation. A different product's media has
        // different URLs, so asking about a new machine still sends its
        // photos/video.
        const toSend = resolveMediaForSend(mediaIds, lang, baseUrl).filter(
          (item) => !alreadySent.has(item.link),
        )

        for (const item of toSend) {
          // Hosted .mp4 clips (public/media/kubota/videos/) go as real
          // WhatsApp video messages; any external link (e.g. a YouTube
          // URL) falls back to text so WhatsApp renders a preview.
          const isHostedFile = item.link.startsWith(baseUrl)
          try {
            if (item.kind === 'image' || (item.kind === 'video' && isHostedFile)) {
              await engineSendMedia({
                accountId,
                userId: configOwnerUserId,
                conversationId,
                contactId,
                kind: item.kind,
                link: item.link,
                caption: item.caption,
              })
            } else {
              await engineSendText({
                accountId,
                userId: configOwnerUserId,
                conversationId,
                contactId,
                text: `${item.caption}\n${item.link}`,
                aiGenerated: true,
              })
            }
          } catch (err) {
            console.error('[ai auto-reply] media send failed:', err)
          }
        }
      } else {
        console.warn(
          '[ai auto-reply] NEXT_PUBLIC_APP_URL not set — skipping media, text reply still sent.',
        )
      }
    }
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}

/** Where new part orders are announced. Defaults to the MD's number. */
const PARTS_TEAM_PHONE = process.env.PARTS_TEAM_PHONE ?? '918500666928'

interface NotifyPartsTeamArgs {
  accountId: string
  configOwnerUserId: string
  orderNo: number
  order: { partNumber: string; partName: string; qty: number }
  customerName: string | null
  customerPhone: string | null
  conversationId: string
  contactId: string
}

/**
 * Tell the spare-parts team about a new order: always a dashboard
 * notification; additionally a WhatsApp text when the team number has
 * an open conversation (Meta only allows free text inside a 24h
 * window). The team replies "OK <no>" / "NO <no>" — handled by the
 * webhook — to resolve it.
 */
async function notifyPartsTeam(
  db: ReturnType<typeof supabaseAdmin>,
  args: NotifyPartsTeamArgs,
): Promise<void> {
  const { accountId, configOwnerUserId, orderNo, order } = args
  const who = args.customerName
    ? `${args.customerName} (${args.customerPhone ?? '—'})`
    : (args.customerPhone ?? 'unknown customer')
  const summary =
    `Parts order #${orderNo}\n` +
    `Customer: ${who}\n` +
    `Part: ${order.partNumber} ${order.partName} × ${order.qty}\n\n` +
    `Reply "OK ${orderNo}" if available, "NO ${orderNo}" if not.`

  try {
    await db.from('notifications').insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      type: 'conversation_assigned',
      conversation_id: args.conversationId,
      contact_id: args.contactId,
      title: `Parts order #${orderNo} — ${order.partNumber} × ${order.qty}`,
      body: summary,
    })
  } catch (err) {
    console.error('[ai auto-reply] parts notification insert failed:', err)
  }

  try {
    const teamDigits = PARTS_TEAM_PHONE.replace(/\D/g, '')
    const { data: teamContact } = await db
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .or(`phone.eq.${teamDigits},phone.eq.+${teamDigits}`)
      .limit(1)
      .maybeSingle()
    if (!teamContact) return
    const { data: teamConv } = await db
      .from('conversations')
      .select('id')
      .eq('contact_id', teamContact.id)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!teamConv) return
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId: teamConv.id,
      contactId: teamContact.id,
      text: `🔧 ${summary}`,
    })
  } catch (err) {
    console.error('[ai auto-reply] parts team WhatsApp ping failed:', err)
  }
}
