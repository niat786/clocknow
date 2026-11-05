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

const LOADERS: Record<Exclude<FaceId, 'digital'>, () => Promise<FaceModule>> = {
  flip: () => import('../themes/flip'),
  led: () => import('../themes/segment'),
  matrix: () => import('../themes/matrix'),
  analog: () => import('../themes/analog'),
  '3d': () => import('../themes/three-d'),
};

export const loadFace = (id: Exclude<FaceId, 'digital'>): Promise<FaceModule> => LOADERS[id]();

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
