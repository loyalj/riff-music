// Riff Run: a beat-keeper infinite runner. Obstacles arrive exactly on the
// rhythm of each bar; tap to jump on time. Rhythms get trickier and the tempo
// creeps up. The "next bar" panel shows the coming rhythm in notation.
import { el } from '../util.js';
import { now, drum, bass, click, playNote, unlock, sfx, ensureRunning } from '../audio.js';
import { onsets, durOf, renderRhythm, highlightToken } from '../notation.js';
import { createRhino } from '../mascot.js';
import { burst, pulse } from '../juice.js';
import { state } from '../state.js';
import { eventAudioTime } from '../rhythm.js';
import { shell, gameOver, gameData, saveGames } from './ui.js';

const PXB = 118; // pixels per beat: spacing stays readable as the tempo rises
const PERFECT = 0.05;
const GOOD = 0.12;
const MAX_HEARTS = 3;

const WARMUP = 2; // bars after the count-in with the groove but no speakers
const STAGES = [
  { from: WARMUP + 1, name: 'Here they come!', pats: [['h', 'h'], ['w'], ['h', 'hr'], ['q', 'qr', 'h']] },
  { from: WARMUP + 5, name: 'Quarter notes', pats: [['q', 'q', 'q', 'q'], ['q', 'q', 'h'], ['h', 'q', 'q'], ['q', 'qr', 'q', 'q'], ['q', 'q', 'q', 'qr']] },
  { from: WARMUP + 11, name: 'Eighth notes', pats: [['q', 'e', 'e', 'q', 'q'], ['e', 'e', 'q', 'e', 'e', 'q'], ['q', 'q', 'e', 'e', 'q'], ['e', 'e', 'e', 'e', 'h']] },
  { from: WARMUP + 19, name: 'Off-beats', pats: [['er', 'e', 'q', 'er', 'e', 'q'], ['q', 'er', 'e', 'q', 'er', 'e'], ['e', 'q', 'e', 'q', 'q'], ['er', 'e', 'er', 'e', 'er', 'e', 'er', 'e']] },
  { from: WARMUP + 29, name: 'Sixteenths', pats: [['s', 's', 'e', 'q', 'q', 'q'], ['q', 's', 's', 's', 's', 'q', 'q'], ['e', 's', 's', 'q', 'e', 's', 's', 'q'], ['s', 's', 's', 's', 'e', 'e', 'q', 'qr']] },
];
const stageFor = (bar) => [...STAGES].reverse().find((s) => bar >= s.from) || STAGES[0];
const bpmFor = (bar) => Math.min(132, 84 + Math.floor(Math.max(0, bar - WARMUP - 1) / 4) * 4);
const level = (st) => STAGES.indexOf(st); // 0..4, for the groove getting busier
const BASS_ROOTS = [45, 41, 48, 43]; // A F C G: the i–VI–III–VII loop
const REWARD = [0, 2, 4, 7, 9, 12, 14, 16]; // pentatonic chime that climbs with the combo

