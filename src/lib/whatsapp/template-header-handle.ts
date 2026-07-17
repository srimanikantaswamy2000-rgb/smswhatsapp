import { uploadResumableMedia } from '@/lib/whatsapp/meta-api'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'

/**
 * Meta requires an `example.header_handle` (from the Resumable Upload
 * API) to create/edit a template with an IMAGE header — a plain public
 * URL is not accepted at creation time. This helper turns the template's
 * `header_media_url` (whether the user uploaded a file or pasted a link)
 * into a handle and writes it onto the payload, so both the upload path
 * and the legacy URL path actually succeed.
 *
 * No-op unless the header is an image/video that has a URL but no
 * handle yet. Document headers can follow the same shape.
 */

// Meta's header sample limits per media kind.
const HEADER_MEDIA_LIMITS: Record<
  'image' | 'video',
  { maxBytes: number; allowedTypes: string[]; fallbackType: string; fileName: string }
> = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png'],
    fallbackType: 'image/jpeg',
    fileName: 'header.jpg',
  },
  video: {
    maxBytes: 16 * 1024 * 1024,
    allowedTypes: ['video/mp4'],
    fallbackType: 'video/mp4',
    fileName: 'header.mp4',
  },
}

export async function ensureImageHeaderHandle(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  if (payload.header_type !== 'image' && payload.header_type !== 'video') return
  if (payload.header_handle) return // already have one
  if (!payload.header_media_url) return // validator already requires url-or-handle

  const limits = HEADER_MEDIA_LIMITS[payload.header_type]

  const appId = process.env.META_APP_ID
  if (!appId) {
    throw new Error(
      `${payload.header_type === 'video' ? 'Video' : 'Image'}-header templates need META_APP_ID set (used for Meta’s Resumable Upload). Add it to your environment, or remove the media header.`,
    )
  }

  // Fetch the sample media bytes (works for our uploaded chat-media URL
  // and for a manually-pasted public link).
  let res: Response
  try {
    res = await fetch(payload.header_media_url)
  } catch {
    throw new Error(`Could not fetch the header ${payload.header_type} URL. Make sure it is publicly reachable.`)
  }
  if (!res.ok) {
    throw new Error(`Header ${payload.header_type} URL returned ${res.status}. It must be publicly reachable.`)
  }

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (contentType && !limits.allowedTypes.includes(contentType)) {
    throw new Error(
      `Header ${payload.header_type} must be ${limits.allowedTypes.join(' or ')} (got ${contentType}).`,
    )
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new Error(`Header ${payload.header_type} is empty.`)
  }
  if (bytes.byteLength > limits.maxBytes) {
    throw new Error(
      `Header ${payload.header_type} is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB — Meta's limit is ${limits.maxBytes / 1024 / 1024} MB.`,
    )
  }

  const mimeType = limits.allowedTypes.includes(contentType) ? contentType : limits.fallbackType
  const fileName = limits.fileName

  const { handle } = await uploadResumableMedia({
    appId,
    accessToken,
    fileName,
    mimeType,
    bytes,
  })
  payload.header_handle = handle
}
