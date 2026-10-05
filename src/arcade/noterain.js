// Note Rain: notes glide across the staff toward the glowing line. Tap the
// matching piano key before each one gets there. Ledger lines, then sharps and
// flats join in, and the notes speed up.
import { el, pc } from '../util.js';
import { renderStaff, noteGlyph, parse, pretty } from '../theory.js';
import { createPiano } from '../piano.js';
import { unlock, sfx } from '../audio.js';
import { burst, pulse } from '../juice.js';
import { shell, gameOver, gameData, saveGames, startCard } from './ui.js';

const POOLS = {
  treble: [
    ['E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'],
    ['C4', 'D4', 'G5', 'A5'],
    ['F#4', 'Bb4', 'C#5', 'Eb5', 'G#4', 'Ab4', 'D#5', 'Db5'],
  ],
  bass: [
    ['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3'],
    ['E2', 'F2', 'B3', 'C4'],
    ['F#2', 'Bb2', 'C#3', 'Eb3', 'G#3', 'Ab2'],
  ],
};
const MODES = {
  treble: { name: 'Treble', emoji: '🎼', clefs: ['treble'] },
  bass: { name: 'Bass', emoji: '🎸', clefs: ['bass'] },
  both: { name: 'Both', emoji: '🎹', clefs: ['treble', 'bass'] },
};
const HIT_X = 66; // the glowing line, just after the clef
const MAX_HEARTS = 3;
const LEVEL_AT = [0, 12, 28]; // correct answers needed for ledger lines, then accidentals

