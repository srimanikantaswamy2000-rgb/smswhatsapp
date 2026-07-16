import { describe, expect, it } from 'vitest';
import { buildBroadcastRequestBody, isMediaHeaderType } from './send-payload';

const recipients = [{ phone: '919876543210', params: ['Rakesh', 'Tanuku'] }];

describe('isMediaHeaderType', () => {
  it('is true for the header types Meta needs media for', () => {
    for (const t of ['image', 'video', 'document']) {
      expect(isMediaHeaderType(t)).toBe(true);
    }
  });
  it('is false for text / none', () => {
    expect(isMediaHeaderType('text')).toBe(false);
    expect(isMediaHeaderType(null)).toBe(false);
    expect(isMediaHeaderType(undefined)).toBe(false);
  });
});

describe('buildBroadcastRequestBody', () => {
  // The bug this file exists to prevent: headerMediaUrl was sent at the
  // top level, the route ignored it, and Meta rejected the send.
  it('nests headerMediaUrl under each recipient, NOT at the top level', () => {
    const body = buildBroadcastRequestBody({
      templateName: 'harvester_promotions',
      templateLanguage: 'te',
      headerType: 'image',
      headerMediaUrl: 'https://x.test/a.jpg',
      recipients,
    });

    expect(body.recipients[0].messageParams).toEqual({
      headerMediaUrl: 'https://x.test/a.jpg',
    });
    expect(body).not.toHaveProperty('headerMediaUrl');
  });

  it('attaches the media to EVERY recipient (Meta needs it per send)', () => {
    const body = buildBroadcastRequestBody({
      templateName: 't',
      headerType: 'image',
      headerMediaUrl: 'https://x.test/a.jpg',
      recipients: [
        { phone: '91900', params: [] },
        { phone: '91901', params: [] },
        { phone: '91902', params: [] },
      ],
    });
    for (const r of body.recipients) {
      expect(r.messageParams?.headerMediaUrl).toBe('https://x.test/a.jpg');
    }
  });

  it('omits messageParams entirely for a text-header template', () => {
    const body = buildBroadcastRequestBody({
      templateName: 't',
      headerType: 'text',
      headerMediaUrl: 'https://x.test/a.jpg', // present but irrelevant
      recipients,
    });
    expect(body.recipients[0]).not.toHaveProperty('messageParams');
  });

  it('omits messageParams when a media template has no URL yet', () => {
    const body = buildBroadcastRequestBody({
      templateName: 't',
      headerType: 'image',
      headerMediaUrl: '   ',
      recipients,
    });
    expect(body.recipients[0]).not.toHaveProperty('messageParams');
  });

  it('trims the URL', () => {
    const body = buildBroadcastRequestBody({
      templateName: 't',
      headerType: 'image',
      headerMediaUrl: '  https://x.test/a.jpg  ',
      recipients,
    });
    expect(body.recipients[0].messageParams?.headerMediaUrl).toBe(
      'https://x.test/a.jpg',
    );
  });

  it('keeps phone and params intact', () => {
    const body = buildBroadcastRequestBody({
      templateName: 't',
      headerType: 'image',
      headerMediaUrl: 'https://x.test/a.jpg',
      recipients,
    });
    expect(body.recipients[0].phone).toBe('919876543210');
    expect(body.recipients[0].params).toEqual(['Rakesh', 'Tanuku']);
  });

  it('defaults the language to en_US when missing', () => {
    expect(
      buildBroadcastRequestBody({ templateName: 't', recipients }).template_language,
    ).toBe('en_US');
    expect(
      buildBroadcastRequestBody({
        templateName: 't',
        templateLanguage: null,
        recipients,
      }).template_language,
    ).toBe('en_US');
    expect(
      buildBroadcastRequestBody({
        templateName: 't',
        templateLanguage: 'te',
        recipients,
      }).template_language,
    ).toBe('te');
  });
});
