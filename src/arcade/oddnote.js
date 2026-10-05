// Odd Note Out: a short tune loops in a key, then one note slips out of key.
// Hit THAT ONE! the moment you hear it. Faster = more points; jumping the gun
// costs a heart. Wrong notes get subtler and tunes longer as you go.
import { el, noteName } from '../util.js';
import { MAJOR, NAT_MINOR, pretty } from '../theory.js';
import { playSequence, now, unlock, sfx } from '../audio.js';
import { eventAudioTime } from '../rhythm.js';
import { createRhino } from '../mascot.js';
import { burst, pulse } from '../juice.js';
import { shell, gameOver, gameData, saveGames, withSound, startCard } from './ui.js';

const MAX_HEARTS = 3;
const TONICS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'];
const WINDOW = 1.6; // seconds after the odd note you have to react

export function start(root, { onExit }) {
  const data = gameData('oddnote', { best: 0, bestRounds: 0, runs: 0 });
  const { hud, body } = shell(root, { title: 'Odd Note Out', onExit: () => exit(), cls: 'on' });
  const hearts = el('div', { class: 'ag-chip' });
  const scoreEl = el('div', { class: 'ag-chip' }, '0');
  const roundEl = el('div', { class: 'ag-chip' }, 'Round 1');
  hud.append(hearts, roundEl, scoreEl);

  const riff = createRhino({ size: 90, mood: 'think' });
  const keyEl = el('div', { class: 'on-key' });
  const status = el('div', { class: 'on-status' }, 'Listen…');
  const lights = el('div', { class: 'on-lights' });
  const loopsEl = el('div', { class: 'on-loops' });
  const btn = el('button', { class: 'on-btn' }, el('b', {}, 'THAT ONE!'), el('span', {}, 'tap when you hear the wrong note'));
  body.append(el('div', { class: 'on-top' }, riff.el, el('div', {}, keyEl, status)), lights, loopsEl, btn);

  let score, life, round, alive = true, playing = false, judged = false, timers = [], cur = null;
  const later = (ms, fn) => timers.push(setTimeout(() => alive && fn(), ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function renderHud() {
    hearts.textContent = '❤️'.repeat(life) + '🤍'.repeat(MAX_HEARTS - life);
    scoreEl.textContent = String(score);
    roundEl.textContent = `Round ${round}`;
  }

  /** Build a round: a tune in a key, and which note on which loop goes wrong. */
  function makeRound() {
    const minor = round > 2 && Math.random() < 0.5;
    const tonicName = TONICS[Math.floor(Math.random() * TONICS.length)];
    const pattern = minor ? NAT_MINOR : MAJOR;
    const tonic = 60 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: -3, Bb: -2, Eb: 3 }[tonicName];
    const inScale = new Set(pattern.map((s) => (tonic + s) % 12));
    const len = Math.min(8, 5 + Math.floor(round / 3));
    // A singable random walk through the scale, starting and ending on home.
    let deg = 0;
    const degs = [0];
    while (degs.length < len - 1) {
      deg = Math.max(0, Math.min(7, deg + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      degs.push(deg);
    }
    degs.push(Math.random() < 0.5 ? 0 : 4);
    const tune = degs.map((d) => tonic + pattern[d]);
    // The odd note: never the first note; out of key; big jumps early, a half step later on.
    const pos = 1 + Math.floor(Math.random() * (len - 1));
    const orig = tune[pos];
    const subtle = round >= 6 || (round >= 3 && Math.random() < 0.5);
    const cands = [];
    for (let dx = -6; dx <= 6; dx++) {
      if (!dx || inScale.has((orig + dx + 120) % 12)) continue;
      if (subtle ? Math.abs(dx) === 1 : Math.abs(dx) >= 2) cands.push(orig + dx);
    }
    const odd = cands.length ? cands[Math.floor(Math.random() * cands.length)] : orig + 1;
    const oddLoop = round <= 2 ? 2 : 1 + Math.floor(Math.random() * 3); // loop index (0-based) where it happens
    const gap = Math.max(0.22, 0.34 - round * 0.01);
    return { tonicName, minor, tune, pos, odd, oddLoop, gap };
  }

  function playRound() {
    cur = makeRound();
    judged = false;
    playing = true;
    keyEl.textContent = `Key: ${pretty(cur.tonicName)} ${cur.minor ? 'minor' : 'major'}`;
    status.textContent = 'Listen to the tune…';
    status.className = 'on-status';
    riff.mood('think');
    lights.replaceChildren(...cur.tune.map(() => el('span', { class: 'on-light' })));
    const loops = cur.oddLoop + 1;
    loopsEl.replaceChildren(...Array.from({ length: loops }, (_, i) => el('span', { class: 'on-loop' }, String(i + 1))));
    const loopLen = cur.tune.length * cur.gap + cur.gap * 2; // a short breath between loops
    const t0 = now() + 0.35;
    const events = [];
    for (let l = 0; l < loops; l++) {
      cur.tune.forEach((m, i) => {
        const midi = l === cur.oddLoop && i === cur.pos ? cur.odd : m;
        const at = l * loopLen + i * cur.gap;
        events.push({ midi, at, dur: cur.gap * 0.95, vel: 0.75 });
        later((t0 - now() + at) * 1000, () => light(i, l));
      });
    }
    playSequence(events.map((e) => ({ ...e, at: e.at + (t0 - now()) })), 0);
    cur.oddAt = t0 + cur.oddLoop * loopLen + cur.pos * cur.gap;
    cur.endAt = cur.oddAt + WINDOW;
    later((cur.endAt - now()) * 1000, () => { if (!judged) missed(); });
  }

  function light(i, loop) {
    const ls = lights.children;
    for (const c of ls) c.classList.remove('on');
    ls[i]?.classList.add('on');
    [...loopsEl.children].forEach((c, k) => c.classList.toggle('on', k === loop));
    if (i === 0 && loop >= 1) status.textContent = 'Keep listening…';
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!playing || judged || !cur) return;
    unlock();
    pulse(btn, 'bump');
    const t = eventAudioTime(e);
    if (t < cur.oddAt - 0.06) {
      // False alarm: the note just played was fine.
      life--;
      sfx('wrong');
      status.textContent = 'Not yet! That note was fine.';
      status.className = 'on-status bad';
      pulse(body, 'shake');
      renderHud();
      if (life <= 0) {
        judged = true;
        playing = false;
        clearTimers();
        later(800, end);
      }
      return;
    }
    judged = true;
    const reaction = Math.max(0, t - cur.oddAt);
    const pts = Math.max(10, Math.round(100 - reaction * 55));
    score += pts;
    reveal(true, `${Math.round(reaction * 1000)} ms · +${pts}`);
  });

  function missed() {
    if (judged || !cur) return;
    judged = true;
    life--;
    sfx('wrong');
    reveal(false, 'Missed it!');
    renderHud();
  }

  function reveal(ok, msg) {
    playing = false;
    const lightEl = lights.children[cur.pos];
    lightEl?.classList.add(ok ? 'caught' : 'odd');
    lightEl && (lightEl.textContent = pretty(noteName(cur.odd)));
    status.textContent = `${ok ? '🎯 ' : ''}${msg} ${noteName(cur.odd, 'both')} isn't in ${pretty(cur.tonicName)} ${cur.minor ? 'minor' : 'major'}.`;
    status.className = `on-status ${ok ? 'good' : 'bad'}`;
    if (ok) {
      riff.mood('happy').react('jump');
      burst(lightEl || btn, { count: 16, speed: 5 });
      sfx('correct');
    } else {
      riff.mood('sad').react('droop');
    }
    renderHud();
    clearTimers();
    if (life <= 0) return later(1200, end);
    round++;
    later(2200, () => { renderHud(); playRound(); });
  }

  function begin() {
    withSound(body, () => {
      score = 0;
      life = MAX_HEARTS;
      round = 1;
      data.runs++;
      renderHud();
      clearTimers();
      later(300, playRound);
    });
  }

  function end() {
    playing = false;
    const rounds = round - 1;
    const newBest = score > data.best;
    data.best = Math.max(data.best, score);
    data.bestRounds = Math.max(data.bestRounds, rounds);
    saveGames();
    gameOver(body, {
      title: 'Ears tired?', newBest,
      stats: [
        { label: 'Score', value: score, best: newBest },
        { label: 'Rounds', value: rounds },
        { label: 'Best score', value: data.best },
        { label: 'Best rounds', value: data.bestRounds },
      ],
      onAgain: () => { body.querySelector('.ag-over')?.remove(); begin(); },
      onExit: exit,
    });
  }

  function exit() {
    alive = false;
    clearTimers();
    onExit();
  }

  score = 0;
  life = MAX_HEARTS;
  round = 1;
  renderHud();
  startCard(body, {
    title: 'Odd Note Out',
    text: 'A little tune loops in a key. At some point one note goes out of key. Tap THAT ONE! as soon as you hear it. Too early costs a heart!',
    stats: [{ label: 'Best score', value: data.best }, { label: 'Best rounds', value: data.bestRounds }],
    button: 'Listen!',
    onStart: begin,
    mood: 'think',
  });

  return () => {
    alive = false;
    clearTimers();
  };
}
