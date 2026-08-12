import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'
import { aiContextMessageLimit } from './defaults'

interface DbMessage {
  sender_type: 'customer' | 'agent' | 'bot'
  content_type: 'text' | 'image' | 'interactive'
  content_text: string | null
  media_url: string | null
}

/**
 * Fetch the last N text/image/interactive messages of a conversation and
 * map them to the provider-neutral chat shape. Customer messages become
 * `user`; agent and bot messages become `assistant`. Other message kinds
 * (templates, audio) are excluded — they carry no text to model.
 *
 * `interactive` MUST be included. A customer who only ever taps menu
 * buttons produces nothing but interactive rows, so excluding them left
 * the transcript with assistant turns and no user turn at all. Given a
 * system prompt and nothing to answer, the model replied to the prompt
 * itself — "I understand. I am ready to assist customers…" was sent to
 * a real customer on 12 Aug 2026. The button label is the customer's
 * actual message; it belongs in the transcript.
 *
 * Customer photos appear as a `[photo]` placeholder turn; when
 * `resolveImage` is provided, the LATEST customer photo is resolved to
 * a base64 data URL so a vision model can look at it (used for spare
 * part identification). Only one image is resolved to bound tokens.
 *
 * Ordered oldest-first (chronological) so the transcript reads
 * naturally and the most recent customer message lands last.
 */
export async function buildConversationContext(
  db: SupabaseClient,
  conversationId: string,
  limit: number = aiContextMessageLimit(),
  resolveImage?: (mediaUrl: string) => Promise<string | null>,
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_type, content_text, media_url')
    .eq('conversation_id', conversationId)
    .in('content_type', ['text', 'image', 'interactive'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const rows = ((data ?? []) as DbMessage[]).reverse()
  const out: ChatMessage[] = []
  for (const m of rows) {
    const role = m.sender_type === 'customer' ? 'user' : 'assistant'
    if (m.content_type === 'image') {
      out.push({
        role,
        content: m.content_text?.trim()
          ? `[photo attached] ${m.content_text.trim()}`
          : role === 'user'
            ? '[the customer sent a photo]'
            : '[photo sent]',
        // Stash the proxy path; resolved to a data URL below for the
        // latest customer photo only.
        imageDataUrl: role === 'user' ? (m.media_url ?? undefined) : undefined,
      })
    } else if (m.content_text && m.content_text.trim()) {
      out.push({ role, content: m.content_text.trim() })
    }
  }

  // Resolve the newest customer photo to a data URL; strip the field
  // from every other turn so providers never see a raw proxy path.
  let resolved = false
  for (let i = out.length - 1; i >= 0; i--) {
    const turn = out[i]
    if (!turn.imageDataUrl) continue
    if (!resolved && resolveImage) {
      const dataUrl = await resolveImage(turn.imageDataUrl).catch(() => null)
      if (dataUrl) {
        turn.imageDataUrl = dataUrl
        resolved = true
        continue
      }
    }
    delete turn.imageDataUrl
  }

  return out
}
