// Music theory: spelled notes ('F#4', 'Bb3'), intervals, scales, chords,
// key signatures, and treble/bass staff notation rendered as SVG.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

/** Parse 'F#4' / 'Bb' / 'C4'. Octave is optional. */
export function parse(name) {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d)?$/.exec(name);
  if (!m) throw new Error(`Bad note name: ${name}`);
  const li = LETTERS.indexOf(m[1]);
  const acc = !m[2] ? 0 : m[2][0] === '#' ? m[2].length : -m[2].length;
  const oct = m[3] != null ? +m[3] : null;
  return {
    letter: m[1], li, acc, oct,
    pc: (((LETTER_PC[li] + acc) % 12) + 12) % 12,
    midi: oct == null ? null : (oct + 1) * 12 + LETTER_PC[li] + acc,
    d: oct == null ? null : oct * 7 + li, // diatonic step, for staff placement
  };
}

const accStr = (a) => (a > 0 ? '#'.repeat(a) : 'b'.repeat(-a));
export const midiOf = (name) => parse(name).midi;
export const stripOct = (name) => name.replace(/-?\d+$/, '');

/** Display form: 'F#4' -> 'F♯', 'Bb' -> 'B♭'. */
export function pretty(name, keepOct = false) {
  const n = keepOct ? name : stripOct(name);
  return n.replace(/^([A-G])bb/, '$1𝄫').replace(/^([A-G])b/, '$1♭').replace('##', '𝄪').replace('#', '♯');
}

/** Spell the note `steps` letters and `semis` half steps above `root`. Keeps octave if root has one. */
export function spell(root, steps, semis) {
  const r = parse(root);
  const oct = r.oct ?? 4;
  const rMidi = (oct + 1) * 12 + LETTER_PC[r.li] + r.acc;
  const li = (r.li + steps) % 7;
  const o2 = oct + Math.floor((r.li + steps) / 7);
  const natural = (o2 + 1) * 12 + LETTER_PC[li];
  const acc = rMidi + semis - natural;
  return LETTERS[li] + accStr(acc) + (r.oct == null ? '' : o2);
}

// ---------------------------------------------------------------- intervals
export const INTERVALS = [
  { s: 1, steps: 1, name: 'minor 2nd', short: 'm2', song: 'the Jaws theme' },
  { s: 2, steps: 1, name: 'major 2nd', short: 'M2', song: '"Happy Birthday" (Hap-py BIRTH-day)' },
  { s: 3, steps: 2, name: 'minor 3rd', short: 'm3', song: '"Smoke on the Water"' },
  { s: 4, steps: 2, name: 'major 3rd', short: 'M3', song: '"When the Saints Go Marching In"' },
  { s: 5, steps: 3, name: 'perfect 4th', short: 'P4', song: '"Here Comes the Bride"' },
  { s: 6, steps: 3, name: 'tritone', short: 'TT', song: 'The Simpsons theme' },
  { s: 7, steps: 4, name: 'perfect 5th', short: 'P5', song: '"Twinkle Twinkle" or the Star Wars theme' },
  { s: 8, steps: 5, name: 'minor 6th', short: 'm6', song: 'the opening of "The Entertainer" (the leap up)' },
  { s: 9, steps: 5, name: 'major 6th', short: 'M6', song: '"My Bonnie Lies Over the Ocean"' },
  { s: 10, steps: 6, name: 'minor 7th', short: 'm7', song: 'the Star Trek theme' },
  { s: 11, steps: 6, name: 'major 7th', short: 'M7', song: 'the chorus leap in "Take On Me"' },
  { s: 12, steps: 7, name: 'octave', short: 'P8', song: '"Somewhere Over the Rainbow"' },
];
export const interval = (s) => INTERVALS.find((i) => i.s === s);
export const ORDINAL = ['unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'octave'];

// ---------------------------------------------------------------- scales
export const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
export const NAT_MINOR = [0, 2, 3, 5, 7, 8, 10, 12];

/** Spelled scale (8 notes incl. octave) from a tonic like 'G4'. */
export function scale(tonic, pattern = MAJOR) {
  return pattern.map((semis, i) => spell(tonic, i, semis));
}

// Scales that skip letters need the letter step of each note as well as its
// half steps, e.g. A blues = A C D E♭ E G (E♭ and E share the letter E).
export const SCALES = {
  majPent: { name: 'major pentatonic', semis: [0, 2, 4, 7, 9, 12], steps: [0, 1, 2, 4, 5, 7], formula: '1 2 3 5 6' },
  minPent: { name: 'minor pentatonic', semis: [0, 3, 5, 7, 10, 12], steps: [0, 2, 3, 4, 6, 7], formula: '1 ♭3 4 5 ♭7' },
  blues: { name: 'blues scale', semis: [0, 3, 5, 6, 7, 10, 12], steps: [0, 2, 3, 4, 4, 6, 7], formula: '1 ♭3 4 ♭5 5 ♭7' },
};

/** Spelled notes of a SCALES entry from a tonic like 'A3' (includes the octave). */
export function scaleOf(tonic, kind) {
  const k = SCALES[kind];
  return k.semis.map((semis, i) => spell(tonic, k.steps[i], semis));
}

// Key signatures: number of sharps (+) or flats (-).
export const MAJOR_KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5 };
export const MINOR_KEYS = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, D: -1, G: -2, C: -3, F: -4 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export function keySigNotes(count) {
  return count >= 0 ? SHARP_ORDER.slice(0, count).map((l) => l + '#') : FLAT_ORDER.slice(0, -count).map((l) => l + 'b');
}
export const relativeMinor = (major) => stripOct(spell(major + '4', 5, 9));
export const relativeMajor = (minor) => stripOct(spell(minor + '4', 2, 3));

