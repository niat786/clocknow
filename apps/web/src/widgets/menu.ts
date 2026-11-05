// Header menus are <details> elements, so they work without JS. This only adds: one open at a time,
// close on outside click, close on Escape (returning focus to the menu button).
const menus = (): HTMLDetailsElement[] => [...document.querySelectorAll<HTMLDetailsElement>('.menu-g')];

for (const d of menus()) {
  d.addEventListener('toggle', () => {
    if (d.open) for (const o of menus()) if (o !== d) o.open = false;
  });
}

document.addEventListener('click', (e) => {
  const target = e.target as Node;
  for (const d of menus()) if (d.open && !d.contains(target)) d.open = false;
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const d of menus()) {
    if (d.open) {
      d.open = false;
      d.querySelector('summary')?.focus();
    }
  }
});
