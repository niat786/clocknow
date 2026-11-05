// 3D analog face (three.js, loaded only with this face). Renders only when something changes:
// once per second for the hands, and while the dial eases toward the pointer.
import './three-d.css';
import {
  AmbientLight, BoxGeometry, Color, CylinderGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial,
  PerspectiveCamera, SRGBColorSpace, Scene, TorusGeometry, WebGLRenderer,
} from 'three';
import type { Face, FaceFrame, FaceOptions } from './face';
import { forward, handAngles } from './analog-math';
import { cssColor, mix } from './css-color';

const TAU = Math.PI * 2;

export function create(opts: FaceOptions): Face {
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 4.3);

  // Non-metallic, fairly matte materials keep the theme colours (and contrast) close to true.
  const mat = () => new MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
  const dialMat = mat();
  const inkMat = mat();
  const mutedMat = mat();
  const accentMat = mat();
  dialMat.roughness = 0.95;

  const clock = new Group();
  const dial = new Mesh(new CylinderGeometry(1, 1, 0.1, 96), dialMat);
  dial.rotation.x = Math.PI / 2;
  clock.add(dial);
  const rim = new Mesh(new TorusGeometry(1.0, 0.04, 16, 128), mutedMat);
  rim.position.z = 0.05;
  clock.add(rim);
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const tick = new Mesh(new BoxGeometry(major ? 0.055 : 0.018, major ? 0.17 : 0.06, major ? 0.06 : 0.03), major ? inkMat : mutedMat);
    const a = (i / 60) * TAU;
    const r = major ? 0.8 : 0.84;
    tick.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.07);
    tick.rotation.z = -a;
    clock.add(tick);
  }
  const hand = (w: number, len: number, tail: number, z: number, m: MeshStandardMaterial) => {
    const pivot = new Group();
    const bar = new Mesh(new BoxGeometry(w, len + tail, 0.03), m);
    bar.position.set(0, (len - tail) / 2, z);
    pivot.add(bar);
    clock.add(pivot);
    return pivot;
  };
  const hourHand = hand(0.075, 0.5, 0.1, 0.1, inkMat);
  const minuteHand = hand(0.05, 0.74, 0.12, 0.14, inkMat);
  const secondHand = hand(0.018, 0.82, 0.2, 0.18, accentMat);
  const pin = new Mesh(new CylinderGeometry(0.045, 0.045, 0.06, 32), accentMat);
  pin.rotation.x = Math.PI / 2;
  pin.position.z = 0.21;
  clock.add(pin);
  scene.add(clock);
  scene.add(new AmbientLight(0xffffff, 1.1));
  const sun = new DirectionalLight(0xffffff, 1.3);
  sun.position.set(2, 3, 5);
  scene.add(sun);

  const recolor = (): void => {
    const s = getComputedStyle(document.documentElement);
    const ink = cssColor(s.getPropertyValue('--color-ink'), [0.1, 0.1, 0.1]);
    const bg = cssColor(s.getPropertyValue('--color-bg'), [1, 1, 1]);
    const muted = cssColor(s.getPropertyValue('--color-ink-muted'), [0.4, 0.4, 0.4]);
    const accent = cssColor(s.getPropertyValue('--color-accent'), [0.8, 0.4, 0.1]);
    // CSS colours are sRGB; three.js works in linear light, so convert on the way in.
    const srgb = (c: [number, number, number]) => new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace);
    dialMat.color = srgb(mix(bg, ink, 0.06));
    inkMat.color = srgb(ink);
    mutedMat.color = srgb(muted);
    accentMat.color = srgb(accent);
    render();
  };

  const tilt = { x: 0.12, y: -0.18 };
  const target = { ...tilt };
  let raf = 0;
  const render = (): void => {
    clock.rotation.x = tilt.x;
    clock.rotation.y = tilt.y;
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
    target.y = nx * 0.35;
    target.x = ny * 0.3;
    if (!raf) raf = requestAnimationFrame(ease);
  };

  const resize = (): void => {
    const w = Math.max(1, canvas.clientWidth);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, w, false);
    render();
  };
  const ro = new ResizeObserver(resize);
  const themeWatch = new MutationObserver(recolor);
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const last = { h: 0, m: 0, s: 0 };
  let first = true;

  return {
    mount(host) {
      const wrap = document.createElement('div');
      wrap.className = 't3';
      wrap.append(canvas);
      host.append(wrap);
      ro.observe(canvas);
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      scheme.addEventListener('change', recolor);
      if (!opts.reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });
      recolor();
      resize();
    },
    frame(f: FaceFrame) {
      const a = handAngles(f.h, f.m, f.s);
      last.h = first ? a.hour : forward(last.h, a.hour);
      last.m = first ? a.minute : forward(last.m, a.minute);
      last.s = first ? a.second : forward(last.s, a.second);
      first = false;
      hourHand.rotation.z = (-last.h * Math.PI) / 180;
      minuteHand.rotation.z = (-last.m * Math.PI) / 180;
      secondHand.rotation.z = (-last.s * Math.PI) / 180;
      secondHand.visible = f.showSeconds;
      render();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeWatch.disconnect();
      scheme.removeEventListener('change', recolor);
      window.removeEventListener('pointermove', onPointer);
      scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (o.material as MeshStandardMaterial).dispose();
        }
      });
      renderer.dispose();
      canvas.parentElement?.remove();
    },
  };
}