// ---------------------------------------------------------------- chords
export const QUALITIES = {
  maj: { semis: [0, 4, 7], sym: '', name: 'major' },
  min: { semis: [0, 3, 7], sym: 'm', name: 'minor' },
  dim: { semis: [0, 3, 6], sym: '°', name: 'diminished' },
  aug: { semis: [0, 4, 8], sym: '+', name: 'augmented' },
  maj7: { semis: [0, 4, 7, 11], sym: 'maj7', name: 'major 7th' },
  dom7: { semis: [0, 4, 7, 10], sym: '7', name: 'dominant 7th' },
  min7: { semis: [0, 3, 7, 10], sym: 'm7', name: 'minor 7th' },
};

/** Spelled chord tones from a root like 'D4' (or 'D'). */
export function chord(root, q) {
  return QUALITIES[q].semis.map((s, i) => spell(root, i * 2, s));
}
export const chordSymbol = (root, q) => pretty(root) + QUALITIES[q].sym;
export const chordLabel = (root, q) => `${pretty(root)} ${QUALITIES[q].name}`;

/** Close-voiced chord in a comfortable register, plus a bass note an octave below the root. */
export function voice(rootName, q, { bass = true } = {}) {
  const pc = parse(rootName).pc;
  const r = 53 + ((pc - 5 + 12) % 12); // root between F3 and E4
  const notes = QUALITIES[q].semis.map((s) => r + s);
  return bass ? [r - 12, ...notes] : notes;
}

// Diatonic triads
const MAJOR_DEGREES = [['I', 'maj'], ['ii', 'min'], ['iii', 'min'], ['IV', 'maj'], ['V', 'maj'], ['vi', 'min'], ['vii°', 'dim']];
const MINOR_DEGREES = [['i', 'min'], ['ii°', 'dim'], ['III', 'maj'], ['iv', 'min'], ['v', 'min'], ['VI', 'maj'], ['VII', 'maj']];

/** The seven triads of a key: [{ numeral, root, q, symbol }] */
export function diatonic(tonic, minor = false) {
  const names = scale(tonic + '4', minor ? NAT_MINOR : MAJOR).slice(0, 7).map(stripOct);
  const degs = minor ? MINOR_DEGREES : MAJOR_DEGREES;
  return names.map((root, i) => ({ numeral: degs[i][0], root, q: degs[i][1], symbol: chordSymbol(root, degs[i][1]) }));
}

// ---------------------------------------------------------------- staff SVG
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
}

const SP = 10; // staff space
const TOP = 34; // y of the top staff line
const BOTTOM = TOP + 4 * SP;
const CLEF_REF = { treble: 30, bass: 18 }; // diatonic step on the bottom line: E4 / G2
const yOf = (d, clef) => BOTTOM - (d - CLEF_REF[clef]) * (SP / 2);