export function start(root, { onExit }) {
  const data = gameData('riffrun', { best: 0, bestCombo: 0, bestBars: 0, runs: 0 });
  const { hud, body } = shell(root, { title: 'Riff Run', onExit: () => exit(), cls: 'rr' });

  const hearts = el('div', { class: 'ag-chip rr-hearts' });
  const scoreEl = el('div', { class: 'ag-chip' }, '0');
  const multEl = el('div', { class: 'ag-chip rr-mult' }, '×1');
  const pauseBtn = el('button', { class: 'ag-chip ag-btn', 'aria-label': 'Pause' }, '❚❚');
  hud.append(hearts, scoreEl, multEl, pauseBtn);

  const nowBox = el('div', { class: 'rr-bar' }, el('span', { class: 'rr-bar-label' }, 'NOW'));
  const nextBox = el('div', { class: 'rr-bar next' }, el('span', { class: 'rr-bar-label' }, 'NEXT'));
  const notes = el('div', { class: 'rr-notes' }, nowBox, nextBox);

  const hills = el('div', { class: 'rr-hills' });
  const hills2 = el('div', { class: 'rr-hills far' });
  const ground = el('div', { class: 'rr-ground' });
  const lane = el('div', { class: 'rr-lane' });
  const riff = createRhino({ size: 84, mood: 'happy' });
  const runnerBody = el('div', { class: 'rr-body' }, riff.el);
  const runner = el('div', { class: 'rr-runner' }, runnerBody);
  const pops = el('div', { class: 'rr-pops' });
  const banner = el('div', { class: 'rr-banner' });
  const count = el('div', { class: 'rr-count' });
  const stage = el('div', { class: 'rr-stage' }, hills2, hills, ground, lane, runner, pops, banner, count);
  const meta = el('div', { class: 'rr-meta' });
  const hint = el('div', { class: 'rr-hint' }, 'Tap anywhere to jump on the beat');
  body.append(notes, stage, meta, hint);

  // ------------------------------------------------------------ game state
  let practice = [];
  let bars, obstacles, audioQ, uiQ, score, combo, bestCombo, life, running, paused, raf, lastBarShown;
  let pausedAt = 0, freezeUntil = 0, frozenBeat = 0, over = null;
  let lastT = 0, lastTickAt = 0; // last audio-clock reading, and when (wall clock) it last moved
  const latency = () => (state.settings.latencyMs || 0) / 1000;
  const riffX = () => Math.min(110, stage.clientWidth * 0.26);

  function reset() {
    bars = [];
    practice = [];
    obstacles = [];
    audioQ = [];
    uiQ = [];
    score = 0;
    combo = 0;
    bestCombo = 0;
    life = MAX_HEARTS;
    lastBarShown = -1;
    lane.replaceChildren();
    pops.replaceChildren();
    over?.remove();
    over = null;
    riff.mood('happy');
    renderHud();
  }

  function renderHud() {
    hearts.textContent = '❤️'.repeat(life) + '🤍'.repeat(MAX_HEARTS - life);
    scoreEl.textContent = String(score);
    multEl.textContent = `×${mult()}`;
  }
  const mult = () => Math.min(4, 1 + Math.floor(combo / 10));

  // ------------------------------------------------------------ planning bars
  function planBar() {
    const idx = bars.length;
    const prev = bars[idx - 1];
    const bpm = idx === 0 ? 84 : bpmFor(idx);
    const spb = 60 / bpm;
    const start = prev ? prev.start + 4 * prev.spb : now() + 0.4;
    const st = stageFor(idx);
    let tokens = null;
    const warm = idx >= 1 && idx <= WARMUP;
    if (warm) tokens = ['q', 'q', 'q', 'q']; // shown as "tap along", no speakers
    else if (idx > 0) {
      const pool = idx > WARMUP + 6 && Math.random() < 0.3 ? STAGES[Math.max(0, STAGES.indexOf(st) - 1)].pats : st.pats;
      tokens = pool[Math.floor(Math.random() * pool.length)];
    }
    const bar = { idx, start, spb, bpm, tokens, stage: st, warm };
    if (warm) for (let b = 0; b < 4; b++) practice.push(start + b * spb);
    bars.push(bar);

    // music
    for (let b = 0; b < 4; b++) {
      const t = start + b * spb;
      if (idx === 0) {
        audioQ.push({ t, fn: () => click(t, b === 0) });
        uiQ.push({ t, fn: () => showCount(b < 3 ? String(3 - b) : 'GO!') });
        continue;
      }
      if (b === 0 || b === 2) audioQ.push({ t, fn: () => drum('kick', t) });
      if (b === 1 || b === 3) audioQ.push({ t, fn: () => drum(level(st) >= 3 ? 'clap' : 'snare', t, 0.9) });
      if (level(st) >= 2 && b === 2) audioQ.push({ t: t + spb / 2, fn: () => drum('kick', t + spb / 2, 0.7) });
      for (const h of level(st) >= 4 ? [0, 0.25, 0.5, 0.75] : [0, 0.5]) audioQ.push({ t: t + h * spb, fn: () => drum('hat', t + h * spb, h === 0 ? 1 : 0.6) });
      uiQ.push({ t, fn: () => riff.bop() });
    }
    if (idx > 0) {
      const root = BASS_ROOTS[(idx - 1) % 4];
      for (const [o, n] of [[0, root], [1.5, root], [2, root + 12], [3, root + 7]]) audioQ.push({ t: start + o * spb, fn: () => bass(n, start + o * spb, spb * 0.8) });
      if (idx === 1) uiQ.push({ t: start, fn: () => showBanner('Tap along to the beat') });
      if (STAGES.some((s) => s.from === idx)) uiQ.push({ t: start, fn: () => showBanner(st.name) });
      if (!warm) for (const o of onsets(tokens)) {
        const ob = { beat: idx * 4 + o, time: start + o * spb, judged: false, el: el('div', { class: 'rr-ob' }, el('i')) };
        lane.append(ob.el);
        obstacles.push(ob);
      }
    }
    audioQ.sort((a, b) => a.t - b.t);
    uiQ.sort((a, b) => a.t - b.t);
  }

  function planAhead(t) {
    // Keep two bars planned ahead so the NEXT panel is always ready.
    while (!bars.length || bars[bars.length - 1].start < t + 2 * 4 * bars[bars.length - 1].spb) planBar();
  }

  function barAt(t) {
    let b = bars[0];
    for (const x of bars) if (x.start <= t) b = x;
    return b;
  }
  const beatAt = (t) => {
    const b = barAt(t);
    return b.idx * 4 + (t - b.start) / b.spb;
  };

  // ------------------------------------------------------------ feedback
  function pop(text, cls = '') {
    const p = el('div', { class: `rr-pop ${cls}`, style: { left: `${riffX() + 20}px` } }, text);
    pops.append(p);
    setTimeout(() => p.remove(), 800);
  }
  function showCount(txt) {
    count.textContent = txt;
    pulse(count, 'rr-count-go');
  }
  function showBanner(txt) {
    banner.textContent = txt;
    pulse(banner, 'rr-banner-in');
  }
  function jump() {
    pulse(runner, 'rr-jump');
  }

  function hit(ob, d) {
    ob.judged = true;
    ob.el.classList.add('cleared');
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    const perfect = Math.abs(d) <= PERFECT;
    score += (perfect ? 20 : 10) * mult();
    pop(perfect ? 'Perfect!' : d < 0 ? 'Early' : 'Late', perfect ? 'perfect' : 'good');
    playNote(72 + REWARD[combo % REWARD.length], { when: now(), dur: 0.25, vel: 0.28 });
    if (perfect) burst({ x: stage.getBoundingClientRect().left + riffX() + 40, y: stage.getBoundingClientRect().top + stage.clientHeight - 120 }, { count: 8, speed: 3.5 });
    if (combo > 0 && combo % 30 === 0 && life < MAX_HEARTS) {
      life++;
      pop('+❤️', 'heart');
    }
    if (combo % 10 === 0) pulse(multEl, 'bump');
    renderHud();
  }

  function miss(ob) {
    ob.judged = true;
    ob.el.classList.add('knocked');
    combo = 0;
    life--;
    pulse(runnerBody, 'rr-stumble');
    pulse(stage, 'shake');
    riff.mood('sad');
    setTimeout(() => running && riff.mood('happy'), 700);
    sfx('wrong');
    navigator.vibrate?.(50);
    pop('Missed!', 'bad');
    renderHud();
    if (life <= 0) end();
  }

  function onTap(e) {
    if (!running || paused) return;
    e.preventDefault?.();
    unlock();
    jump();
    const t = eventAudioTime(e) - latency();
    let best = null;
    let bestD = Infinity;
    for (const ob of obstacles) {
      if (ob.judged) continue;
      const d = t - ob.time;
      if (Math.abs(d) < Math.abs(bestD)) {
        bestD = d;
        best = ob;
      }
    }
    if (best && Math.abs(bestD) <= GOOD) hit(best, bestD);
    else if (practice.length && t < practice[practice.length - 1] + 0.5) {
      const d = practice.reduce((acc, p) => (Math.abs(t - p) < Math.abs(acc) ? t - p : acc), Infinity);
      if (Math.abs(d) <= PERFECT) pop('On beat!', 'perfect');
      else if (Math.abs(d) <= GOOD * 1.5) pop(d < 0 ? 'Early' : 'Late', 'good');
    } else if (combo > 0) {
      combo = 0;
      pop('Off beat', 'meh');
      renderHud();
    }
  }

  // ------------------------------------------------------------ loop
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (paused) return;
    const t = now();
    const wall = performance.now();
    if (t < lastT - 0.05) return pause('Sound restarted. Tap Resume to carry on.'); // clock reset
    if (t > lastT) {
      lastT = t;
      lastTickAt = wall;
    } else if (wall - lastTickAt > 700) return pause('Sound paused. Tap Resume to carry on.'); // clock stalled
    planAhead(t);
    while (audioQ.length && audioQ[0].t < t + 0.5) audioQ.shift().fn(); // schedule half a second ahead
    while (uiQ.length && uiQ[0].t <= t) uiQ.shift().fn();

    const cb = t < freezeUntil ? frozenBeat : beatAt(t);
    const rx = riffX();
    runner.style.left = `${rx - 42}px`; // Riff's centre is the "on the beat" line
    for (const ob of obstacles) {
      const x = rx + (ob.beat - cb) * PXB;
      ob.el.style.transform = `translateX(${x}px)`;
      if (!ob.judged && t > ob.time + GOOD && t >= freezeUntil) miss(ob);
    }
    while (obstacles.length && rx + (obstacles[0].beat - cb) * PXB < -90) obstacles.shift().el.remove();
    if (!running) return;

    ground.style.backgroundPositionX = `${-cb * PXB}px`;
    hills.style.backgroundPositionX = `${-cb * PXB * 0.35}px`;
    hills2.style.backgroundPositionX = `${-cb * PXB * 0.15}px`;

    // notation panels: highlight the current note in NOW, show the following bar in NEXT
    const bar = barAt(t);
    if (bar.idx !== lastBarShown) {
      lastBarShown = bar.idx;
      setNotation(nowBox, bar.tokens);
      setNotation(nextBox, bars[bar.idx + 1]?.tokens);
      meta.textContent = bar.warm ? `${bar.bpm} BPM · Warm up: tap along with the beat` : bar.idx > 0 ? `${bar.bpm} BPM · ${bar.stage.name}` : 'Get ready…';
    }
    if (bar.tokens && nowBox._svg) {
      const pos = (t - bar.start) / bar.spb;
      let acc = 0;
      let cur = -1;
      bar.tokens.forEach((tok, i) => {
        if (pos >= acc - 0.05) cur = i;
        acc += durOf(tok);
      });
      if (cur !== nowBox._cur) {
        nowBox._cur = cur;
        highlightToken(nowBox._svg, cur);
      }
    }
  }

  function setNotation(box, tokens) {
    box._svg?.remove();
    box._svg = null;
    box._cur = -1;
    if (!tokens) return;
    box._svg = renderRhythm(tokens, { timeSig: false, compact: true, width: 220 });
    box.append(box._svg);
  }

  // ------------------------------------------------------------ run control
  /** Make sure sound is really running (iPhones need a tap) before the clock is trusted. */
  async function withSound(next, retryLabel) {
    unlock();
    if (await ensureRunning()) return next();
    over?.remove();
    over = el('div', { class: 'ag-over' }, el('div', { class: 'ag-over-card' },
      el('h2', {}, '🔇 No sound yet'),
      el('p', {}, 'Your phone needs one more tap to start the music.'),
      el('button', { class: 'btn primary', onclick: () => withSound(next, retryLabel) }, retryLabel)));
    body.append(over);
  }

  function begin() {
    withSound(() => {
      reset();
      running = true;
      paused = false;
      freezeUntil = 0;
      data.runs++;
      lastT = now();
      lastTickAt = performance.now();
      planAhead(lastT);
      // Hand the first clicks to the audio engine right away so its clock has something to play.
      while (audioQ.length && audioQ[0].t < lastT + 0.6) audioQ.shift().fn();
      raf = requestAnimationFrame(frame);
    }, 'Tap to start the music');
  }

  function end() {
    running = false;
    cancelAnimationFrame(raf);
    const barsSurvived = Math.max(0, barAt(now()).idx - WARMUP - 1);
    const newBest = score > data.best;
    data.best = Math.max(data.best, score);
    data.bestCombo = Math.max(data.bestCombo, bestCombo);
    data.bestBars = Math.max(data.bestBars, barsSurvived);
    saveGames();
    setTimeout(() => {
      over = gameOver(body, {
        title: 'Riff tripped!',
        newBest,
        mood: newBest ? 'cheer' : 'sad',
        stats: [
          { label: 'Score', value: score, best: newBest },
          { label: 'Best combo', value: bestCombo },
          { label: 'Bars', value: barsSurvived },
          { label: 'Best score', value: data.best },
        ],
        onAgain: begin,
        onExit: exit,
      });
    }, 700);
  }

  function pause(reason) {
    if (!running || paused) return;
    paused = true;
    pausedAt = lastT; // last good reading, in the clock everything was planned on
    frozenBeat = beatAt(pausedAt);
    over?.remove();
    over = el('div', { class: 'ag-over' }, el('div', { class: 'ag-over-card' },
      el('h2', {}, 'Paused'),
      reason ? el('p', {}, reason) : null,
      el('button', { class: 'btn primary', onclick: resume }, 'Resume'),
      el('button', { class: 'btn ghost', onclick: exit }, 'Quit')));
    body.append(over);
  }

  function resume() {
    withSound(resumeNow, 'Tap to resume');
  }

  function resumeNow() {
    over?.remove();
    over = null;
    const t = now();
    lastT = t;
    lastTickAt = performance.now();
    const spb = barAt(pausedAt).spb;
    const countIn = 4 * spb;
    const shift = t - pausedAt + countIn;
    // Push everything still to come later by the pause plus a count-in.
    for (const b of bars) if (b.start + 4 * b.spb > pausedAt) b.start += shift;
    for (const ob of obstacles) if (ob.time > pausedAt - GOOD) ob.time += shift;
    for (const q of [audioQ, uiQ]) for (const ev of q) if (ev.t > pausedAt) ev.t += shift;
    freezeUntil = t + countIn;
    for (let b = 0; b < 4; b++) {
      const at = t + b * spb;
      audioQ.push({ t: at, fn: () => click(at, b === 0) });
      uiQ.push({ t: at, fn: () => showCount(b < 3 ? String(3 - b) : 'GO!') });
    }
    audioQ.sort((a, b) => a.t - b.t);
    uiQ.sort((a, b) => a.t - b.t);
    paused = false;
  }

  function exit() {
    running = false;
    cancelAnimationFrame(raf);
    cleanup();
    onExit();
  }

  const key = (e) => {
    if (e.code === 'Space' && !e.repeat) onTap(e);
  };
  const vis = () => document.visibilityState === 'hidden' && pause();
  stage.addEventListener('pointerdown', onTap);
  pauseBtn.addEventListener('click', () => (paused ? resume() : pause()));
  document.addEventListener('keydown', key);
  document.addEventListener('visibilitychange', vis);
  function cleanup() {
    document.removeEventListener('keydown', key);
    document.removeEventListener('visibilitychange', vis);
  }

  // Start screen
  over = el('div', { class: 'ag-over' }, el('div', { class: 'ag-over-card' },
    createRhino({ size: 110, mood: 'happy' }).el,
    el('h2', {}, 'Riff Run'),
    el('p', {}, 'Speaker stacks arrive on the rhythm. Tap to jump exactly on each one. The bar at the top shows the rhythm coming up.'),
    el('div', { class: 'ag-stats' },
      el('div', { class: 'ag-stat' }, el('span', {}, 'Best score'), el('b', {}, String(data.best))),
      el('div', { class: 'ag-stat' }, el('span', {}, 'Best combo'), el('b', {}, String(data.bestCombo)))),
    el('button', { class: 'btn primary', onclick: begin }, 'Run!')));
  body.append(over);
  renderHud();

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    cleanup();
  };
}
