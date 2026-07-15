// ============================================================
// AI media sharing.
//
// The assistant can attach product media by emitting a directive
// `[[MEDIA:<id>]]` anywhere in its reply (ids from `media-manifest`).
// This module parses those directives out of the customer-facing text
// and resolves them into concrete WhatsApp send instructions. Mirrors
// the `[HANDOFF]` sentinel pattern in `generate.ts`.
// ============================================================

import {
  MEDIA_MANIFEST,
  type MediaKind,
} from './media-manifest';

/** Max media items sent per reply — bounds accidental spam if the model
 *  emits many directives. */
export const MAX_MEDIA_PER_REPLY = 4;

const MEDIA_DIRECTIVE = /\[\[MEDIA:([a-z0-9_]+)\]\]/gi;
// Telugu Unicode block.
const TELUGU_RANGE = /[ఀ-౿]/;

export interface ParsedMedia {
  /** Reply text with directives removed and whitespace tidied. */
  cleanedText: string;
  /** Valid, known, de-duplicated product ids, in first-seen order. */
  mediaIds: string[];
}

/**
 * Strip `[[MEDIA:id]]` directives from a reply and collect the valid
 * ids. Unknown ids are dropped (the model may hallucinate one). Order
 * and de-duplication are preserved so the customer gets each product's
 * media once, in the order mentioned.
 */
export function parseMediaDirectives(text: string): ParsedMedia {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MEDIA_DIRECTIVE)) {
    const id = match[1].toLowerCase();
    if (id in MEDIA_MANIFEST && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  const cleanedText = text
    .replace(MEDIA_DIRECTIVE, '')
    // tidy whitespace left behind by removed directives
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { cleanedText, mediaIds: ids.slice(0, MAX_MEDIA_PER_REPLY) };
}

/** Detect the reply's language from its script (Telugu vs English). */
export function detectReplyLanguage(text: string): 'te' | 'en' {
  return TELUGU_RANGE.test(text) ? 'te' : 'en';
}

export interface ResolvedMedia {
  kind: MediaKind;
  /** Absolute URL the WhatsApp Cloud API can fetch. */
  link: string;
  caption: string;
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path; // already absolute (video links)
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Resolve media ids into concrete send instructions. Image paths are
 * made absolute against `baseUrl`; video links pass through as-is.
 * Captions follow the reply language.
 */
export function resolveMediaForSend(
  ids: string[],
  lang: 'te' | 'en',
  baseUrl: string,
): ResolvedMedia[] {
  const out: ResolvedMedia[] = [];
  for (const id of ids) {
    const product = MEDIA_MANIFEST[id];
    if (!product) continue;
    for (const item of product.items) {
      out.push({
        kind: item.kind,
        link: joinUrl(baseUrl, item.path),
        caption: lang === 'te' ? item.captionTe : item.captionEn,
      });
    }
  }
  return out.slice(0, MAX_MEDIA_PER_REPLY);
}
