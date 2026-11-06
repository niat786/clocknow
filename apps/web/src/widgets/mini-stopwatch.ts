// <mini-stopwatch> — a small stopwatch on the monotonic clock (performance.now), for the home page.
const fmt = (ms: number): { main: string; cs: string } => {
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000);
  return { main: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, cs: `.${String(cs).padStart(2, '0')}` };
};

class MiniStopwatch extends HTMLElement {
  #start = 0;
  #held = 0;
  #raf = 0;

  connectedCallback(): void {
    this.innerHTML =
      '<div class="ms-face"><span data-main>00:00</span><span class="ms-cs" data-cs>.00</span></div>' +
      '<div class="ms-ctl"><button type="button" class="cv-primary" data-go>Start</button><button type="button" data-reset>Reset</button></div>';
    const go = this.querySelector('[data-go]') as HTMLButtonElement;
    go.addEventListener('click', () => {
      if (this.#raf) {
        this.#held += performance.now() - this.#start;
        cancelAnimationFrame(this.#raf);
        this.#raf = 0;
        go.textContent = 'Start';
      } else {
        this.#start = performance.now();
        go.textContent = 'Stop';
        this.#loop();
      }
    });
    this.querySelector('[data-reset]')?.addEventListener('click', () => {
      cancelAnimationFrame(this.#raf);
      this.#raf = 0;
      this.#held = 0;
      go.textContent = 'Start';
      this.#show(0);
    });
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
  }

  #loop = (): void => {
    this.#show(this.#held + performance.now() - this.#start);
    this.#raf = requestAnimationFrame(this.#loop);
  };

  #show(ms: number): void {
    const f = fmt(ms);
    (this.querySelector('[data-main]') as HTMLElement).textContent = f.main;
    (this.querySelector('[data-cs]') as HTMLElement).textContent = f.cs;
  }
}

if (!customElements.get('mini-stopwatch')) customElements.define('mini-stopwatch', MiniStopwatch);
