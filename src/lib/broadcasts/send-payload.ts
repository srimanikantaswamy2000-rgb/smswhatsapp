// ============================================================
// The request body for POST /api/whatsapp/broadcast.
//
// Why this is shared
// ------------------
// The wizard's "Send test" and the real sender both build this body.
// They were built independently, and drifted: the test path put
// `headerMediaUrl` at the top level, where the route ignores it, so
// Meta rejected every media-header test with
//   "image header requires a media link or id at send time"
// while the real broadcast worked. The shape is per-recipient
// (`recipients[].messageParams.headerMediaUrl`) — encoded here once so
// the two paths cannot disagree again.
// ============================================================

import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';

/** Header types that oblige a media link/id on every send. */
const MEDIA_HEADER_TYPES = ['image', 'video', 'document'] as const;

export function isMediaHeaderType(value: unknown): boolean {
  return (MEDIA_HEADER_TYPES as readonly unknown[]).includes(value);
}

export interface SendRecipientInput {
  phone: string;
  /** Resolved body variables, positional: {{1}}, {{2}}, … */
  params: string[];
}

export interface BuildSendBodyArgs {
  templateName: string;
  /** Meta wants a language tag; default matches the API's own default. */
  templateLanguage?: string | null;
  /** The template's header type, if any. */
  headerType?: string | null;
  /** Media URL for an image/video/document header. */
  headerMediaUrl?: string | null;
  recipients: SendRecipientInput[];
}

export interface BroadcastRequestBody {
  recipients: (SendRecipientInput & { messageParams?: SendTimeParams })[];
  template_name: string;
  template_language: string;
}

/**
 * Build the exact JSON body the broadcast API expects.
 *
 * The media URL is attached to EVERY recipient (Meta requires the media
 * component on each individual send, not once per batch). It is only
 * attached when the template actually has a media header and a URL is
 * present — for a text-header template the key must be absent, not
 * empty.
 */
export function buildBroadcastRequestBody(
  args: BuildSendBodyArgs,
): BroadcastRequestBody {
  const url = args.headerMediaUrl?.trim();
  const messageParams: SendTimeParams | undefined =
    isMediaHeaderType(args.headerType) && url ? { headerMediaUrl: url } : undefined;

  return {
    recipients: args.recipients.map((r) => ({
      ...r,
      ...(messageParams ? { messageParams } : {}),
    })),
    template_name: args.templateName,
    template_language: args.templateLanguage || 'en_US',
  };
}
