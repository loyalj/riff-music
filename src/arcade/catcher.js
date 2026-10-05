// Chord Catcher: chord bubbles drift down while their chord plays. Tap the
// right bin before the bubble lands. New chord types unlock as you go, and the
// bubbles fall faster.
import { el } from '../util.js';
import { voice, chordSymbol, QUALITIES, pretty } from '../theory.js';
import { playSequence, sfx, unlock } from '../audio.js';
import { createRhino } from '../mascot.js';
import { burst, pulse } from '../juice.js';
import { shell, gameOver, gameData, saveGames, withSound, startCard } from './ui.js';

const BINS = [
  { q: 'maj', label: 'Major', cls: 'b-maj', from: 0, tip: 'bright and happy' },
  { q: 'min', label: 'Minor', cls: 'b-min', from: 0, tip: 'darker, sad' },
  { q: 'dim', label: 'Dim', cls: 'b-dim', from: 8, tip: 'tense, spooky' },
  { q: 'aug', label: 'Aug', cls: 'b-aug', from: 18, tip: 'dreamy, unresolved' },
  { q: 'dom7', label: 'Dom 7', cls: 'b-dom7', from: 30, tip: 'bluesy, wants to move' },
];
const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'];
const MAX_HEARTS = 3;

export function start(root, { onExit }) {
  const data = gameData('catcher', { best: 0, bestCombo: 0, runs: 0 });
  const { hud, body } = shell(root, { title: 'Chord Catcher', onExit: () => exit(), cls: 'cc' });
  const hearts = el('div', { class: 'ag-chip' });
  const scoreEl = el('div', { class: 'ag-chip' }, '0');
  const multEl = el('div', { class: 'ag-chip' }, '×1');
  hud.append(hearts, scoreEl, multEl);

  const sky = el('div', { class: 'cc-sky' });
  const banner = el('div', { class: 'rr-banner' });
  const riff = createRhino({ size: 70, mood: 'happy', cls: 'cc-riff' });
  const field = el('div', { class: 'cc-field' }, sky, banner, riff.el);
  const bins = el('div', { class: 'cc-bins' });
  const hint = el('div', { class: 'rr-hint' }, 'Tap a bubble to hear it again');
  body.append(field, bins, hint);

  let score, combo, bestCombo, life, cleared, bubble, raf, alive = true, running = false, timers = [];
  const later = (ms, fn) => timers.push(setTimeout(() => alive && fn(), ms));
  const mult = () => Math.min(4, 1 + Math.floor(combo / 8));
  const unlockedBins = () => BINS.filter((b) => cleared >= b.from);

  function renderHud() {
    hearts.textContent = '❤️'.repeat(life) + '🤍'.repeat(MAX_HEARTS - life);
    scoreEl.textContent = String(score);
    multEl.textContent = `×${mult()}`;
  }

  function renderBins(newOne) {
    bins.replaceChildren(...unlockedBins().map((b) => {
      const btn = el('button', { class: `cc-bin ${b.cls} ${b === newOne ? 'fresh' : ''}` }, el('b', {}, b.label), el('span', {}, b.tip));
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); answer(b, btn); });
      return btn;
    }));
  }

  const playChord = (b) => playSequence(voice(b.root, b.q).map((m) => ({ midi: m, at: 0, dur: 1.5, vel: 0.55 })));

  function spawn() {
    if (!running) return;
    const pool = unlockedBins();
    // New chord types turn up a bit more often right after they unlock.
    const newest = pool[pool.length - 1];
    const q = pool.length > 2 && Math.random() < 0.3 ? newest.q : pool[Math.floor(Math.random() * pool.length)].q;
    const r = ROOTS[Math.floor(Math.random() * ROOTS.length)];
    const node = el('button', { class: 'cc-bubble', style: { left: `${12 + Math.random() * 60}%` } }, el('span', {}, '?'));
    bubble = { root: r, q, el: node, born: performance.now(), fall: Math.max(2600, 7000 - cleared * 130), done: false };
    node.addEventListener('pointerdown', (e) => { e.preventDefault(); unlock(); pulse(node, 'bump'); playChord(bubble); });
    sky.append(node);
    playChord(bubble);
  }

  function reveal(b, ok) {
    const tag = el('div', { class: `cc-tag ${ok ? 'ok' : 'bad'}`, style: { left: b.el.style.left, top: b.el.style.top } }, `${chordSymbol(b.root, b.q)} · ${QUALITIES[b.q].name}`);
    sky.append(tag);
    later(1100, () => tag.remove());
  }

  function answer(bin, btn) {
    if (!running || !bubble || bubble.done) return;
    unlock();
    const b = bubble;
    b.done = true;
    if (bin.q === b.q) {
      const left = 1 - (performance.now() - b.born) / b.fall;
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      cleared++;
      score += Math.round((10 + left * 15) * mult());
      b.el.classList.add('popped');
      burst(b.el, { count: 16, speed: 5 });
      pulse(btn, 'bump');
      riff.react('jump');
      sfx('correct');
      reveal(b, true);
      later(260, () => b.el.remove());
      const fresh = BINS.find((x) => x.from === cleared);
      if (fresh) {
        renderBins(fresh);
        banner.textContent = `New: ${fresh.label}!`;
        pulse(banner, 'rr-banner-in');
      }
      later(650, spawn);
    } else {
      wrong(b, `You said ${bin.label}`);
      pulse(btn, 'shake');
    }
    renderHud();
  }

  function wrong(b, why) {
    combo = 0;
    life--;
    b.done = true;
    b.el.classList.add('cracked');
    riff.mood('sad').react('droop');
    later(800, () => running && riff.mood('happy'));
    sfx('wrong');
    reveal(b, false);
    later(350, () => playChord(b)); // hear what it really was
    later(900, () => b.el.remove());
    renderHud();
    if (life <= 0) return later(900, end);
    later(1500, spawn);
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!bubble || bubble.done) return;
    const p = (performance.now() - bubble.born) / bubble.fall;
    bubble.el.style.top = `${Math.min(p, 1) * (field.clientHeight - 90)}px`;
    if (p >= 1) wrong(bubble, 'Too slow');
  }

  function begin() {
    withSound(body, () => {
      score = 0;
      combo = 0;
      bestCombo = 0;
      life = MAX_HEARTS;
      cleared = 0;
      bubble = null;
      sky.replaceChildren();
      riff.mood('happy');
      running = true;
      data.runs++;
      renderBins();
      renderHud();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      later(500, spawn);
    });
  }

  function end() {
    running = false;
    cancelAnimationFrame(raf);
    const newBest = score > data.best;
    data.best = Math.max(data.best, score);
    data.bestCombo = Math.max(data.bestCombo, bestCombo);
    saveGames();
    gameOver(body, {
      title: 'Bubbles popped!', newBest,
      stats: [
        { label: 'Score', value: score, best: newBest },
        { label: 'Chords caught', value: cleared },
        { label: 'Best combo', value: bestCombo },
        { label: 'Best score', value: data.best },
      ],
      onAgain: () => { body.querySelector('.ag-over')?.remove(); begin(); },
      onExit: exit,
    });
  }

  function exit() {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    onExit();
  }

  life = MAX_HEARTS;
  score = 0;
  combo = 0;
  cleared = 0;
  renderHud();
  renderBins();
  startCard(body, {
    title: 'Chord Catcher',
    text: 'Each bubble plays a chord as it falls. Tap the bin that matches before it lands. More chord types unlock as you go!',
    stats: [{ label: 'Best score', value: data.best }, { label: 'Best combo', value: data.bestCombo }],
    button: 'Catch!',
    onStart: begin,
  });

  return () => {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
  };
}
