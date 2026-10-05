// Shared pieces for arcade games: screen shell, game-over card, personal bests.
import { el } from '../util.js';
import { state, save } from '../state.js';
import { createRhino } from '../mascot.js';
import { confetti, countUp } from '../juice.js';
import { sfx, unlock, ensureRunning } from '../audio.js';

/** Persistent data for one game (bests, stats). Not XP, not streak. */
export function gameData(id, defaults = {}) {
  state.arcade = state.arcade || {};
  state.arcade[id] = { ...defaults, ...(state.arcade[id] || {}) };
  return state.arcade[id];
}
export const saveGames = () => save();

/** Full-screen game frame with a back button and a slot for score chips. */
export function shell(root, { title, onExit, cls = '' }) {
  root.replaceChildren();
  const hud = el('div', { class: 'ag-hud' });
  const back = el('button', { class: 'ag-back', 'aria-label': 'Back to arcade' }, '✕');
  back.onclick = onExit;
  const head = el('header', { class: 'ag-head' }, back, el('div', { class: 'ag-title' }, title), hud);
  const body = el('div', { class: `ag-body ${cls}` });
  root.append(head, body);
  return { head, hud, body };
}

/**
 * Game-over card over the game.
 * stats: [{ label, value, best?: bool }]; newBest: bool
 */
export function gameOver(container, { title = 'Game over', stats = [], newBest = false, onAgain, onExit, extra = null, mood }) {
  const riff = createRhino({ size: 110, mood: mood || (newBest ? 'cheer' : 'happy') });
  const card = el('div', { class: 'ag-over-card' },
    riff.el,
    el('h2', {}, newBest ? 'New best! 🏆' : title),
    el('div', { class: 'ag-stats' }, stats.map((s) => {
      const v = el('b', {}, typeof s.value === 'number' ? '0' : s.value);
      if (typeof s.value === 'number') setTimeout(() => countUp(v, s.value, { ms: 700 }), 300);
      return el('div', { class: `ag-stat ${s.best ? 'best' : ''}` }, el('span', {}, s.label), v);
    })),
    extra,
    el('div', { class: 'ag-over-btns' },
      el('button', { class: 'btn primary', onclick: () => { unlock(); onAgain(); } }, 'Play again'),
      el('button', { class: 'btn ghost', onclick: onExit }, 'Back to arcade')),
  );
  const overlay = el('div', { class: 'ag-over' }, card);
  container.append(overlay);
  if (newBest) {
    sfx('streak');
    setTimeout(() => confetti(150), 200);
  }
  return overlay;
}

/**
 * Run `next` once sound is really playing. If the phone needs another tap
 * (iOS), show a card asking for it instead of starting a silent game.
 */
export async function withSound(container, next, label = 'Tap to start the sound') {
  unlock();
  if (await ensureRunning()) return next();
  const o = el('div', { class: 'ag-over' }, el('div', { class: 'ag-over-card' },
    el('h2', {}, '🔇 No sound yet'),
    el('p', {}, 'Your phone needs one more tap to start the sound.'),
    el('button', { class: 'btn primary', onclick: () => { o.remove(); withSound(container, next, label); } }, label)));
  container.append(o);
}

/** Start card shown before a game: title, blurb, a few stats, extra content and a big button. */
export function startCard(container, { title, text, stats = [], extra = null, button = 'Play!', onStart, mood = 'happy' }) {
  const o = el('div', { class: 'ag-over' }, el('div', { class: 'ag-over-card' },
    createRhino({ size: 100, mood }).el,
    el('h2', {}, title),
    el('p', {}, text),
    stats.length ? el('div', { class: 'ag-stats' }, stats.map((s) => el('div', { class: 'ag-stat' }, el('span', {}, s.label), el('b', {}, String(s.value))))) : null,
    extra,
    button ? el('button', { class: 'btn primary', onclick: () => { o.remove(); onStart(); } }, button) : null));
  container.append(o);
  return o;
}

/** Small seeded random generator (mulberry32), for daily puzzles. */
export function seeded(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