export function start(root, { onExit }) {
  const data = gameData('noterain', { treble: 0, bass: 0, both: 0, runs: 0 });
  const { hud, body } = shell(root, { title: 'Note Rain', onExit: () => exit(), cls: 'nr' });
  const hearts = el('div', { class: 'ag-chip' });
  const scoreEl = el('div', { class: 'ag-chip' }, '0');
  const multEl = el('div', { class: 'ag-chip' }, '×1');
  hud.append(hearts, scoreEl, multEl);

  const lanesEl = el('div', { class: 'nr-lanes' });
  const banner = el('div', { class: 'nr-banner' });
  const pianoWrap = el('div', { class: 'piano-wrap nr-piano' });
  const hint = el('div', { class: 'rr-hint' }, 'Tap the key for the note nearest the line');
  body.append(banner, lanesEl, pianoWrap, hint);

  let mode = 'treble', lanes = [], notes = [], piano, score, combo, correct, life, level;
  let running = false, alive = true, raf, lastFrame = 0, nextSpawn = 0, timers = [];
  const later = (ms, fn) => timers.push(setTimeout(() => alive && fn(), ms));
  const mult = () => Math.min(4, 1 + Math.floor(combo / 10));
  const speed = () => Math.min(150, 42 + correct * 2.2); // px per second
  const spawnGap = () => Math.max(900, 2600 - correct * 45); // ms

  function renderHud() {
    hearts.textContent = '❤️'.repeat(life) + '🤍'.repeat(MAX_HEARTS - life);
    scoreEl.textContent = String(score);
    multEl.textContent = `×${mult()}`;
  }

  function buildLanes() {
    lanesEl.replaceChildren();
    const w = lanesEl.clientWidth || 340;
    lanes = MODES[mode].clefs.map((clef) => {
      const staff = renderStaff({ clef, items: [], width: w });
      staff.style.width = `${w}px`;
      staff.style.height = '124px';
      const notesBox = el('div', { class: 'nr-notes' });
      const lane = el('div', { class: 'nr-lane' }, staff, el('div', { class: 'nr-line', style: { left: `${HIT_X}px` } }), notesBox);
      lanesEl.append(lane);
      return { clef, notesBox, width: w };
    });
  }

  function pool(clef) {
    let out = [];
    for (let i = 0; i <= level; i++) out = out.concat(POOLS[clef][i]);
    return out;
  }

  function spawn() {
    if (notes.filter((n) => !n.done).length >= 4) return;
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const p = pool(lane.clef);
    let name;
    do name = p[Math.floor(Math.random() * p.length)];
    while (notes.length && notes[notes.length - 1].name === name && p.length > 1);
    const node = el('div', { class: 'nr-note', role: 'img', 'aria-label': pretty(name), 'data-pc': parse(name).pc }, noteGlyph(name, lane.clef));
    const n = { name, lane, x: lane.width + 10, el: node, done: false };
    node.style.transform = `translateX(${n.x - 30}px)`;
    lane.notesBox.append(node);
    notes.push(n);
  }

  const target = () => notes.filter((n) => !n.done).sort((a, b) => a.x - b.x)[0];

  function press(m) {
    if (!running) return;
    unlock();
    const t = target();
    if (!t) return;
    if (pc(m) === parse(t.name).pc) {
      t.done = true;
      combo++;
      correct++;
      score += 10 * mult();
      t.el.classList.add('hit');
      burst(t.el, { count: 12, speed: 4 });
      later(300, () => t.el.remove());
      if (combo % 10 === 0) pulse(multEl, 'bump');
      const lv = LEVEL_AT.filter((n) => correct >= n).length - 1;
      if (lv > level) {
        level = lv;
        banner.textContent = level === 1 ? 'Ledger lines incoming!' : 'Sharps and flats!';
        pulse(banner, 'nr-banner-in');
      }
    } else {
      combo = 0;
      life--;
      sfx('wrong');
      t.el.classList.remove('wrong');
      void t.el.offsetWidth;
      t.el.classList.add('wrong');
      label(t, pretty(t.name));
      const right = 60 + parse(t.name).pc;
      piano.mark(right, 'correct');
      later(600, () => piano.unmark(right, 'correct'));
      if (life <= 0) end();
    }
    renderHud();
  }

  function label(n, text) {
    const tag = el('div', { class: 'nr-tag' }, text);
    n.el.append(tag);
    later(900, () => tag.remove());
  }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - (lastFrame || ts)) / 1000);
    lastFrame = ts;
    if (ts >= nextSpawn) {
      spawn();
      nextSpawn = ts + spawnGap();
    }
    const v = speed();
    const t = target();
    for (const n of notes) {
      if (n.done) continue;
      n.x -= v * dt;
      n.el.style.transform = `translateX(${n.x - 30}px)`;
      n.el.classList.toggle('target', n === t);
      if (n.x <= HIT_X) {
        n.done = true;
        combo = 0;
        life--;
        n.el.classList.add('missed');
        label(n, pretty(n.name));
        sfx('wrong');
        later(700, () => n.el.remove());
        renderHud();
        if (life <= 0) return end();
      }
    }
    notes = notes.filter((n) => !n.done || n.el.isConnected);
  }

  function begin(m = mode) {
    mode = m;
    unlock();
    score = 0;
    combo = 0;
    correct = 0;
    life = MAX_HEARTS;
    level = 0;
    notes = [];
    timers.forEach(clearTimeout);
    timers = [];
    buildLanes();
    renderHud();
    running = true;
    data.runs++;
    lastFrame = 0;
    nextSpawn = performance.now() + 600;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function end() {
    running = false;
    cancelAnimationFrame(raf);
    const newBest = score > data[mode];
    data[mode] = Math.max(data[mode], score);
    saveGames();
    gameOver(body, {
      title: 'Rained out!', newBest,
      stats: [
        { label: 'Score', value: score, best: newBest },
        { label: 'Notes read', value: correct },
        { label: `Best (${MODES[mode].name})`, value: data[mode] },
        { label: 'Reached', value: ['Staff notes', 'Ledger lines', 'Sharps & flats'][level] },
      ],
      extra: modePicker(true),
      onAgain: () => { body.querySelector('.ag-over')?.remove(); begin(mode); },
      onExit: exit,
    });
  }

  function modePicker(compact) {
    return el('div', { class: `mm-modes ${compact ? 'compact' : ''}` }, Object.entries(MODES).map(([k, md]) =>
      el('button', { class: `mm-mode ${k === mode ? 'selected' : ''}`, onclick: () => { body.querySelector('.ag-over')?.remove(); begin(k); } },
        el('span', { class: 'mm-mode-emoji' }, md.emoji),
        el('div', {}, el('b', {}, md.name), compact ? null : el('span', {}, k === 'both' ? 'Two staffs at once' : `${md.name} clef`)),
        el('span', { class: 'mm-mode-best' }, `Best ${data[k]}`))));
  }

  function exit() {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    onExit();
  }

  piano = createPiano({ from: 60, to: 71, labels: 'white', onPress: press });
  pianoWrap.append(piano.el);
  score = 0;
  life = MAX_HEARTS;
  combo = 0;
  renderHud();
  requestAnimationFrame(buildLanes);
  startCard(body, {
    title: 'Note Rain',
    text: 'Notes glide toward the glowing line. Tap the matching key before each one gets there. Any octave counts.',
    extra: modePicker(false),
    button: null,
    onStart: () => {},
  });

  return () => {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
  };
}
