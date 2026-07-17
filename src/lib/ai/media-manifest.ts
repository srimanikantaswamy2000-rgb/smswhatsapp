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
// Videos: the dealer's per-product demo clips live in
// `public/media/kubota/videos/` (each compressed under WhatsApp's
// 16 MB cap) and are sent as real WhatsApp video messages, same
// URL-resolution rules as the photos.
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
      {
        kind: 'video',
        path: '/media/kubota/videos/b2441.mp4',
        captionEn: 'Kubota B2441 working with a rotavator — watch the demo.',
        captionTe: 'కుబోటా B2441 రోటావేటర్‌తో పని — డెమో చూడండి.',
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
      {
        kind: 'video',
        path: '/media/kubota/videos/b2741.mp4',
        captionEn: 'Kubota B2741 orchard tractor — watch the demo.',
        captionTe: 'కుబోటా B2741 తోట ట్రాక్టర్ — డెమో చూడండి.',
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
      {
        kind: 'video',
        path: '/media/kubota/videos/l4508.mp4',
        captionEn: 'Kubota L4508 power performance — watch the demo.',
        captionTe: 'కుబోటా L4508 పవర్ పనితీరు — డెమో చూడండి.',
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
      {
        kind: 'video',
        path: '/media/kubota/videos/mu4201.mp4',
        captionEn: 'Kubota MU4201 full review — watch the demo.',
        captionTe: 'కుబోటా MU4201 పూర్తి రివ్యూ — డెమో చూడండి.',
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
      {
        kind: 'video',
        path: '/media/kubota/videos/mu4501.mp4',
        captionEn: 'Kubota MU4501 with rotavator in the field — watch the demo.',
        captionTe: 'కుబోటా MU4501 రోటావేటర్‌తో పొలంలో — డెమో చూడండి.',
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
      {
        kind: 'video',
        path: '/media/kubota/videos/mu5502.mp4',
        captionEn: 'Kubota MU5502 4WD in action — watch the demo.',
        captionTe: 'కుబోటా MU5502 4WD పనిలో — డెమో చూడండి.',
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
      {
        kind: 'video',
        path: '/media/kubota/videos/dc68g.mp4',
        captionEn: 'Kubota DC-68G King Pro harvesting in a muddy field — watch the demo.',
        captionTe: 'కుబోటా DC-68G కింగ్ ప్రో బురద పొలంలో కోత — డెమో చూడండి.',
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
      {
        kind: 'video',
        path: '/media/kubota/videos/dc99.mp4',
        captionEn: 'Kubota DC-99 Harvesking full walkaround — watch the demo.',
        captionTe: 'కుబోటా DC-99 హార్వెస్‌కింగ్ పూర్తి వాక్‌అరౌండ్ — డెమో చూడండి.',
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
