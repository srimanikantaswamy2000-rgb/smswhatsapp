// ============================================================
// Dealership product media manifest.
//
// Maps a stable product id → the photos (and optional demo video
// link) the AI assistant can share on WhatsApp. The assistant emits a
// directive like `[[MEDIA:mu4501]]` (see `media.ts`); the auto-reply
// pipeline resolves the id here and sends each item via
// `engineSendMedia`.
//
// Photos live in `public/media/kubota/` so they deploy as static
// assets and resolve to `<NEXT_PUBLIC_APP_URL>/media/kubota/<file>` —
// a public URL the WhatsApp Cloud API can fetch. On localhost these
// are not internet-reachable, so real sends only work once deployed.
//
// Videos: the field-demo clips we were given are third-party YouTube
// uploads (and some exceed WhatsApp's 16 MB cap), so we DON'T
// redistribute the files — `video` is a link the assistant shares as
// text. Replace with the dealer's own hosted clips to send them as
// real video messages.
// ============================================================

export type MediaKind = 'image' | 'video';

export interface MediaItem {
  kind: MediaKind;
  /** Root-relative for images (resolved against NEXT_PUBLIC_APP_URL),
   *  or an absolute link for videos. */
  path: string;
  captionEn: string;
  captionTe: string;
}

export interface ProductMedia {
  /** Human label used in the system-prompt media catalogue. */
  label: string;
  items: MediaItem[];
}

export const MEDIA_MANIFEST: Record<string, ProductMedia> = {
  b2441: {
    label: 'Kubota B2441 (24 HP compact 4WD tractor)',
    items: [
      {
        kind: 'image',
        path: '/media/kubota/b2441-1.jpg',
        captionEn: 'Kubota B2441 — 24 HP compact 4WD, fits between orchard rows.',
        captionTe: 'కుబోటా B2441 — 24 HP కాంపాక్ట్ 4WD, తోట వరుసల మధ్య వెళ్తుంది.',
      },
      {
        kind: 'image',
        path: '/media/kubota/b2441-2.jpg',
        captionEn: 'Kubota B2441 in the field.',
        captionTe: 'కుబోటా B2441 పొలంలో.',
      },
    ],
  },
  b2741: {
    label: 'Kubota B2741 (27 HP compact 4WD tractor)',
    items: [
      {
        kind: 'image',
        path: '/media/kubota/b2741-1.jpg',
        captionEn: 'Kubota B2741 — 27 HP compact 4WD, more pulling power for orchards.',
        captionTe: 'కుబోటా B2741 — 27 HP కాంపాక్ట్ 4WD, ఎక్కువ లాగే శక్తి.',
      },
    ],
  },
  l4508: {
    label: 'Kubota L4508 (45 HP puddling/dammu specialist)',
    items: [
      {
        kind: 'image',
        path: '/media/kubota/l4508-1.jpg',
        captionEn: 'Kubota L4508 — 45 HP, the Godavari dammu specialist.',
        captionTe: 'కుబోటా L4508 — 45 HP, గోదావరి దమ్ము స్పెషలిస్ట్.',
      },
      {
        kind: 'image',
        path: '/media/kubota/l4508-2.jpg',
        captionEn: 'Kubota L4508 working a wet paddy field.',
        captionTe: 'కుబోటా L4508 తడి వరి పొలంలో పని చేస్తోంది.',
      },
    ],
  },
  mu4201: {
    label: 'Kubota MU4201 (42 HP MU-series)',
    items: [
      {
        kind: 'image',
        path: '/media/kubota/mu4201-1.jpg',
        captionEn: 'Kubota MU4201 — 42 HP, Kubota quality at a value price.',
        captionTe: 'కుబోటా MU4201 — 42 HP, తక్కువ ధరలో కుబోటా నాణ్యత.',
      },
      {
        kind: 'image',
        path: '/media/kubota/mu4201-2.jpg',
        captionEn: 'Kubota MU4201 in the field.',
        captionTe: 'కుబోటా MU4201 పొలంలో.',
      },
    ],
  },
  mu4501: {
    label: 'Kubota MU4501 (45 HP MU-series bestseller)',
    items: [
      {
        kind: 'image',
        path: '/media/kubota/mu4501-1.jpg',
        captionEn: "Kubota MU4501 — 45 HP, India's bestselling tractor. Dammu, dry land & haulage.",
        captionTe: 'కుబోటా MU4501 — 45 HP, భారత్‌లో బెస్ట్‌సెల్లర్. దమ్ము, మెట్ట, రవాణా.',
      },
    ],
  },
  mu5502: {
    label: 'Kubota MU5502 (55 HP MU-series flagship)',
    items: [
      {
        kind: 'image',
        path: '/media/kubota/mu5502-1.jpg',
        captionEn: 'Kubota MU5502 — 55 HP flagship for heavy implements.',
        captionTe: 'కుబోటా MU5502 — 55 HP ఫ్లాగ్‌షిప్, బరువైన పరికరాలకు.',
      },
    ],
  },
  dc68g: {
    label: 'Kubota DC-68G King Pro (68 HP combine harvester)',
    items: [
      {
        kind: 'image',
        path: '/media/kubota/dc68g-1.jpg',
        captionEn: 'Kubota DC-68G King Pro — 68 HP paddy combine harvester.',
        captionTe: 'కుబోటా DC-68G కింగ్ ప్రో — 68 HP వరి కంబైన్ హార్వెస్టర్.',
      },
      {
        kind: 'image',
        path: '/media/kubota/dc68g-2.webp',
        captionEn: 'Kubota DC-68G working a muddy field.',
        captionTe: 'కుబోటా DC-68G బురద పొలంలో పని చేస్తోంది.',
      },
    ],
  },
  dc99: {
    label: 'Kubota DC-99 Harvesking (98 HP combine harvester)',
    items: [
      {
        kind: 'image',
        path: '/media/kubota/dc99-1.jpg',
        captionEn: 'Kubota DC-99 Harvesking — 98 HP high-capacity combine harvester.',
        captionTe: 'కుబోటా DC-99 హార్వెస్‌కింగ్ — 98 HP అధిక సామర్థ్య హార్వెస్టర్.',
      },
      {
        kind: 'image',
        path: '/media/kubota/dc99-2.jpg',
        captionEn: 'Kubota DC-99 Harvesking walkaround.',
        captionTe: 'కుబోటా DC-99 హార్వెస్‌కింగ్ వివరాలు.',
      },
    ],
  },
};

/** Compact catalogue for the system prompt: `id — label` lines. */
export function mediaCatalogueForPrompt(): string {
  return Object.entries(MEDIA_MANIFEST)
    .map(([id, m]) => `- ${id} — ${m.label}`)
    .join('\n');
}
