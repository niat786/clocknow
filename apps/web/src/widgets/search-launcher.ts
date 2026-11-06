// Opens the search palette (⌘K / Ctrl+K / "/" or the header button). The palette itself is a lazy chunk.
let loading: Promise<{ open: () => void }> | null = null;
const load = () => (loading ??= import('./cmd-palette'));
const openPalette = (): void => void load().then((m) => m.open());

document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest?.('[data-search]')) openPalette();
});
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
    e.preventDefault();
    openPalette();
  }
});

export {};
