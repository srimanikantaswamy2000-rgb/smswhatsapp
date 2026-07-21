import { describe, it, expect } from 'vitest'
import {
  canonicalizeTemplateButtonId,
  TEMPLATE_BUTTON_ALIASES,
} from './template-button-aliases'

describe('canonicalizeTemplateButtonId', () => {
  it('maps the promo template buttons to their canonical menu ids', () => {
    expect(canonicalizeTemplateButtonId('హార్వెస్టర్ వివరాలు')).toBe('menu_harvesters')
    expect(canonicalizeTemplateButtonId('EMI వివరాలు')).toBe('menu_emi')
  })

  it('maps the re-engagement template buttons', () => {
    expect(canonicalizeTemplateButtonId('అపాయింట్మెంట్')).toBe('followup_appointment')
    expect(canonicalizeTemplateButtonId('షోరూమ్ విజిట్')).toBe('followup_showroom')
    expect(canonicalizeTemplateButtonId('టీమ్‌తో మాట్లాడాలి')).toBe('menu_talk')
  })

  it('trims surrounding whitespace before matching', () => {
    expect(canonicalizeTemplateButtonId('  EMI వివరాలు  ')).toBe('menu_emi')
  })

  it('passes through an unknown label unchanged (trimmed)', () => {
    expect(canonicalizeTemplateButtonId('random text')).toBe('random text')
  })

  it('passes a canonical id through unchanged', () => {
    expect(canonicalizeTemplateButtonId('menu_harvesters')).toBe('menu_harvesters')
  })

  it('returns null for empty / missing input', () => {
    expect(canonicalizeTemplateButtonId(null)).toBeNull()
    expect(canonicalizeTemplateButtonId(undefined)).toBeNull()
    expect(canonicalizeTemplateButtonId('   ')).toBeNull()
  })

  it('every alias target is a stable snake_case id (no raw labels)', () => {
    for (const id of Object.values(TEMPLATE_BUTTON_ALIASES)) {
      expect(id).toMatch(/^[a-z_]+$/)
    }
  })
})
