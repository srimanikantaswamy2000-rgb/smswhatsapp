import { describe, it, expect } from 'vitest'
import { parseServiceDirectives } from './service'

describe('parseServiceDirectives', () => {
  it('captures model + complaint and strips the directive', () => {
    const { cleanedText, services } = parseServiceDirectives(
      'మీ సమస్యను నమోదు చేసాను 🙏 [[SERVICE:DC-68G|ఇంజిన్ స్టార్ట్ అవ్వట్లేదు]]',
    )
    expect(services).toEqual([{ model: 'DC-68G', complaint: 'ఇంజిన్ స్టార్ట్ అవ్వట్లేదు' }])
    expect(cleanedText).toBe('మీ సమస్యను నమోదు చేసాను 🙏')
  })

  it('allows an empty model', () => {
    const { services } = parseServiceDirectives('[[SERVICE:|blade not cutting]]')
    expect(services).toEqual([{ model: '', complaint: 'blade not cutting' }])
  })

  it('drops a directive with no complaint', () => {
    const { services } = parseServiceDirectives('[[SERVICE:MU4501|]]')
    expect(services).toEqual([])
  })

  it('caps at 3 complaints per reply', () => {
    const dirs = Array.from({ length: 5 }, (_, i) => `[[SERVICE:M${i}|issue ${i}]]`).join(' ')
    expect(parseServiceDirectives(dirs).services).toHaveLength(3)
  })

  it('returns no services and unchanged text when no directive present', () => {
    const { cleanedText, services } = parseServiceDirectives('just a normal reply')
    expect(services).toEqual([])
    expect(cleanedText).toBe('just a normal reply')
  })
})
