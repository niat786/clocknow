// Embeddable widgets: URL options and the copy-paste snippet. Pure, so it can be tested.
import { isFaceId, type FaceId } from '../widgets/faces.ts';

export const SITE = 'https://clocknow.net';
export const THEMES = ['auto', 'light', 'night', 'oled', 'contrast'] as const;
export type EmbedTheme = (typeof THEMES)[number];
export const isEmbedTheme = (v: unknown): v is EmbedTheme => THEMES.some((t) => t === v);
export const MAX_LABEL = 40;

export const SIZES = [
  { id: 'small', label: 'Small (300 × 140)', w: 300, h: 140 },
  { id: 'medium', label: 'Medium (400 × 190)', w: 400, h: 190 },
  { id: 'large', label: 'Large (600 × 280)', w: 600, h: 280 },
  { id: 'banner', label: 'Banner (728 × 120)', w: 728, h: 120 },
] as const;

export interface ClockEmbed {
  /** IANA zone; empty means "the viewer's own time zone". */
  zone: string;
  label: string;
  theme: EmbedTheme;
  seconds: boolean;
  h12: boolean;
  face: FaceId;
  transparent: boolean;
}

export const CLOCK_DEFAULTS: ClockEmbed = { zone: '', label: '', theme: 'auto', seconds: true, h12: false, face: 'digital', transparent: false };

const ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** Control characters out, whitespace collapsed, at most MAX_LABEL characters. */
export const cleanLabel = (s: string): string => s.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

export function parseClockEmbed(search: string): ClockEmbed {
  const q = new URLSearchParams(search);
  const zone = q.get('zone') ?? '';
  const theme = q.get('theme');
  const face = q.get('face');
  return {
    zone: ZONE.test(zone) ? zone : '',
    label: cleanLabel(q.get('label') ?? ''),
    theme: isEmbedTheme(theme) ? theme : 'auto',
    seconds: q.get('seconds') !== '0',
    h12: q.get('h12') === '1',
    face: isFaceId(face) ? face : 'digital',
    transparent: q.get('bg') === 'transparent',
  };
}

/** Only non-default values, so snippets stay short. */
export function clockEmbedQuery(o: ClockEmbed): string {
  const q = new URLSearchParams();
  if (o.zone) q.set('zone', o.zone);
  if (o.label) q.set('label', cleanLabel(o.label));
  if (o.theme !== 'auto') q.set('theme', o.theme);
  if (!o.seconds) q.set('seconds', '0');
  if (o.h12) q.set('h12', '1');
  if (o.face !== 'digital') q.set('face', o.face);
  if (o.transparent) q.set('bg', 'transparent');
  return q.toString();
}

/** Shared look options for the countdown embed (the date itself uses the countdown's own t/z/n). */
export function lookQuery(theme: EmbedTheme, transparent: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  if (theme !== 'auto') out.theme = theme;
  if (transparent) out.bg = 'transparent';
  return out;
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function snippet(src: string, title: string, w: number, h: number): string {
  return `<iframe src="${attr(src)}" title="${attr(title)}" width="${Math.round(w)}" height="${Math.round(h)}" style="border:0;max-width:100%" loading="lazy"></iframe>`;
}
