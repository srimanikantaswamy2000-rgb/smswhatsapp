import { describe, it, expect } from 'vitest'
import {
  extractPartTokens,
  parseOrderDirectives,
  parseTeamVerdict,
  buildPartsBlock,
} from './parts'

describe('extractPartTokens', () => {
  it('keeps meaningful English words and drops stopwords', () => {
    const tokens = extractPartTokens('I need a clutch plate for my Kubota tractor please')
    expect(tokens).toContain('clutch')
    expect(tokens).toContain('plate')
    expect(tokens).not.toContain('kubota')
    expect(tokens).not.toContain('please')
  })

  it('detects exact part numbers', () => {
    expect(extractPartTokens('do you have TC740-16300 in stock')).toContain('TC740-16300')
  })

  it('translates Telugu part words via the glossary', () => {
    expect(extractPartTokens('నాకు క్లచ్ ప్లేట్ కావాలి')).toContain('clutch')
  })

  it('returns nothing for chit-chat', () => {
    expect(extractPartTokens('నమస్తే')).toEqual([])
  })
})

describe('parseOrderDirectives', () => {
  it('extracts an order and strips the directive from the text', () => {
    const { cleanedText, orders } = parseOrderDirectives(
      'Order noted! Our team will confirm. [[ORDER:TC740-16300|CLEANER,AIR,ASSY|2]]',
    )
    expect(orders).toEqual([
      { partNumber: 'TC740-16300', partName: 'CLEANER,AIR,ASSY', qty: 2 },
    ])
    expect(cleanedText).toBe('Order noted! Our team will confirm.')
  })

  it('dedupes repeated part numbers and caps the count', () => {
    const text =
      '[[ORDER:A1111-11111|A|1]] [[ORDER:A1111-11111|A|1]] ' +
      '[[ORDER:B2222-22222|B|1]] [[ORDER:C3333-33333|C|1]] [[ORDER:D4444-44444|D|1]]'
    const { orders } = parseOrderDirectives(text)
    expect(orders.map((o) => o.partNumber)).toEqual([
      'A1111-11111',
      'B2222-22222',
      'C3333-33333',
    ])
  })

  it('leaves text without directives untouched', () => {
    const { cleanedText, orders } = parseOrderDirectives('plain reply')
    expect(orders).toEqual([])
    expect(cleanedText).toBe('plain reply')
  })
})

describe('parseTeamVerdict', () => {
  it('accepts OK / YES with optional #', () => {
    expect(parseTeamVerdict('OK 12')).toEqual({ orderNo: 12, accepted: true })
    expect(parseTeamVerdict('yes #7')).toEqual({ orderNo: 7, accepted: true })
  })

  it('declines with NO', () => {
    expect(parseTeamVerdict('no 3')).toEqual({ orderNo: 3, accepted: false })
  })

  it('ignores normal chat', () => {
    expect(parseTeamVerdict('ok let me check tomorrow')).toBeNull()
    expect(parseTeamVerdict('12')).toBeNull()
    expect(parseTeamVerdict('what is order 12?')).toBeNull()
  })
})

describe('buildPartsBlock', () => {
  it('lists matches with the ordering instructions', () => {
    const block = buildPartsBlock([
      {
        part_number: 'TC740-16300',
        part_name: 'CLEANER,AIR,ASSY',
        category: 'ENGINE / AIR CLEANER',
        price: null,
        stock_qty: 0,
      },
    ])
    expect(block).toContain('TC740-16300 — CLEANER,AIR,ASSY')
    expect(block).toContain('[[ORDER:')
    expect(block).not.toContain('₹')
  })
})
