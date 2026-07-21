import { describe, it, expect } from 'vitest'
import { isBareGreeting } from './greeting'

describe('isBareGreeting', () => {
  it('treats bare greetings as greetings', () => {
    for (const g of ['hi', 'Hello', 'HEY', 'namaste', 'హాయ్', 'నమస్తే', 'menu', 'hi!', '  hello  ']) {
      expect(isBareGreeting(g)).toBe(true)
    }
  })

  it('treats greeting + honorific as a greeting', () => {
    expect(isBareGreeting('hi sir')).toBe(true)
    expect(isBareGreeting('namaste garu')).toBe(true)
    expect(isBareGreeting('హాయ్ సర్')).toBe(true)
  })

  it('treats a substantive first message as NOT a greeting', () => {
    for (const s of [
      'my dc68 is not starting',
      'harvester price?',
      'నా DC-68G స్టార్ట్ అవ్వట్లేదు',
      'hi my dc68 is not starting', // opens with hi but has content
      'I need a spare part MU4501',
    ]) {
      expect(isBareGreeting(s)).toBe(false)
    }
  })

  it('is false for empty / emoji-only / null', () => {
    expect(isBareGreeting('')).toBe(false)
    expect(isBareGreeting('🙏')).toBe(false)
    expect(isBareGreeting(null)).toBe(false)
    expect(isBareGreeting(undefined)).toBe(false)
  })
})
