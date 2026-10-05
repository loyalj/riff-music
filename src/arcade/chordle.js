// Chordle: Wordle for chords. Find the hidden chord in six guesses. Every
// guess must be a real chord; each note comes back green (in the chord),
// gold (in the chord AND its root) or grey (not in it). You can listen to the
// mystery chord as a clue.
import { el, dayKey, noteName } from '../util.js';
import { chord, chordSymbol, QUALITIES, pretty, voice } from '../theory.js';
import { createPiano } from '../piano.js';
import { playSequence, unlock, sfx } from '../audio.js';
import { confetti, pulse, burst } from '../juice.js';
import { shell, gameData, saveGames, seeded } from './ui.js';

const ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAX_GUESSES = 6;
const MODES = {
  triads: { quals: ['maj', 'min', 'dim', 'aug'], weights: [45, 40, 10, 5], size: 3, label: 'Triads' },
  sevenths: { quals: ['maj7', 'dom7', 'min7'], weights: [1, 1, 1], size: 4, label: '7th chords' },
};

const pcsOf = (root, q) => QUALITIES[q].semis.map((s) => (root + s) % 12);
const nameOf = (root, q) => chordSymbol(ROOT_NAMES[root], q);
const longName = (root, q) => `${pretty(ROOT_NAMES[root])} ${QUALITIES[q].name}`;
const tonesOf = (root, q) => chord(ROOT_NAMES[root], q).map((n) => pretty(n)).join(' ');

function identify(pcs, quals) {
  const set = new Set(pcs);
  for (const r of pcs) for (const q of quals) {
    const c = pcsOf(r, q);
    if (c.length === set.size && c.every((p) => set.has(p))) return { root: r, q };
  }
  return null;
}

function pickWeighted(rand, items, weights) {
  let x = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((x -= weights[i]) <= 0) return items[i];
  return items[items.length - 1];
}

function puzzleFor(mode, rand) {
  const m = MODES[mode];
  return { root: Math.floor(rand() * 12), q: pickWeighted(rand, m.quals, m.weights), mode };
}

const play = (midis, arp = false) => playSequence(midis.map((m, i) => ({ midi: m, at: arp ? i * 0.28 : 0, dur: 1.6, vel: 0.55 })));
const voicing = (root, q) => voice(ROOT_NAMES[root], q);

