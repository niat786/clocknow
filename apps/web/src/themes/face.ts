// Contract for clock faces (visual themes). A face draws the time; it never reads a clock.
// The host (<tz-clock faces>) owns sync and calls `frame` with wall-clock parts once per second.
export interface FaceFrame {
  /** Synced Unix ms of this frame. */
  t: number;
  h: number;
  m: number;
  s: number;
  /** "14:05" (or "02:05" with a 12-hour clock). */
  hm: string;
  /** "09" */
  ss: string;
  /** "AM" / "PM" / "" */
  period: string;
  showSeconds: boolean;
}

export interface FaceOptions {
  reducedMotion: boolean;
}

export interface Face {
  mount(host: HTMLElement): void;
  frame(f: FaceFrame): void;
  destroy(): void;
}

export interface FaceModule {
  create(opts: FaceOptions): Face;
}
