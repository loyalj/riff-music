// Riff's Arcade: mini games for fun. No XP, no streak, just personal bests.
import { el, dayKey } from '../util.js';
import { state } from '../state.js';
import * as riffrun from './riffrun.js';
import * as chordle from './chordle.js';
import * as memory from './memory.js';
import * as catcher from './catcher.js';
import * as oddnote from './oddnote.js';
import * as noterain from './noterain.js';

const get = (id) => state.arcade?.[id] || {};

export const GAMES = [
  {
    id: 'riffrun', title: 'Riff Run', tag: 'Jump on the beat', art: '🏃‍♂️', theme: 'run', module: riffrun,
    stat: () => (get('riffrun').best ? `Best ${get('riffrun').best}` : 'New!'),
  },
  {
    id: 'chordle', title: 'Chordle', tag: 'Daily chord puzzle', art: '🧩', theme: 'chordle', module: chordle,
    stat: () => {
      const d = get('chordle').daily?.[dayKey()];
      if (d?.done) return d.won ? `Solved in ${d.guesses.length} ✓` : 'Try again tomorrow';
      return 'Today\'s puzzle ready';
    },
  },
  {
    id: 'memory', title: 'Melody Memory', tag: 'Repeat the melody', art: '🧠', theme: 'memory', module: memory,
    stat: () => {
      const m = get('memory');
      const best = Math.max(m.pent || 0, m.major || 0, m.chroma || 0);
      return best ? `Best ${best} notes` : 'New!';
    },
  },
  {
    id: 'catcher', title: 'Chord Catcher', tag: 'Sort the falling chords', art: '🎈', theme: 'catcher', module: catcher,
    stat: () => (get('catcher').best ? `Best ${get('catcher').best}` : 'New!'),
  },
  {
    id: 'oddnote', title: 'Odd Note Out', tag: 'Spot the wrong note', art: '🕵️', theme: 'oddnote', module: oddnote,
    stat: () => (get('oddnote').best ? `Best ${get('oddnote').best}` : 'New!'),
  },
  {
    id: 'noterain', title: 'Note Rain', tag: 'Read notes against the clock', art: '🌧️', theme: 'noterain', module: noterain,
    stat: () => {
      const n = get('noterain');
      const best = Math.max(n.treble || 0, n.bass || 0, n.both || 0);
      return best ? `Best ${best}` : 'New!';
    },
  },
];


/** The arcade block for the Practice tab. openGame(game) launches one full screen. */
export function arcadeSection(openGame) {
  return el('section', { class: 'arcade' },
    el('div', { class: 'arcade-head' },
      el('h2', {}, '🕹️ Riff\'s Arcade'),
      el('p', {}, 'Just for fun. No XP, no streak, just your best scores.')),
    el('div', { class: 'arcade-grid' },
      GAMES.map((g, i) => el('button', { class: `arcade-tile t-${g.theme}`, style: { '--i': i }, onclick: () => openGame(g) },
        el('span', { class: 'at-art' }, g.art),
        el('b', { class: 'at-title' }, g.title),
        el('span', { class: 'at-tag' }, g.tag),
        el('span', { class: 'at-stat' }, g.stat())))));
}
