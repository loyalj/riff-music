// Rhythm notation rendered as SVG on a single-line percussion staff.
// A rhythm is an array of tokens: 'w','h','q','e','s' (notes) and 'wr','hr','qr','er','sr' (rests).

export const BEATS = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };
export const durOf = (tok) => BEATS[tok.replace('r', '')];
export const isRest = (tok) => tok.endsWith('r');

export const TOKEN_NAMES = {
  w: 'whole note', h: 'half note', q: 'quarter note', e: 'eighth note', s: 'sixteenth note',
  wr: 'whole rest', hr: 'half rest', qr: 'quarter rest', er: 'eighth rest', sr: 'sixteenth rest',
};

/** Onset times (in beats) of notes (not rests) in a rhythm. */
export function onsets(tokens) {
  const out = [];
  let t = 0;
  for (const tok of tokens) {
    if (!isRest(tok)) out.push(t);
    t += durOf(tok);
  }
  return out;
}

export const totalBeats = (tokens) => tokens.reduce((a, t) => a + durOf(t), 0);

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
}

const LINE_Y = 60;
const STEM = 34;

function notehead(g, x, filled) {
  s('ellipse', {
    cx: x, cy: LINE_Y, rx: 7.2, ry: 5.2,
    transform: `rotate(-22 ${x} ${LINE_Y})`,
    class: filled ? 'nh fill' : 'nh hollow',
  }, g);
}

function rest(g, tok, x) {
  const y = LINE_Y;
  if (tok === 'wr') s('rect', { x: x - 7, y: y - 10, width: 14, height: 6, class: 'ink' }, g);
  else if (tok === 'hr') s('rect', { x: x - 7, y: y - 6, width: 14, height: 6, class: 'ink' }, g);
  else if (tok === 'qr') {
    s('path', {
      d: `M${x - 3} ${y - 20} l7 9 l-6 7 l7 9 c-5 -2 -9 0 -5 6 c-8 -4 -6 -11 1 -9 l-7 -8 l6 -7 z`,
      class: 'ink',
    }, g);
  } else if (tok === 'er' || tok === 'sr') {
    const flag = (dy) => {
      s('circle', { cx: x - 3, cy: y - 8 + dy, r: 3, class: 'ink' }, g);
      s('path', { d: `M${x - 3} ${y - 6 + dy} q5 2 8 -3`, class: 'stroke', 'stroke-width': 2, fill: 'none' }, g);
    };
    flag(0);
    if (tok === 'sr') flag(8);
    s('line', { x1: x + 5, y1: y - 11, x2: x - 1, y2: y + (tok === 'sr' ? 18 : 12), class: 'stroke', 'stroke-width': 2 }, g);
  }
}

/**
 * Render rhythm tokens to an SVG element.
 * opts: { width, timeSig: true, missing: beats (draws a dashed box for a missing ending), compact }
 */
