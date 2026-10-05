// Shared helpers: notes, randomness, dates.

export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
export const BLACK_PCS = [1, 3, 6, 8, 10];

export const pc = (midi) => ((midi % 12) + 12) % 12;
export const isBlack = (midi) => BLACK_PCS.includes(pc(midi));
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;

/** Name of a MIDI note. style: 'sharp' | 'flat' | 'both' */
export function noteName(midi, style = 'sharp') {
  const p = pc(midi);
  if (style === 'flat') return FLAT_NAMES[p];
  if (style === 'both' && isBlack(midi)) return `${SHARP_NAMES[p]}/${FLAT_NAMES[p]}`;
  return SHARP_NAMES[p];
}

/** All names that refer to this pitch class (e.g. C♯ and D♭). */
export function namesFor(p) {
  return SHARP_NAMES[p] === FLAT_NAMES[p] ? [SHARP_NAMES[p]] : [SHARP_NAMES[p], FLAT_NAMES[p]];
}

export function pcFromName(name) {
  let i = SHARP_NAMES.indexOf(name);
  if (i < 0) i = FLAT_NAMES.indexOf(name);
  return i;
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const rand = (n) => Math.floor(Math.random() * n);
export const choice = (arr) => arr[rand(arr.length)];
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick n distinct items from arr, always including `must` if given. */
export function sampleWith(arr, n, must) {
  const rest = shuffle(arr.filter((x) => x !== must));
  const out = must !== undefined ? [must, ...rest.slice(0, n - 1)] : rest.slice(0, n);
  return shuffle(out);
}

/** Weighted random choice. weights: array of numbers >= 0 */
export function weightedChoice(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ---- Dates (local time, YYYY-MM-DD) ----
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function daysBetween(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, pv] of Object.entries(v)) {
        if (p.startsWith('--')) node.style.setProperty(p, pv);
        else node.style[p] = pv;
      }
    }
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
