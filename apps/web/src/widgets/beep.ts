// Small Web Audio cues. Create the context inside a click so browsers allow sound later.
export function audioContext(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

export function playBeeps(ctx: AudioContext | null, freq: number, count: number): void {
  if (!ctx) return;
  try {
    void ctx.resume();
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      osc.start(t);
      osc.stop(t + 0.18);
    }
  } catch {
    // no sound: the visual cue still shows
  }
}
