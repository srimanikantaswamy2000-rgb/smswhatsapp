import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConversationContext } from './context'

/** Minimal fake matching the query chain in buildConversationContext:
 *  from().select().eq().in().order().limit() → { data, error }. */
function fakeDb(rows: unknown[]): SupabaseClient {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return chain as unknown as SupabaseClient
}

describe('buildConversationContext', () => {
  it('maps sender_type to role and returns chronological order', async () => {
    // DB returns newest-first (created_at DESC); the fn reverses it.
    const rows = [
      { sender_type: 'customer', content_text: 'third' },
      { sender_type: 'agent', content_text: 'second' },
      { sender_type: 'customer', content_text: 'first' },
    ]
    const out = await buildConversationContext(fakeDb(rows), 'conv-1')
    expect(out).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
    ])
  })

  it('treats bot messages as assistant', async () => {
    const out = await buildConversationContext(
      fakeDb([{ sender_type: 'bot', content_text: 'auto reply' }]),
      'conv-1',
    )
    expect(out).toEqual([{ role: 'assistant', content: 'auto reply' }])
  })

  it('drops empty / whitespace-only messages', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_text: '   ' },
        { sender_type: 'customer', content_text: null },
        { sender_type: 'customer', content_text: 'real' },
      ]),
      'conv-1',
    )
    expect(out).toEqual([{ role: 'user', content: 'real' }])
  })

  it('renders customer photos as placeholder turns without a resolver', async () => {
    const out = await buildConversationContext(
      fakeDb([
        {
          sender_type: 'customer',
          content_type: 'image',
          content_text: null,
          media_url: '/api/whatsapp/media/m1',
        },
      ]),
      'conv-1',
    )
    expect(out).toEqual([{ role: 'user', content: '[the customer sent a photo]' }])
  })

  it('resolves only the latest customer photo to a data URL', async () => {
    // Newest-first rows: photo m2 is the latest.
    const rows = [
      { sender_type: 'customer', content_type: 'image', content_text: 'this part', media_url: '/api/whatsapp/media/m2' },
      { sender_type: 'customer', content_type: 'image', content_text: null, media_url: '/api/whatsapp/media/m1' },
    ]
    const resolved: string[] = []
    const out = await buildConversationContext(
      fakeDb(rows),
      'conv-1',
      50,
      async (url) => {
        resolved.push(url)
        return 'data:image/jpeg;base64,AAA'
      },
    )
    expect(resolved).toEqual(['/api/whatsapp/media/m2'])
    expect(out[0].imageDataUrl).toBeUndefined()
    expect(out[1]).toEqual({
      role: 'user',
      content: '[photo attached] this part',
      imageDataUrl: 'data:image/jpeg;base64,AAA',
    })
  })
})
