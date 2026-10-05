// Melody Memory: Simon with a piano. Riff plays a melody, you play it back.
// Every round adds one note. How long a melody can you remember?
import { el, noteName } from '../util.js';
import { createPiano } from '../piano.js';
import { playNote, playSequence, now, unlock, sfx } from '../audio.js';
import { createRhino } from '../mascot.js';
import { burst, pulse } from '../juice.js';
import { shell, gameOver, gameData, saveGames } from './ui.js';

const MODES = {
  pent: { name: 'Pentatonic', desc: '6 keys that always sound good', keys: [60, 62, 64, 67, 69, 72], emoji: '🌤️' },
  major: { name: 'Major scale', desc: 'All the white keys', keys: [60, 62, 64, 65, 67, 69, 71, 72], emoji: '🎹' },
  chroma: { name: 'Chromatic', desc: 'Every key. For brave ears', keys: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72], emoji: '🔥' },
};

export function start(root, { onExit }) {
  const data = gameData('memory', { pent: 0, major: 0, chroma: 0, runs: 0 });
  const { hud, body } = shell(root, { title: 'Melody Memory', onExit: () => exit(), cls: 'mm' });
  const lenChip = el('div', { class: 'ag-chip' }, 'Length 0');
  const bestChip = el('div', { class: 'ag-chip' }, '');
  hud.append(lenChip, bestChip);

  let mode = 'pent';
  let seq = [];
  let idx = 0;
  let turn = false;
  let alive = true;
  let timers = [];
  let piano = null;
  let over = null;

  const riff = createRhino({ size: 96, mood: 'happy' });
  const status = el('div', { class: 'mm-status' }, 'Listen…');
  const dots = el('div', { class: 'mm-dots' });
  const top = el('div', { class: 'mm-top' }, riff.el, el('div', {}, status, dots));
  const replay = el('button', { class: 'cd-small mm-replay' }, '🔁 Hear it again (once per round)');
  const pianoWrap = el('div', { class: 'piano-wrap mm-piano' });
  body.append(top, pianoWrap, replay);

  const later = (ms, fn) => timers.push(setTimeout(() => alive && fn(), ms));
  let replayUsed = false;

  function setup(m) {
    mode = m;
    piano = createPiano({ from: 60, to: 72, labels: 'white', allowed: new Set(MODES[m].keys), onPress: press });
    pianoWrap.replaceChildren(piano.el);
    bestChip.textContent = `Best ${data[m]}`;
  }

  function begin(m = mode) {
    unlock();
    over?.remove();
    over = null;
    timers.forEach(clearTimeout);
    timers = [];
    setup(m);
    seq = [];
    data.runs++;
    riff.mood('happy');
    nextRound();
  }

  function nextRound() {
    const keys = MODES[mode].keys;
    let n;
    do n = keys[Math.floor(Math.random() * keys.length)];
    while (seq.length >= 2 && n === seq[seq.length - 1] && n === seq[seq.length - 2]);
    seq.push(n);
    idx = 0;
    replayUsed = false;
    replay.disabled = true;
    lenChip.textContent = `Length ${seq.length}`;
    renderDots();
    later(500, playMelody);
  }

  function playMelody() {
    turn = false;
    piano.setDisabled(true);
    status.textContent = 'Listen…';
    status.className = 'mm-status listen';
    const gap = Math.max(0.3, 0.62 - seq.length * 0.022);
    const t0 = playSequence(seq.map((m, i) => ({ midi: m, at: i * gap, dur: gap * 0.9, vel: 0.75 })));
    seq.forEach((m, i) => later((t0 - now() + i * gap) * 1000, () => { piano.flash(m, gap * 800); riff.bop(); }));
    later((t0 - now() + seq.length * gap) * 1000 + 150, () => {
      turn = true;
      piano.setDisabled(false);
      replay.disabled = replayUsed;
      status.textContent = 'Your turn!';
      status.className = 'mm-status go';
      pulse(status, 'bump');
    });
  }

  replay.onclick = () => {
    if (!turn || replayUsed) return;
    replayUsed = true;
    idx = 0;
    renderDots();
    playMelody();
  };

  function renderDots() {
    dots.replaceChildren(...seq.map((_, i) => el('span', { class: `mm-dot ${i < idx ? 'on' : ''}` })));
  }

  function press(m) {
    if (!turn) return;
    const want = seq[idx];
    if (m === want) {
      piano.mark(m, 'correct');
      later(220, () => piano.unmark(m, 'correct'));
      idx++;
      renderDots();
      if (idx === seq.length) {
        turn = false;
        piano.setDisabled(true);
        status.textContent = seq.length >= 5 && seq.length % 5 === 0 ? `${seq.length} notes! 🔥` : pickCheer();
        status.className = 'mm-status good';
        riff.react('jump');
        burst(dots, { count: 12, speed: 4 });
        later(250, () => sfx('correct'));
        later(1000, nextRound);
      }
    } else {
      turn = false;
      piano.setDisabled(true);
      piano.mark(m, 'wrong');
      piano.mark(want, 'correct');
      sfx('wrong');
      riff.mood('sad').react('droop');
      status.textContent = `It was ${noteName(want, 'both')}`;
      status.className = 'mm-status bad';
      pulse(body, 'shake');
      later(1100, end);
    }
  }

  const CHEERS = ['Nice!', 'Got it!', 'Sharp ears!', 'Yes!', 'Groovy!'];
  const pickCheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

  function end() {
    const reached = seq.length - 1;
    const newBest = reached > data[mode];
    data[mode] = Math.max(data[mode], reached);
    saveGames();
    bestChip.textContent = `Best ${data[mode]}`;
    const hear = el('button', { class: 'cd-small' }, '🔈 Hear the whole melody');
    const melody = seq.slice();
    hear.onclick = () => { unlock(); playSequence(melody.map((m, i) => ({ midi: m, at: i * 0.38, dur: 0.36, vel: 0.75 }))); };
    over = gameOver(body, {
      title: 'Melody over!',
      newBest,
      stats: [
        { label: 'Notes remembered', value: reached, best: newBest },
        { label: `Best (${MODES[mode].name})`, value: data[mode] },
      ],
      extra: el('div', { class: 'mm-over-extra' }, hear, modePicker(true)),
      onAgain: () => begin(mode),
      onExit: exit,
    });
  }

  function modePicker(compact = false) {
    return el('div', { class: `mm-modes ${compact ? 'compact' : ''}` }, Object.entries(MODES).map(([k, m]) =>
      el('button', { class: `mm-mode ${k === mode ? 'selected' : ''}`, onclick: () => begin(k) },
        el('span', { class: 'mm-mode-emoji' }, m.emoji),
        el('div', {}, el('b', {}, m.name), compact ? null : el('span', {}, m.desc)),
        el('span', { class: 'mm-mode-best' }, `Best ${data[k]}`))));
  }

  function exit() {
    alive = false;
    timers.forEach(clearTimeout);
    onExit();
  }

  // Start screen: pick a mode
  setup('pent');
  piano.setDisabled(true);
  over = el('div', { class: 'ag-over' }, el('div', { class: 'ag-over-card' },
    createRhino({ size: 100, mood: 'happy' }).el,
    el('h2', {}, 'Melody Memory'),
    el('p', {}, 'Riff plays a melody. Play it back. Each round adds a note.'),
    modePicker()));
  body.append(over);

  return () => {
    alive = false;
    timers.forEach(clearTimeout);
  };
}
