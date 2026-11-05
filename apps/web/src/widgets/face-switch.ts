// <face-switch> — picks the clock face for <tz-clock faces>. Small and static; faces load lazily.
import { FACES, FACE_EVENT, chosenFace, saveFace, isFaceId } from './faces';

class FaceSwitch extends HTMLElement {
  connectedCallback(): void {
    const label = document.createElement('label');
    label.className = 'face-label';
    label.textContent = 'Clock style ';
    const select = document.createElement('select');
    for (const f of FACES) select.append(new Option(f.label, f.id));
    select.value = chosenFace(location.search);
    select.addEventListener('change', () => {
      if (!isFaceId(select.value)) return;
      saveFace(select.value);
      window.dispatchEvent(new CustomEvent(FACE_EVENT, { detail: select.value }));
    });
    label.append(select);
    this.replaceChildren(label);
  }
}

if (!customElements.get('face-switch')) customElements.define('face-switch', FaceSwitch);