export function start(root, { onExit }) {
  const data = gameData('chordle', { daily: {}, stats: { played: 0, won: 0, streak: 0, maxStreak: 0, lastWon: null, dist: [0, 0, 0, 0, 0, 0] }, practiceMode: 'triads' });
  const { hud, body } = shell(root, { title: 'Chordle', onExit, cls: 'cd' });
  const modeBtn = el('button', { class: 'ag-chip ag-btn' });
  const statsBtn = el('button', { class: 'ag-chip ag-btn', 'aria-label': 'Stats' }, '📊');
  const helpBtn = el('button', { class: 'ag-chip ag-btn', 'aria-label': 'How to play' }, '?');
  hud.append(modeBtn, helpBtn, statsBtn);

  let daily = true; // daily puzzle vs practice
  let puzzle, guesses, finished, won, picked;
  const today = dayKey();

  const info = el('div', { class: 'cd-info' });
  const board = el('div', { class: 'cd-board' });
  const mystery = el('button', { class: 'btn-speaker cd-mystery' }, '🔊 Hear the mystery chord');
  const arp = el('button', { class: 'cd-small' }, 'Note by note');
  const chips = el('div', { class: 'cd-chips' });
  const guessBtn = el('button', { class: 'btn primary cd-guess' }, 'Guess');
  const clearBtn = el('button', { class: 'cd-small' }, 'Clear');
  const msg = el('div', { class: 'cd-msg' });
  const piano = createPiano({ from: 60, to: 71, labels: 'all', onPress: toggle });
  const extraRow = el('div', { class: 'cd-extra' });
  body.append(info, el('div', { class: 'cd-listen' }, mystery, arp), board, msg, el('div', { class: 'cd-actions' }, clearBtn, chips, guessBtn), el('div', { class: 'piano-wrap cd-piano' }, piano.el), extraRow);

  mystery.onclick = () => { unlock(); pulse(mystery, 'pulse'); play(voicing(puzzle.root, puzzle.q)); };
  arp.onclick = () => { unlock(); play(voicing(puzzle.root, puzzle.q).slice(1), true); };
  clearBtn.onclick = () => { picked.clear(); refreshPicked(); };
  guessBtn.onclick = submit;
  modeBtn.onclick = () => { daily = !daily; load(); };
  statsBtn.onclick = showStats;
  helpBtn.onclick = showHelp;

  function load() {
    picked = new Set();
    msg.textContent = '';
    extraRow.replaceChildren();
    if (daily) {
      puzzle = puzzleFor('triads', seeded(`chordle-${today}`));
      const saved = data.daily[today] || { guesses: [], done: false, won: false };
      guesses = saved.guesses.slice();
      finished = saved.done;
      won = saved.won;
      modeBtn.textContent = '📅 Daily';
      info.textContent = `Daily puzzle · ${today}. Find the triad in ${MAX_GUESSES} guesses.`;
    } else {
      puzzle = puzzleFor(data.practiceMode, Math.random);
      guesses = [];
      finished = false;
      won = false;
      modeBtn.textContent = '♾️ Practice';
      info.textContent = `Practice · ${MODES[data.practiceMode].label}. Unlimited puzzles.`;
      const toggleMode = el('button', { class: 'cd-small' }, data.practiceMode === 'triads' ? 'Switch to 7th chords' : 'Switch to triads');
      toggleMode.onclick = () => { data.practiceMode = data.practiceMode === 'triads' ? 'sevenths' : 'triads'; saveGames(); load(); };
      extraRow.append(toggleMode);
    }
    renderBoard();
    refreshPicked();
    if (finished) showEnd(false);
  }

  const size = () => MODES[puzzle.mode].size;

  function toggle(m) {
    if (finished) return;
    const p = m % 12;
    const key = [...picked].find((x) => x % 12 === p);
    if (key != null) picked.delete(key);
    else if (picked.size < size()) picked.add(m);
    else {
      pulse(chips, 'shake');
      return;
    }
    refreshPicked();
  }

  function refreshPicked() {
    piano.clear('selected');
    for (const m of picked) piano.mark(m, 'selected');
    const list = [...picked].sort((a, b) => a - b);
    chips.replaceChildren(...Array.from({ length: size() }, (_, i) => el('span', { class: `seq-chip ${list[i] != null ? 'done' : ''}` }, list[i] != null ? noteName(list[i], 'both') : '?')));
    guessBtn.disabled = finished || picked.size !== size();
    paintKeys();
  }

  // Colour the keyboard by what's known so far, like Wordle's keyboard.
  function paintKeys() {
    piano.clear('cd-in', 'cd-out', 'cd-root');
    const target = pcsOf(puzzle.root, puzzle.q);
    for (const g of guesses) for (const p of g) {
      const cls = p === puzzle.root ? 'cd-root' : target.includes(p) ? 'cd-in' : 'cd-out';
      piano.mark(60 + p, cls);
    }
  }

  function feedback(g) {
    const target = pcsOf(puzzle.root, puzzle.q);
    return g.map((p) => (p === puzzle.root ? 'root' : target.includes(p) ? 'in' : 'out'));
  }

  function renderBoard() {
    board.replaceChildren();
    for (let r = 0; r < MAX_GUESSES; r++) {
      const g = guesses[r];
      const row = el('div', { class: `cd-row ${g ? 'filled' : ''}` });
      if (g) {
        const id = identify(g, MODES[puzzle.mode].quals);
        const ordered = id ? pcsOf(id.root, id.q) : g;
        const fb = feedback(ordered);
        // Spell notes as the chord would (A major shows C♯, not D♭).
        const spelledNames = id ? chord(ROOT_NAMES[id.root], id.q).map((n) => pretty(n)) : ordered.map((p) => pretty(ROOT_NAMES[p]));
        ordered.forEach((p, i) => row.append(el('div', { class: `cd-cell ${fb[i]}`, style: { '--i': i } }, spelledNames[i])));
        const replay = el('button', { class: 'cd-replay', 'aria-label': 'Play this guess' }, '🔈');
        replay.onclick = () => { unlock(); play(ordered.map((p) => 60 + p)); };
        row.append(el('div', { class: 'cd-name' }, id ? nameOf(id.root, id.q) : ''), replay);
      } else {
        for (let i = 0; i < size(); i++) row.append(el('div', { class: 'cd-cell blank' }));
        row.append(el('div', { class: 'cd-name' }), el('span', { class: 'cd-replay ghost' }, '🔈'));
      }
      board.append(row);
    }
  }

  function submit() {
    if (finished || picked.size !== size()) return;
    unlock();
    const pcs = [...picked].map((m) => m % 12);
    const id = identify(pcs, MODES[puzzle.mode].quals);
    if (!id) {
      msg.textContent = size() === 3 ? 'That\'s not a triad. Stack 3rds: root, 3rd, 5th.' : 'That\'s not a 7th chord. Stack four notes in 3rds.';
      pulse(chips, 'shake');
      sfx('wrong');
      return;
    }
    if (guesses.some((g) => g.length === pcs.length && g.every((p) => pcs.includes(p)))) {
      msg.textContent = 'You already tried that one.';
      pulse(chips, 'shake');
      return;
    }
    play([...picked].sort((a, b) => a - b));
    guesses.push(pcs);
    picked.clear();
    const target = pcsOf(puzzle.root, puzzle.q);
    won = target.length === pcs.length && target.every((p) => pcs.includes(p));
    finished = won || guesses.length >= MAX_GUESSES;
    msg.textContent = won ? '' : `${nameOf(id.root, id.q)}: ${feedback(pcs).filter((f) => f !== 'out').length} of ${size()} notes in the chord.`;
    renderBoard();
    refreshPicked();
    if (daily) {
      data.daily[today] = { guesses, done: finished, won };
      if (finished) recordDaily();
      saveGames();
    }
    if (finished) setTimeout(() => showEnd(true), 600);
  }

  function recordDaily() {
    const s = data.stats;
    s.played++;
    if (won) {
      s.won++;
      s.dist[guesses.length - 1]++;
      const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); })();
      s.streak = s.lastWon === yesterday ? s.streak + 1 : 1;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      s.lastWon = today;
    } else s.streak = 0;
  }

  function showEnd(fresh) {
    const name = longName(puzzle.root, puzzle.q);
    if (won) {
      msg.replaceChildren(el('b', {}, `🎉 ${name}!`), ` ${tonesOf(puzzle.root, puzzle.q)} · solved in ${guesses.length}`);
      if (fresh) {
        sfx('complete');
        confetti(120);
        burst(board, { count: 24, speed: 6 });
        play(voicing(puzzle.root, puzzle.q), true);
      }
    } else {
      msg.replaceChildren(el('b', {}, `It was ${name}`), ` (${tonesOf(puzzle.root, puzzle.q)}). Next time!`);
      if (fresh) play(voicing(puzzle.root, puzzle.q));
    }
    extraRow.replaceChildren();
    if (daily) {
      const share = el('button', { class: 'btn secondary small' }, 'Copy result');
      share.onclick = async () => {
        const grid = guesses.map((g) => {
          const id = identify(g, MODES[puzzle.mode].quals);
          return feedback(id ? pcsOf(id.root, id.q) : g).map((f) => (f === 'root' ? '🟨' : f === 'in' ? '🟩' : '⬛')).join('');
        }).join('\n');
        try {
          await navigator.clipboard.writeText(`Chordle ${today} ${won ? guesses.length : 'X'}/${MAX_GUESSES}\n${grid}`);
          share.textContent = 'Copied ✓';
        } catch {}
      };
      const next = el('button', { class: 'cd-small' }, 'Play practice puzzles →');
      next.onclick = () => { daily = false; load(); };
      extraRow.append(share, next, el('div', { class: 'cd-next' }, nextIn()));
    } else {
      const again = el('button', { class: 'btn primary small' }, 'New puzzle');
      again.onclick = load;
      extraRow.append(again);
    }
  }

  function nextIn() {
    const d = new Date();
    const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const mins = Math.round((mid - d) / 60000);
    return `Next daily Chordle in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  function overlay(...content) {
    const o = el('div', { class: 'ag-over' }, el('div', { class: 'ag-over-card' }, ...content, el('button', { class: 'btn primary', onclick: () => o.remove() }, 'Got it')));
    body.append(o);
  }

  function showStats() {
    const s = data.stats;
    const maxD = Math.max(1, ...s.dist);
    overlay(el('h2', {}, 'Daily stats'),
      el('div', { class: 'ag-stats' },
        el('div', { class: 'ag-stat' }, el('span', {}, 'Played'), el('b', {}, String(s.played))),
        el('div', { class: 'ag-stat' }, el('span', {}, 'Win %'), el('b', {}, String(s.played ? Math.round((s.won / s.played) * 100) : 0))),
        el('div', { class: 'ag-stat' }, el('span', {}, 'Streak'), el('b', {}, String(s.streak))),
        el('div', { class: 'ag-stat' }, el('span', {}, 'Best streak'), el('b', {}, String(s.maxStreak)))),
      el('div', { class: 'cd-dist' }, s.dist.map((n, i) => el('div', { class: 'cd-dist-row' }, el('span', {}, String(i + 1)), el('i', { style: { width: `${Math.max(8, (n / maxD) * 100)}%` } }, String(n))))),
      el('p', { class: 'muted small' }, 'Chordle has its own streak. It doesn\'t touch your lesson streak or XP.'));
  }

  function showHelp() {
    overlay(el('h2', {}, 'How to play'),
      el('p', {}, 'Find the hidden chord in 6 guesses. Tap keys to build a chord, then Guess. Every guess must be a real chord.'),
      el('div', { class: 'cd-legend' },
        el('div', {}, el('span', { class: 'cd-cell root' }, 'C'), ' In the chord, and it\'s the root'),
        el('div', {}, el('span', { class: 'cd-cell in' }, 'E'), ' In the chord'),
        el('div', {}, el('span', { class: 'cd-cell out' }, 'F'), ' Not in the chord')),
      el('p', {}, 'Stuck? Listen to the mystery chord. Does it sound major, minor, tense or dreamy?'));
  }

  load();
  if (!data.seenHelp) {
    data.seenHelp = true;
    saveGames();
    showHelp();
  }
  return () => {};
}
