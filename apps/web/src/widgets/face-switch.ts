// <face-switch> — one button per clock face (a radio group). Faces themselves load lazily.
import { FACES, FACE_EVENT, chosenFace, saveFace, type FaceId } from './faces';

class FaceSwitch extends HTMLElement {
  connectedCallback(): void {
    const group = document.createElement('div');
    group.className = 'fsw';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Clock style');
    const buttons = FACES.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.face = f.id;
      b.textContent = f.label;
      return b;
    });
    const set = (id: FaceId, announce: boolean, focus = false): void => {
      for (const b of buttons) {
        const on = b.dataset.face === id;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      }
      if (announce) {
        saveFace(id);
        window.dispatchEvent(new CustomEvent(FACE_EVENT, { detail: id }));
      }
    };
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => set(FACES[i].id, true));
    });
    group.addEventListener('keydown', (e) => {
      const i = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      set(FACES[(i + step + FACES.length) % FACES.length].id, true, true);
    });
    group.append(...buttons);
    this.replaceChildren(group);
    set(chosenFace(location.search), false);
  }
}

if (!customElements.get('face-switch')) customElements.define('face-switch', FaceSwitch);
