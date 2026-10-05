// Visual effects: confetti, floating notes, sparkles, number count-ups.
import { el } from './util.js';

const COLORS = ['#ff6fb5', '#4cc3ff', '#ffc94d', '#b47cff', '#4fdcc4', '#ff9fd2', '#9be3ff'];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas = null;
let parts = [];
let raf = 0;

function ensureCanvas() {
  if (canvas) return canvas;
  canvas = el('canvas', { class: 'fx-canvas' });
  document.body.append(canvas);
  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  };
  resize();
  addEventListener('resize', resize);
  return canvas;
}

function loop() {
  const c = canvas.getContext('2d');
  const dpr = devicePixelRatio;
  c.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += p.g;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life--;
    c.save();
    c.globalAlpha = Math.min(1, p.life / 30);
    c.translate(p.x * dpr, p.y * dpr);
    c.rotate(p.rot);
    c.fillStyle = p.color;
    if (p.shape === 'rect') c.fillRect((-p.w / 2) * dpr, (-p.h / 2) * dpr * Math.abs(Math.cos(p.rot * 2)), p.w * dpr, p.h * dpr * Math.abs(Math.cos(p.rot * 2)) + 1);
    else if (p.shape === 'star') star(c, p.w * dpr);
    else {
      c.beginPath();
      c.arc(0, 0, (p.w / 2) * dpr, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  if (parts.length) raf = requestAnimationFrame(loop);
  else {
    raf = 0;
    c.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function star(c, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

function start() {
  if (!raf) raf = requestAnimationFrame(loop);
}

/** Remove all particles (e.g. when leaving a celebration screen). */
export function clearFx() {
  parts = [];
}

/** Confetti shower from the top of the screen. */
export function confetti(count = 120) {
  if (reduced()) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    parts.push({
      x: Math.random() * innerWidth,
      y: -20 - Math.random() * innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      g: 0.08, drag: 0.995,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      w: 7 + Math.random() * 6, h: 10 + Math.random() * 8,
      color: COLORS[i % COLORS.length],
      shape: Math.random() < 0.75 ? 'rect' : 'circle',
      life: 260 + Math.random() * 120,
    });
  }
  start();
}

/** A burst of sparkles from a point (or from the center of an element). */
export function burst(target, { count = 18, colors = COLORS, speed = 6, shape = 'star' } = {}) {
  if (reduced()) return;
  ensureCanvas();
  let x = target.x;
  let y = target.y;
  if (target instanceof Element) {
    const r = target.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const v = speed * (0.5 + Math.random() * 0.7);
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      g: 0.12, drag: 0.93, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      w: 5 + Math.random() * 6, h: 5,
      color: colors[i % colors.length], shape,
      life: 40 + Math.random() * 25,
    });
  }
  start();
}

/** A music note that floats up from a point and fades. */
export function floatNote(x, y, color) {
  if (reduced()) return;
  const n = el('span', { class: 'float-note', style: { left: `${x}px`, top: `${y}px`, color: color || COLORS[Math.floor(Math.random() * COLORS.length)], '--dx': `${(Math.random() - 0.5) * 50}px` } }, Math.random() < 0.5 ? '♪' : '♫');
  document.body.append(n);
  setTimeout(() => n.remove(), 1000);
}

/** Floating "+N XP"-style label. */
export function floatText(target, text, cls = '') {
  const r = target.getBoundingClientRect();
  const n = el('span', { class: `float-text ${cls}`, style: { left: `${r.left + r.width / 2}px`, top: `${r.top}px` } }, text);
  document.body.append(n);
  setTimeout(() => n.remove(), 1200);
}

/** Animate a number in an element from `from` to `to`. */
export function countUp(node, to, { from = 0, ms = 900, prefix = '', suffix = '', onTick } = {}) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    const v = Math.round(from + (to - from) * e);
    node.textContent = `${prefix}${v}${suffix}`;
    onTick?.(v);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Restart a CSS animation class on an element. */
export function pulse(node, cls) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}