// Key signature placement (as notes) for each clef
const KEYSIG_POS = {
  treble: { '#': ['F5', 'C5', 'G5', 'D5', 'A4', 'E5', 'B4'], b: ['B4', 'E5', 'A4', 'D5', 'G4', 'C5', 'F4'] },
  bass: { '#': ['F3', 'C3', 'G3', 'D3', 'A2', 'E3', 'B2'], b: ['B2', 'E3', 'A2', 'D3', 'G2', 'C3', 'F2'] },
};

function trebleClef(g, x) {
  const t = s('g', { transform: `translate(${x} ${TOP - 2})`, class: 'clef' }, g);
  s('path', {
    d: 'M6 55 C6 61 14 61 14 54 L10.5 -9 C10 -16 19 -18 18 -8 C17 1 1 10 0.5 25 C0 37 10 43 16.5 38.5 C23 33.5 20.5 20 11.5 21.5 C5 22.5 5.5 32 11.5 32.5',
    class: 'clef-stroke',
  }, t);
  s('circle', { cx: 6.5, cy: 55, r: 3.4, class: 'ink' }, t);
}

function bassClef(g, x) {
  const t = s('g', { transform: `translate(${x} ${TOP})`, class: 'clef' }, g);
  s('path', { d: 'M3 10 C3 0 21 -2 21 11 C21 24 10 33 -1 39', class: 'clef-stroke' }, t);
  s('circle', { cx: 4, cy: 10.5, r: 3.8, class: 'ink' }, t);
  s('circle', { cx: 27, cy: 5, r: 2.1, class: 'ink' }, t);
  s('circle', { cx: 27, cy: 15, r: 2.1, class: 'ink' }, t);
}

function accidental(g, kind, x, y) {
  const st = (x1, y1, x2, y2, w) => s('line', { x1, y1, x2, y2, class: 'stroke', 'stroke-width': w, 'stroke-linecap': 'butt' }, g);
  if (kind === 1) {
    st(x - 2.4, y - 11, x - 2.4, y + 11, 1.3);
    st(x + 2.4, y - 12, x + 2.4, y + 10, 1.3);
    st(x - 5, y - 2.5, x + 5, y - 5.5, 2.8);
    st(x - 5, y + 4.5, x + 5, y + 1.5, 2.8);
  } else if (kind === -1) {
    st(x - 3, y - 15, x - 3, y + 5, 1.5);
    s('path', { d: `M${x - 3} ${y + 5} C${x + 8} ${y - 1} ${x + 4} ${y - 7.5} ${x - 3} ${y - 1}`, class: 'stroke', 'stroke-width': 2.2, fill: 'none' }, g);
  } else if (kind === 0) {
    st(x - 3, y - 12, x - 3, y + 4.5, 1.4);
    st(x + 3, y - 4.5, x + 3, y + 12, 1.4);
    st(x - 3, y - 1.5, x + 3, y - 4, 2.6);
    st(x - 3, y + 4, x + 3, y + 1.5, 2.6);
  } else if (kind === 2) {
    s('text', { x: x - 5, y: y + 4, class: 'dblacc' }, g).textContent = '𝄪';
  } else if (kind === -2) {
    accidental(g, -1, x - 4, y);
    accidental(g, -1, x + 3, y);
  }
}

function wholeNote(g, x, y) {
  // An outer ellipse with a tilted hole, using evenodd fill so it works on any background.
  const rx = 7.6, ry = 5.4, r1 = 4.3, r2 = 2.6, th = (55 * Math.PI) / 180;
  const cx = Math.cos(th) * r1, cy = Math.sin(th) * r1;
  const d = `M${x - rx} ${y} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z ` +
    `M${x - cx} ${y - cy} a${r1} ${r2} 55 1 0 ${2 * cx} ${2 * cy} a${r1} ${r2} 55 1 0 ${-2 * cx} ${-2 * cy} Z`;
  s('path', { d, class: 'ink', 'fill-rule': 'evenodd' }, g);
}

/**
 * One note (with its ledger lines and accidental) on a transparent strip the
 * same height as renderStaff, so it can slide across a staff drawn behind it.
 * The notehead is centred at x = 30; the strip is 48 wide.
 */
