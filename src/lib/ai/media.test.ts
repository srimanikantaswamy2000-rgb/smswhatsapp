import { describe, expect, it } from 'vitest';
import {
  detectReplyLanguage,
  parseMediaDirectives,
  resolveMediaForSend,
  MAX_MEDIA_PER_REPLY,
} from './media';

describe('parseMediaDirectives', () => {
  it('extracts a valid id and strips the directive', () => {
    const { cleanedText, mediaIds } = parseMediaDirectives(
      'Here is the MU4501 for you. [[MEDIA:mu4501]]',
    );
    expect(mediaIds).toEqual(['mu4501']);
    expect(cleanedText).toBe('Here is the MU4501 for you.');
  });

  it('drops unknown ids', () => {
    const { cleanedText, mediaIds } = parseMediaDirectives(
      'Look at this [[MEDIA:flying_car]] machine.',
    );
    expect(mediaIds).toEqual([]);
    expect(cleanedText).toBe('Look at this  machine.');
  });

  it('de-dupes and preserves order', () => {
    const { mediaIds } = parseMediaDirectives(
      '[[MEDIA:dc99]] [[MEDIA:mu4501]] [[MEDIA:dc99]]',
    );
    expect(mediaIds).toEqual(['dc99', 'mu4501']);
  });

  it('is case-insensitive on the id', () => {
    const { mediaIds } = parseMediaDirectives('[[MEDIA:MU4501]]');
    expect(mediaIds).toEqual(['mu4501']);
  });

  it('caps the number of ids', () => {
    const { mediaIds } = parseMediaDirectives(
      '[[MEDIA:b2441]][[MEDIA:b2741]][[MEDIA:l4508]][[MEDIA:mu4201]][[MEDIA:mu4501]][[MEDIA:mu5502]]',
    );
    expect(mediaIds).toHaveLength(MAX_MEDIA_PER_REPLY);
  });

  it('collapses excess blank lines from a directive on its own line', () => {
    const { cleanedText } = parseMediaDirectives('Line one.\n[[MEDIA:mu4501]]\n\nLine two.');
    expect(cleanedText).toBe('Line one.\n\nLine two.');
  });
});

describe('detectReplyLanguage', () => {
  it('detects Telugu script', () => {
    expect(detectReplyLanguage('నమస్తే! కుబోటా MU4501')).toBe('te');
  });
  it('defaults to English', () => {
    expect(detectReplyLanguage('Hello, the MU4501 is great.')).toBe('en');
  });
});

describe('resolveMediaForSend', () => {
  it('makes image paths absolute against the base URL', () => {
    const items = resolveMediaForSend(['mu4501'], 'en', 'https://farm.example.com');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].kind).toBe('image');
    expect(items[0].link).toBe('https://farm.example.com/media/kubota/mu4501-1.jpg');
    expect(items[0].caption).toContain('MU4501');
  });

  it('uses Telugu captions when lang is te', () => {
    const items = resolveMediaForSend(['mu4501'], 'te', 'https://farm.example.com');
    expect(items[0].caption).toContain('కుబోటా');
  });

  it('tolerates a trailing slash on the base URL', () => {
    const items = resolveMediaForSend(['b2441'], 'en', 'https://farm.example.com/');
    expect(items[0].link).toBe('https://farm.example.com/media/kubota/b2441-1.jpg');
  });

  it('caps total resolved items', () => {
    const items = resolveMediaForSend(
      ['b2441', 'b2741', 'l4508', 'mu4201', 'mu4501'],
      'en',
      'https://farm.example.com',
    );
    expect(items.length).toBeLessThanOrEqual(MAX_MEDIA_PER_REPLY);
  });
});
