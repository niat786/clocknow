// Colour looks for the main clock card. Colours live in styles/looks.css; this is the list, the
// pairing with clock faces and the saved choice. Pure + storage-safe.
export const LOOK_KEY = 'clocknow-look';

export const LOOKS = [
  { id: 'classic', label: 'Classic', tone: 'theme' },
  { id: 'peach', label: 'Peach', tone: 'light' },
  { id: 'sky', label: 'Sky', tone: 'light' },
  { id: 'meadow', label: 'Meadow', tone: 'light' },
  { id: 'sage', label: 'Sage', tone: 'light' },
  { id: 'midnight', label: 'Midnight', tone: 'dark' },
  { id: 'plum', label: 'Plum', tone: 'dark' },
] as const;

export type LookId = (typeof LOOKS)[number]['id'];
export const isLookId = (v: unknown): v is LookId => LOOKS.some((l) => l.id === v);

const FACE_LOOK: Record<string, LookId> = { digital: 'classic', flip: 'peach', led: 'midnight', matrix: 'plum', analog: 'sage', '3d': 'classic' };

/** The look a face brings by default. Light looks are skipped on a dark page so the card never glares. */
export function lookForFace(face: string, pageIsDark: boolean): LookId {
  const id = FACE_LOOK[face] ?? 'classic';
  const tone = LOOKS.find((l) => l.id === id)?.tone;
  return pageIsDark && tone === 'light' ? 'classic' : id;
}

export const effectiveLook = (saved: LookId | null, face: string, pageIsDark: boolean): LookId => saved ?? lookForFace(face, pageIsDark);

export function readLook(store?: Pick<Storage, 'getItem'> | null): LookId | null {
  try {
    const v = (store ?? globalThis.localStorage)?.getItem(LOOK_KEY);
    return isLookId(v) ? v : null;
  } catch {
    return null;
  }
}

/** `null` means "match the clock style". */
export function saveLook(id: LookId | null, store?: Pick<Storage, 'setItem' | 'removeItem'> | null): void {
  try {
    const s = store ?? globalThis.localStorage;
    if (id === null) s?.removeItem(LOOK_KEY);
    else s?.setItem(LOOK_KEY, id);
  } catch {
    /* storage blocked: the choice lasts for this page view */
  }
}