export function noteGlyph(name, clef = 'treble') {
  const svg = s('svg', { viewBox: `0 0 48 124`, width: 48, height: 124, class: 'staff-svg note-glyph' });
  const g = s('g', { transform: 'translate(0 4)' }, svg);
  const p = parse(name);
  const refD = CLEF_REF[clef];
  const x = 30;
  for (let d = refD - 2; d >= p.d; d -= 2) s('line', { x1: x - 12, y1: yOf(d, clef), x2: x + 12, y2: yOf(d, clef), class: 'stroke ledger' }, g);
  for (let d = refD + 10; d <= p.d; d += 2) s('line', { x1: x - 12, y1: yOf(d, clef), x2: x + 12, y2: yOf(d, clef), class: 'stroke ledger' }, g);
  wholeNote(g, x, yOf(p.d, clef));
  if (p.acc) accidental(g, p.acc, x - 17, yOf(p.d, clef));
  return svg;
}

/**
 * Render a staff.
 * opts: { clef: 'treble'|'bass', key: count (+sharps/-flats), items: [{ notes: ['C4','E4'], cls }],
 *         width, compact, label }
 */
export function renderStaff(opts = {}) {
  const { clef = 'treble', key = 0, items = [], compact = false } = opts;
  const W = opts.width || 320;
  const H = compact ? 116 : 124;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'staff-svg', role: 'img' });
  const g = s('g', { transform: `translate(0 ${compact ? 0 : 4})` }, svg);

  for (let i = 0; i < 5; i++) s('line', { x1: 2, y1: TOP + i * SP, x2: W - 2, y2: TOP + i * SP, class: 'stroke staff-line' }, g);
  if (clef === 'treble') trebleClef(g, 8);
  else bassClef(g, 8);

  // key signature
  const sig = keySigNotes(key);
  const kx = 44;
  const pos = KEYSIG_POS[clef][key >= 0 ? '#' : 'b'];
  sig.forEach((_, i) => accidental(g, key >= 0 ? 1 : -1, kx + i * 10, yOf(parse(pos[i]).d, clef)));
  const implied = {};
  sig.forEach((n) => (implied[n[0]] = key >= 0 ? 1 : -1));

  const x0 = kx + sig.length * 10 + (sig.length ? 22 : 4);
  const slot = (W - 10 - x0) / Math.max(items.length, 1);
  const refD = CLEF_REF[clef];

  items.forEach((item, idx) => {
    const ig = s('g', { class: `staff-item ${item.cls || ''}`, 'data-i': idx }, g);
    const x = x0 + slot * idx + slot / 2;
    const notes = item.notes.map(parse).sort((a, b) => a.d - b.d);
    // ledger lines
    const minD = notes[0]?.d ?? refD;
    const maxD = notes[notes.length - 1]?.d ?? refD;
    for (let d = refD - 2; d >= minD; d -= 2) s('line', { x1: x - 12, y1: yOf(d, clef), x2: x + 12, y2: yOf(d, clef), class: 'stroke ledger' }, ig);
    for (let d = refD + 10; d <= maxD; d += 2) s('line', { x1: x - 12, y1: yOf(d, clef), x2: x + 12, y2: yOf(d, clef), class: 'stroke ledger' }, ig);
    // noteheads (seconds get nudged right)
    let prevOffset = false;
    const placed = notes.map((n, i) => {
      const off = i > 0 && n.d - notes[i - 1].d === 1 && !prevOffset;
      prevOffset = off;
      return { n, x: x + (off ? 14 : 0), y: yOf(n.d, clef) };
    });
    placed.forEach((p) => wholeNote(ig, p.x, p.y));
    // accidentals, top-down, staggering columns when they would collide
    let lastY = -999, col = 0;
    [...placed].reverse().forEach((p) => {
      const need = implied[p.n.letter] ?? 0;
      if (p.n.acc === need) return;
      col = p.y - lastY < 30 ? col + 1 : 0;
      lastY = p.y;
      accidental(ig, p.n.acc, x - 17 - col * 11, p.y);
    });
    if (item.label) s('text', { x, y: H - 6, class: 'staff-label' }, ig).textContent = item.label;
  });
  return svg;
}
