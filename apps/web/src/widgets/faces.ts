// Clock-face registry. Each face is its own lazily loaded chunk; Essentials pages only carry this list.
import type { FaceModule } from '../themes/face';

export const FACE_KEY = 'clocknow-face';
export const FACE_EVENT = 'clocknow:face';

export const FACES = [
  { id: 'digital', label: 'Digital' },
  { id: 'flip', label: 'Flip' },
  { id: 'led', label: 'LED' },
  { id: 'matrix', label: 'Dot matrix' },
  { id: 'analog', label: 'Analog' },
  { id: '3d', label: '3D' },
] as const;

export type FaceId = (typeof FACES)[number]['id'];

export const isFaceId = (v: unknown): v is FaceId => FACES.some((f) => f.id === v);

type Loaded = Exclude<FaceId, 'digital'>;

// Each face is its own chunk plus its own stylesheet. The stylesheet is fetched as a URL and linked at
// run time, so it never becomes render-blocking CSS on the pages that merely offer the face.
const LOADERS: Record<Loaded, { code: () => Promise<FaceModule>; css: () => Promise<{ default: string }> }> = {
  flip: { code: () => import('../themes/flip'), css: () => import('../themes/flip.css?url') },
  led: { code: () => import('../themes/segment'), css: () => import('../themes/segment.css?url') },
  matrix: { code: () => import('../themes/matrix'), css: () => import('../themes/matrix.css?url') },
  analog: { code: () => import('../themes/analog'), css: () => import('../themes/analog.css?url') },
  '3d': { code: () => import('../themes/three-d'), css: () => import('../themes/three-d.css?url') },
};

const linked = new Map<string, Promise<void>>();

function linkStyles(href: string): Promise<void> {
  let p = linked.get(href);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      // A failed stylesheet must not block the clock: resolve either way and show the face unstyled.
      el.onload = el.onerror = () => resolve();
      document.head.append(el);
    });
    linked.set(href, p);
  }
  return p;
}

export async function loadFace(id: Loaded): Promise<FaceModule> {
  const l = LOADERS[id];
  const [mod, css] = await Promise.all([l.code(), l.css()]);
  await linkStyles(css.default);
  return mod;
}

/** `?face=flip` wins (for kiosk links) without being saved; otherwise the saved choice. */
export function chosenFace(search: string, store?: Pick<Storage, 'getItem'> | null): FaceId {
  const q = new URLSearchParams(search).get('face');
  if (isFaceId(q)) return q;
  try {
    const v = (store ?? globalThis.localStorage)?.getItem(FACE_KEY);
    return isFaceId(v) ? v : 'digital';
  } catch {
    return 'digital';
  }
}

export function saveFace(id: FaceId, store?: Pick<Storage, 'setItem' | 'removeItem'> | null): void {
  try {
    const s = store ?? globalThis.localStorage;
    if (id === 'digital') s?.removeItem(FACE_KEY);
    else s?.setItem(FACE_KEY, id);
  } catch {
    /* storage blocked: the choice lasts for this page view */
  }
}
