import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateOpenAi } from './openai'

const OK_BODY = {
  choices: [{ message: { content: 'hello' } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
}

function mockFetchOk() {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(OK_BODY), { status: 200 }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

const baseArgs = {
  apiKey: 'sk-test',
  model: 'gpt-test',
  systemPrompt: 'sys',
  messages: [{ role: 'user' as const, content: 'hi' }],
  timeoutMs: 5000,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generateOpenAi base URL', () => {
  it('calls api.openai.com when no baseUrl is set', async () => {
    const fn = mockFetchOk()
    await generateOpenAi(baseArgs)
    expect(fn).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.anything(),
    )
  })

  it('calls the custom baseUrl when provided (aicredits.in style)', async () => {
    const fn = mockFetchOk()
    await generateOpenAi({ ...baseArgs, baseUrl: 'https://api.aicredits.in/v1' })
    expect(fn).toHaveBeenCalledWith(
      'https://api.aicredits.in/v1/chat/completions',
      expect.anything(),
    )
  })

  it('tolerates a trailing slash on the baseUrl', async () => {
    const fn = mockFetchOk()
    await generateOpenAi({ ...baseArgs, baseUrl: 'https://api.aicredits.in/v1/' })
    expect(fn).toHaveBeenCalledWith(
      'https://api.aicredits.in/v1/chat/completions',
      expect.anything(),
    )
  })
})
