// 3D face (three.js, loaded only with this face): extruded digits. Hours and minutes are glossy
// ink-coloured metal, seconds are amber glass, AM/PM is small metal. It renders only when something
// changes: once per second, and while the clock eases toward the pointer.
import {
  AmbientLight, Color, CylinderGeometry, DirectionalLight, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  PMREMGenerator, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer, type BufferGeometry, type Material,
} from 'three';
import { Font, type FontData } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import fontData from './assets/helvetiker_bold.typeface.json';
import type { Face, FaceFrame, FaceOptions } from './face';
import { cssColor, mix } from './css-color';

const ASPECT = 3.4; // canvas width / height, fixed so the page never shifts
const SEC = 0.74; // seconds scale relative to hours and minutes
const AP = 0.3; // AM/PM scale

export function create(opts: FaceOptions): Face {
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  const scene = new Scene();
  const camera = new PerspectiveCamera(20, ASPECT, 0.1, 50);
  const reduceTransparency = matchMedia('(prefers-reduced-transparency: reduce)').matches;

  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.add(new AmbientLight(0xffffff, 0.5));
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-2, 3, 5);
  scene.add(key);

  const ink = new MeshPhysicalMaterial({ metalness: 0.65, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18 });
  const amber = reduceTransparency
    ? new MeshStandardMaterial({ roughness: 0.25, metalness: 0 })
    : new MeshPhysicalMaterial({
        metalness: 0, roughness: 0.06, transmission: 0.92, thickness: 1.1, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.05,
        attenuationDistance: 0.7,
      });

  // Glyphs, built once. Digits share one advance so the row stays tabular.
  const font = new Font(fontData as unknown as FontData);
  const glyphs = new Map<string, BufferGeometry>();
  const glyph = (ch: string): BufferGeometry => {
    let g = glyphs.get(ch);
    if (!g) {
      g = new TextGeometry(ch, { font, size: 1, depth: 0.26, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 4 });
      g.computeBoundingBox();
      glyphs.set(ch, g);
    }
    return g;
  };
  const digitH = (() => { const b = glyph('0').boundingBox; return b ? b.max.y - b.min.y : 0.72; })();
  const norm = 1 / digitH; // digit height becomes 1 unit
  let cellW = 0;
  for (const d of '0123456789') { const b = glyph(d).boundingBox; if (b) cellW = Math.max(cellW, b.max.x - b.min.x); }
  cellW *= norm;
  const adv = cellW + 0.17;

  const root = new Group(); // rotates about the centre
  const row = new Group(); // holds the glyphs, offset so the row is centred
  root.add(row);
  scene.add(root);
  // Each glyph sits in a pivot so it can be centred in its cell and scaled without touching the geometry.
  const slot = (mat: Material, scale: number) => {
    const pivot = new Group();
    const mesh = new Mesh(undefined, mat);
    pivot.add(mesh);
    pivot.scale.setScalar(scale * norm);
    row.add(pivot);
    return {
      pivot,
      set(ch: string): void {
        const g = glyph(ch);
        mesh.geometry = g;
        const b = g.boundingBox;
        if (b) mesh.position.set(-(b.max.x + b.min.x) / 2, -b.min.y, 0); // centre in x, sit on the baseline
        pivot.visible = ch !== '';
      },
    };
  };
  const hh = [slot(ink, 1), slot(ink, 1)];
  const mm = [slot(ink, 1), slot(ink, 1)];
  const ss = [slot(amber, SEC), slot(amber, SEC)];
  const ap = [slot(ink, AP), slot(ink, AP)];

  const dots = (mat: Material, r: number, gap: number) => {
    const g = new Group();
    for (const y of [0.5 - gap, 0.5 + gap]) {
      const m = new Mesh(new CylinderGeometry(r, r, r * 1.5, 32), mat);
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      g.add(m);
    }
    row.add(g);
    return g;
  };
  const colon1 = dots(ink, 0.075, 0.2);
  const colon2 = dots(amber, 0.062, 0.2 * SEC);

  const lay = (showSeconds: boolean, period: string): number => {
    let x = 0;
    const put = (o: { position: { x: number } }, w: number): void => { o.position.x = x + w / 2; x += w; };
    put(hh[0].pivot, adv); put(hh[1].pivot, adv);
    colon1.position.x = x + 0.18; x += 0.36;
    put(mm[0].pivot, adv); put(mm[1].pivot, adv);
    colon2.visible = ss[0].pivot.visible = ss[1].pivot.visible = showSeconds;
    if (showSeconds) {
      colon2.position.x = x + 0.17; colon2.position.y = -0.5 * (1 - SEC); x += 0.34;
      put(ss[0].pivot, adv * SEC); put(ss[1].pivot, adv * SEC);
    }
    const hasAp = period !== '';
    ap[0].pivot.visible = ap[1].pivot.visible = hasAp;
    if (hasAp) { x += 0.12; put(ap[0].pivot, adv * AP * 1.25); put(ap[1].pivot, adv * AP * 1.5); }
    for (const o of [...hh, ...mm, ...ss, ...ap]) o.pivot.position.y = 0;
    return x;
  };

  const recolor = (): void => {
    const s = getComputedStyle(canvas);
    const inkC = cssColor(s.getPropertyValue('--color-ink'), [0.1, 0.1, 0.1]);
    const acc = cssColor(s.getPropertyValue('--color-accent'), [0.9, 0.5, 0.1]);
    // CSS colours are sRGB; three.js works in linear light, so convert on the way in.
    const srgb = (c: [number, number, number]) => new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace);
    ink.color = srgb(inkC);
    // Glass reads darker than its tint, so pull the accent towards a bright amber first.
    const glass = srgb(mix(acc, [1, 0.62, 0.1], 0.72));
    amber.color = glass;
    amber.emissive = glass.clone().multiplyScalar(0.3);
    if (amber instanceof MeshPhysicalMaterial) amber.attenuationColor = srgb(acc);
    render();
  };

  const tilt = { x: 0.08, y: -0.14 };
  const target = { ...tilt };
  let raf = 0;
  let width = 4;
  const fit = (w: number): void => {
    width = w;
    const vh = Math.max((w * 1.14) / ASPECT, 1.55);
    camera.position.set(0, 0, vh / 2 / Math.tan((camera.fov / 2) * (Math.PI / 180)));
    camera.lookAt(0, 0, 0);
  };
  const render = (): void => {
    root.rotation.x = tilt.x;
    root.rotation.y = tilt.y;
    row.position.set(-width / 2, -0.5, 0);
    renderer.render(scene, camera);
  };
  const ease = (): void => {
    tilt.x += (target.x - tilt.x) * 0.12;
    tilt.y += (target.y - tilt.y) * 0.12;
    render();
    raf = Math.abs(target.x - tilt.x) + Math.abs(target.y - tilt.y) > 0.0005 ? requestAnimationFrame(ease) : 0;
  };
  const onPointer = (e: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    target.y = nx * 0.3;
    target.x = 0.08 + ny * 0.2;
    if (!raf) raf = requestAnimationFrame(ease);
  };

  const resize = (): void => {
    const w = Math.max(1, canvas.clientWidth);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, Math.round(w / ASPECT), false);
    render();
  };
  const ro = new ResizeObserver(resize);
  const themeWatch = new MutationObserver(recolor);
  const scheme = matchMedia('(prefers-color-scheme: dark)');

  return {
    mount(host) {
      const wrap = document.createElement('div');
      wrap.className = 't3';
      wrap.append(canvas);
      host.append(wrap);
      ro.observe(canvas);
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look', 'data-autolook'] });
      scheme.addEventListener('change', recolor);
      if (!opts.reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });
      fit(4);
      recolor();
      resize();
    },
    frame(f: FaceFrame) {
      const [a, b, , c, d] = f.hm.padEnd(5);
      hh[0].set(a); hh[1].set(b); mm[0].set(c); mm[1].set(d);
      ss[0].set(f.ss[0] ?? '0'); ss[1].set(f.ss[1] ?? '0');
      const p = f.period.toUpperCase();
      ap[0].set(p[0] ?? ''); ap[1].set(p[1] ?? '');
      fit(lay(f.showSeconds, p));
      render();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeWatch.disconnect();
      scheme.removeEventListener('change', recolor);
      window.removeEventListener('pointermove', onPointer);
      for (const g of glyphs.values()) g.dispose();
      row.traverse((o) => { if (o instanceof Mesh && o.geometry instanceof CylinderGeometry) o.geometry.dispose(); });
      ink.dispose();
      amber.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.parentElement?.remove();
    },
  };
}