export function renderRhythm(tokens, opts = {}) {
  const { timeSig = true, missing = 0, compact = false, counts = false } = opts;
  const W = opts.width || 320;
  const H = (compact ? 84 : 96) + (counts ? 18 : 0);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rhythm-svg', role: 'img' });
  svg.setAttribute('aria-label', tokens.map((t) => TOKEN_NAMES[t]).join(', '));
  const g = s('g', { transform: `translate(0 ${compact ? -6 : 0})` }, svg);

  const left = timeSig ? 38 : 12;
  const right = W - 10;
  const total = totalBeats(tokens) + missing;
  const beatW = (right - left - 8) / Math.max(total, 1);

  s('line', { x1: 4, y1: LINE_Y, x2: right, y2: LINE_Y, class: 'stroke staff' }, g);
  s('line', { x1: right, y1: LINE_Y - 14, x2: right, y2: LINE_Y + 14, class: 'stroke', 'stroke-width': 2 }, g);
  if (timeSig) {
    s('text', { x: 20, y: LINE_Y - 3, class: 'timesig' }, g).textContent = '4';
    s('text', { x: 20, y: LINE_Y + 19, class: 'timesig' }, g).textContent = '4';
  }

  // Layout: x position of each token by time
  const items = [];
  let t = 0;
  tokens.forEach((tok, i) => {
    const d = durOf(tok);
    const x = left + 10 + t * beatW + (tok.startsWith('w') ? (d * beatW) / 2 - 10 : 0);
    items.push({ tok, i, t, d, x });
    t += d;
  });

  // Group beamable notes (eighths/sixteenths) within the same beat.
  const groups = [];
  let cur = null;
  for (const it of items) {
    const beamable = !isRest(it.tok) && it.d < 1;
    const beat = Math.floor(it.t + 1e-6);
    if (beamable && cur && cur.beat === beat) cur.items.push(it);
    else if (beamable) groups.push((cur = { beat, items: [it] }));
    else cur = null;
    if (isRest(it.tok)) cur = null;
  }
  const inGroup = new Set(groups.filter((gr) => gr.items.length > 1).flatMap((gr) => gr.items));

  for (const it of items) {
    const ng = s('g', { class: 'tok', 'data-i': it.i }, g);
    it.node = ng;
    if (isRest(it.tok)) {
      rest(ng, it.tok, it.x);
      continue;
    }
    const filled = it.d < 2;
    notehead(ng, it.x, filled);
    if (it.tok === 'w') continue;
    const sx = it.x + 6.3;
    s('line', { x1: sx, y1: LINE_Y - 2, x2: sx, y2: LINE_Y - STEM, class: 'stroke', 'stroke-width': 1.8 }, ng);
    if (!inGroup.has(it) && it.d < 1) {
      // flags
      const flags = it.tok === 's' ? 2 : 1;
      for (let f = 0; f < flags; f++) {
        const y0 = LINE_Y - STEM + f * 8;
        s('path', { d: `M${sx} ${y0} c2 8 12 10 8 22 c1 -8 -4 -12 -8 -14 z`, class: 'ink' }, ng);
      }
    }
  }

  // Beams
  for (const gr of groups) {
    if (gr.items.length < 2) continue;
    const x0 = gr.items[0].x + 6.3;
    const x1 = gr.items[gr.items.length - 1].x + 6.3;
    const by = LINE_Y - STEM;
    s('rect', { x: x0 - 0.9, y: by, width: x1 - x0 + 1.8, height: 5, class: 'ink' }, gr.items[0].node);
    // Secondary beams for runs of sixteenths
    const its = gr.items;
    for (let k = 0; k < its.length; k++) {
      if (its[k].tok !== 's') continue;
      let j = k;
      while (j + 1 < its.length && its[j + 1].tok === 's') j++;
      const a = its[k].x + 6.3;
      if (j > k) {
        const b = its[j].x + 6.3;
        s('rect', { x: a - 0.9, y: by + 8, width: b - a + 1.8, height: 5, class: 'ink' }, its[k].node);
      } else {
        // lone sixteenth: stub pointing toward neighbor
        const dir = k === its.length - 1 ? -1 : 1;
        const len = 9;
        s('rect', { x: dir > 0 ? a - 0.9 : a - len, y: by + 8, width: len + 0.9, height: 5, class: 'ink' }, its[k].node);
      }
      k = j;
    }
  }

  if (counts) {
    const SYL = { 0: null, 0.25: 'e', 0.5: '&', 0.75: 'a' };
    const label = (time, cls) => {
      const frac = Math.round((time % 1) * 4) / 4;
      const txt = SYL[frac] ?? String(Math.floor(time) + 1);
      s('text', { x: left + 10 + time * beatW + 3, y: LINE_Y + 36, class: `count ${cls}` }, g).textContent = txt;
    };
    for (const it of items) {
      label(it.t, isRest(it.tok) ? 'rest' : '');
      for (let b = Math.ceil(it.t + 1e-6); b < it.t + it.d - 1e-6; b++) label(b, 'held');
    }
  }

  if (missing > 0) {
    const mx = left + 4 + t * beatW;
    s('rect', {
      x: mx, y: LINE_Y - 30, width: missing * beatW - 4, height: 44, rx: 8, class: 'missing',
    }, g);
    s('text', { x: mx + (missing * beatW - 4) / 2, y: LINE_Y + 6, class: 'missing-q' }, g).textContent = '?';
  }

  svg._items = items;
  return svg;
}

/** Highlight token i (or none if -1). */
export function highlightToken(svg, i) {
  svg.querySelectorAll('.tok.on').forEach((n) => n.classList.remove('on'));
  if (i >= 0) svg.querySelector(`.tok[data-i="${i}"]`)?.classList.add('on');
}
