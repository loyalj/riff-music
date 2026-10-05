// Exercise renderers. Each takes (spec, ctx) and draws into ctx.body.
// ctx: { body, submit(correct, { answer, explain }), setCheck(fn|null), setContinue() }
import { el, noteName, namesFor, pc } from './util.js';
import { createPiano } from './piano.js';
import { playNote, playSequence, unlock, click, now } from './audio.js';
import { renderRhythm, highlightToken, TOKEN_NAMES, durOf } from './notation.js';
import { playRhythm, tapSession } from './rhythm.js';
import { createRhino } from './mascot.js';
import { burst } from './juice.js';
import { renderStaff } from './theory.js';

const prompt = (text, sub) =>
  el('div', { class: 'prompt' }, el('h2', {}, text), sub ? el('p', { class: 'sub' }, sub) : null);

function speakerButton(onPlay, label = 'Play') {
  const b = el('button', { class: 'btn-speaker', 'aria-label': label }, el('span', { class: 'speaker-icon', html: SPEAKER }), el('span', {}, label));
  b.addEventListener('click', () => {
    unlock();
    b.classList.remove('pulse');
    void b.offsetWidth;
    b.classList.add('pulse');
    onPlay();
  });
  return b;
}

const SPEAKER = '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

/** Plays a list of midi notes one after another. */
function playMidis(midis, gap = 0.75, piano) {
  const t0 = playSequence(midis.map((m, i) => ({ midi: m, at: i * gap, dur: gap * 0.95 })));
  if (piano) midis.forEach((m, i) => setTimeout(() => piano.flash(m, gap * 900), (t0 - now() + i * gap) * 1000));
}

/** Plays events: [{ m: [midis], t: start sec, d: dur sec, v: velocity }], e.g. chords and progressions. */
export function playEvents(events, piano) {
  const flat = events.flatMap((e) => e.m.map((midi) => ({ midi, at: e.t, dur: e.d ?? 1, vel: e.v ?? 0.6 })));
  const t0 = playSequence(flat);
  if (piano) for (const e of events) e.m.forEach((m) => setTimeout(() => piano.flash(m, (e.d ?? 1) * 900), (t0 - now() + e.t) * 1000));
}

/** "You tapped E♭: 1 half step too low." */
function offBy(picked, target) {
  const diff = picked - target;
  const n = Math.abs(diff);
  const where = n === 12 ? 'an octave' : `${n} half step${n === 1 ? '' : 's'}`;
  return `You picked ${noteName(picked, 'both')}: ${where} too ${diff > 0 ? 'high' : 'low'}.`;
}

function staffBox(st, compact = false) {
  const items = st.items || (st.chord ? [{ notes: st.chord }] : (st.notes || []).map((n) => ({ notes: [n] })));
  return el('div', { class: 'staff-box' }, renderStaff({ clef: st.clef || 'treble', key: st.key || 0, items, compact }));
}

// ---------------------------------------------------------------- learn
function learn(spec, ctx) {
  const card = el('div', { class: 'learn' });
  const riff = createRhino({ size: 84, mood: 'happy', cls: 'learn-rhino' });
  riff.say(spec.title);
  setTimeout(() => riff.react('wave'), 150);
  card.append(el('div', { class: 'learn-head' }, riff.el, el('div', { class: 'learn-badge' }, 'New')), el('div', { class: 'learn-text', html: spec.text }));
  if (spec.piano) {
    const p = spec.piano;
    const piano = createPiano({ from: p.from ?? 60, to: p.to ?? 76, labels: p.labels ?? false });
    (p.marks || []).forEach((m) => piano.mark(m, 'hint'));
    card.append(el('div', { class: 'piano-wrap' }, piano.el));
    if (p.play) card.append(speakerButton(() => playMidis(p.play, p.gap ?? 0.7, piano), p.playLabel || 'Listen'));
  }
  if (spec.rhythm) {
    const svg = renderRhythm(spec.rhythm.tokens, { counts: spec.rhythm.counts !== false });
    card.append(el('div', { class: 'rhythm-box' }, svg));
    let ctl;
    card.append(speakerButton(() => {
      ctl?.stop();
      ctl = playRhythm(spec.rhythm.tokens, { bpm: spec.rhythm.bpm || 80, countIn: 4, onToken: (i) => highlightToken(svg, i) });
    }, 'Listen'));
    ctx.onCleanup(() => ctl?.stop());
  }
  if (spec.symbols) {
    card.append(el('div', { class: 'symbol-row' }, spec.symbols.map((t) => symbolCard(t, true))));
  }
  if (spec.staff) card.append(staffBox(spec.staff));
  if (spec.events) card.append(speakerButton(() => playEvents(spec.events), spec.eventsLabel || 'Listen'));
  ctx.body.append(card);
  ctx.setContinue();
}

function symbolCard(tok, withLabel) {
  const svg = renderRhythm([tok], { timeSig: false, width: 70, compact: true });
  return el('div', { class: 'symbol' }, svg, withLabel ? el('span', {}, `${TOKEN_NAMES[tok]} · ${beatsText(durOf(tok))}`) : null);
}

export const beatsText = (b) => {
  const n = { 0.25: '¼', 0.5: '½' }[b] ?? b;
  return `${n} beat${b === 1 || b < 1 ? '' : 's'}`;
};

// ---------------------------------------------------------------- findKey
// spec: { prompt, sub, target: midi|pc, accept: 'pc'|'midi', from, to, labels, marks }
function findKey(spec, ctx) {
  ctx.body.append(prompt(spec.prompt, spec.sub));
  if (spec.staff) ctx.body.append(staffBox(spec.staff, true));
  let piano;
  piano = createPiano({
    from: spec.from ?? 60,
    to: spec.to ?? 76,
    labels: spec.labels ?? false,
    onPress(m) {
      const ok = spec.accept === 'midi' ? m === spec.target : pc(m) === spec.target;
      piano.setDisabled(true);
      if (ok) {
        piano.mark(m, 'correct');
        burst(piano.keys.get(m), { count: 14, speed: 5 });
      }
      const info = { answer: spec.answer, explain: spec.explain };
      if (!ok) {
        piano.mark(m, 'wrong');
        const targets = [];
        for (const k of piano.keys.keys()) {
          if (spec.accept === 'midi' ? k === spec.target : pc(k) === spec.target) {
            piano.mark(k, 'correct');
            targets.push(k);
          }
        }
        const nearest = targets.sort((a, b) => Math.abs(a - m) - Math.abs(b - m))[0];
        if (nearest != null) {
          info.mistake = offBy(m, nearest);
          info.compare = { yours: () => playNote(m), right: () => playNote(nearest) };
        }
      }
      ctx.submit(ok, info);
    },
  });
  (spec.marks || []).forEach((m) => piano.mark(m, 'hint'));
  ctx.body.append(el('div', { class: 'piano-wrap grow' }, piano.el));
}

// ---------------------------------------------------------------- choice
// spec: { prompt, sub, options: [string | {token} | {rhythm}], correct: index,
//         media: {notes:[midis], gap} | {piano:{from,to,marks,labels}} | {rhythm, missing, counts} | {token} | {rhythmAudio, bpm},
//         answer, explain }
function choice(spec, ctx) {
  ctx.body.append(prompt(spec.prompt, spec.sub));
  const media = spec.media || {};
  const mediaBox = el('div', { class: 'media' });
  let piano = null;
  let ctl = null;

  if (media.piano) {
    piano = createPiano({ from: media.piano.from ?? 60, to: media.piano.to ?? 76, labels: media.piano.labels ?? false, sound: true });
    (media.piano.marks || []).forEach((m) => piano.mark(m, 'hint'));
    mediaBox.append(el('div', { class: 'piano-wrap' }, piano.el));
  }
  if (media.staff) mediaBox.append(staffBox(media.staff));
  if (media.notes) {
    const play = () => playMidis(media.notes, media.gap ?? 0.8, piano);
    mediaBox.append(speakerButton(play, media.label || 'Play again'));
    if (media.autoplay !== false) setTimeout(play, 350);
  }
  if (media.play) {
    const play = () => playEvents(media.play, piano);
    const row = el('div', { class: 'btn-row' }, speakerButton(play, media.label || 'Play again'));
    if (media.alt) row.append(speakerButton(() => playEvents(media.alt.play, piano), media.alt.label));
    mediaBox.append(row);
    if (media.autoplay !== false) setTimeout(play, 350);
  }
  if (media.rhythm) {
    mediaBox.append(el('div', { class: 'rhythm-box' }, renderRhythm(media.rhythm, { missing: media.missing || 0, counts: media.counts })));
  }
  if (media.token) mediaBox.append(el('div', { class: 'symbol-big' }, symbolCard(media.token, false)));
  if (media.rhythmAudio) {
    const play = () => {
      ctl?.stop();
      ctl = playRhythm(media.rhythmAudio, { bpm: media.bpm || 80, countIn: 4 });
    };
    mediaBox.append(speakerButton(play, 'Play rhythm'));
    setTimeout(play, 350);
    ctx.onCleanup(() => ctl?.stop());
  }
  if (mediaBox.childNodes.length) ctx.body.append(mediaBox);

  const rich = spec.options.some((o) => typeof o === 'object');
  const grid = el('div', { class: `choices ${rich ? 'rich' : ''} ${spec.options.length === 2 ? 'two' : ''}` });
  let selected = -1;
  const buttons = spec.options.map((o, i) => {
    let content;
    if (typeof o === 'string') content = o;
    else if (o.token) content = symbolCard(o.token, false);
    else if (o.rhythm) content = renderRhythm(o.rhythm, { compact: true });
    else if (o.staff) content = staffBox(o.staff, true);
    const b = el('button', { class: 'choice' }, content);
    b.addEventListener('click', () => {
      unlock();
      selected = i;
      buttons.forEach((x) => x.classList.toggle('selected', x === b));
      ctx.setCheck(check);
    });
    return b;
  });
  grid.append(...buttons);
  ctx.body.append(grid);

  function check() {
    const ok = selected === spec.correct;
    buttons[selected].classList.add(ok ? 'correct' : 'wrong');
    if (ok) burst(buttons[selected], { count: 14, speed: 5 });
    if (!ok) buttons[spec.correct].classList.add('correct');
    const right = spec.options[spec.correct];
    const pickedLabel = spec.options[selected];
    const info = { answer: spec.answer ?? (typeof right === 'string' ? right : null), explain: spec.explain };
    if (!ok && typeof pickedLabel === 'string') {
      // Explain this particular mistake, offer both sounds, and remember the mix-up.
      info.mistake = spec.whyWrong?.(pickedLabel, right) || null;
      if (spec.audioFor) {
        info.compare = {
          yours: () => playEvents(spec.audioFor(pickedLabel)),
          right: () => playEvents(spec.audioFor(right)),
        };
      }
      // Only answers that are real "things" (intervals, chords, notes...) count as mix-ups;
      // those questions are the ones that can explain or play each option.
      if (spec.whyWrong || spec.audioFor) info.confused = { right, wrong: pickedLabel };
    }
    if (spec.drillPair && typeof pickedLabel === 'string') info.drillPair = spec.drillPair;
    ctx.submit(ok, info);
  }
}

// ---------------------------------------------------------------- hearFind
// spec: { ref, target, from, to, refName }
function hearFind(spec, ctx) {
  ctx.body.append(prompt('Find the mystery note', `First you'll hear ${spec.refName || noteName(spec.ref)}, then the mystery note. Tap keys to explore, then check.`));
  let selected = null;
  const piano = createPiano({
    from: spec.from ?? 60,
    to: spec.to ?? 72,
    labels: 'c',
    onPress(m) {
      selected = m;
      piano.clear('selected');
      piano.mark(m, 'selected');
      ctx.setCheck(check);
    },
  });
  const play = () => playMidis([spec.ref, spec.target], 0.9);
  const playRef = () => playNote(spec.ref);
  const row = el('div', { class: 'btn-row' }, speakerButton(play, 'Both again'), speakerButton(playRef, spec.refName || noteName(spec.ref)));
  ctx.body.append(row, el('div', { class: 'piano-wrap grow' }, piano.el));
  setTimeout(play, 350);

  function check() {
    const ok = pc(selected) === pc(spec.target);
    piano.clear('selected');
    piano.mark(selected, ok ? 'correct' : 'wrong');
    if (ok) burst(piano.keys.get(selected), { count: 14, speed: 5 });
    if (!ok) piano.mark(spec.target, 'correct');
    const pickedNote = selected;
    ctx.submit(ok, ok ? { answer: noteName(spec.target, 'both') } : {
      answer: noteName(spec.target, 'both'),
      mistake: offBy(pickedNote, spec.target),
      compare: { yours: () => playMidis([spec.ref, pickedNote], 0.9), right: () => playMidis([spec.ref, spec.target], 0.9) },
    });
  }
}

// ---------------------------------------------------------------- tapRhythm
// spec: { tokens, bpm, counts }
function tapRhythm(spec, ctx) {
  ctx.body.append(prompt('Tap this rhythm', 'Press Start, wait for 4 clicks, then tap the pad on every note.'));
  const svg = renderRhythm(spec.tokens, { counts: spec.counts ?? true });
  const box = el('div', { class: 'rhythm-box' }, svg);
  const status = el('div', { class: 'tap-status' }, '');
  const pad = el('button', { class: 'tap-pad', 'aria-label': 'Tap pad' }, el('span', {}, 'TAP'));
  const riff = createRhino({ size: 76, mood: 'idle', cls: 'pad-rhino' });
  let session = null;
  let listenCtl = null;

  const listen = speakerButton(() => {
    session?.stop();
    listenCtl?.stop();
    listenCtl = playRhythm(spec.tokens, { bpm: spec.bpm, countIn: 4, onToken: (i) => highlightToken(svg, i), onBeat: () => riff.bop() });
  }, 'Listen');
  const start = el('button', { class: 'btn primary small' }, 'Start');
  start.addEventListener('click', begin);

  function begin() {
    unlock();
    listenCtl?.stop();
    session?.stop();
    start.disabled = true;
    pad.classList.add('armed');
    svg.querySelectorAll('.tok').forEach((n) => n.classList.remove('hit', 'miss'));
    session = tapSession(spec.tokens, {
      bpm: spec.bpm,
      onBeat(b) {
        riff.bop();
        status.textContent = b < 0 ? String(-b) : '';
        status.classList.toggle('counting', b < 0);
        pad.classList.toggle('go', b >= 0);
      },
      onToken: (i) => highlightToken(svg, i),
      onDone(res) {
        pad.classList.remove('armed', 'go');
        start.disabled = false;
        start.textContent = 'Again';
        showResult(res);
      },
    });
  }

  const tapHandler = (e) => {
    e.preventDefault();
    if (!session) return;
    pad.classList.remove('hitfx');
    void pad.offsetWidth;
    pad.classList.add('hitfx');
    const ring = el('span', { class: 'ripple' });
    pad.append(ring);
    setTimeout(() => ring.remove(), 500);
    session.tap(e);
  };
  pad.addEventListener('pointerdown', tapHandler);
  const key = (e) => {
    if (e.code === 'Space' && !e.repeat) tapHandler(e);
  };
  document.addEventListener('keydown', key);
  ctx.onCleanup(() => {
    document.removeEventListener('keydown', key);
    session?.stop();
    listenCtl?.stop();
  });

  function showResult(res) {
    // Color the notes that were hit/missed.
    const noteIdx = spec.tokens.map((t, i) => (t.endsWith('r') ? -1 : i)).filter((i) => i >= 0);
    const missedAt = new Set(res.misses.map((m) => Math.round(res.rel(m) * 100)));
    let ni = 0;
    for (const it of svg._items) {
      if (it.tok.endsWith('r')) continue;
      const missed = missedAt.has(Math.round(it.t * 100));
      it.node.classList.add(missed ? 'miss' : 'hit');
      ni++;
    }
    const hitCount = noteIdx.length - res.misses.length;
    let msg = `${hitCount} of ${noteIdx.length} notes on time`;
    if (res.extras.length) msg += ` · ${res.extras.length} extra tap${res.extras.length > 1 ? 's' : ''}`;
    let tip = '';
    if (res.hits.length >= 2 && Math.abs(res.avgErr) > 0.04) tip = res.avgErr > 0 ? 'You tended to tap a little late.' : 'You tended to tap a little early.';
    if (!res.ok && res.misses.length === noteIdx.length && !res.extras.length && !res.hits.length) msg = 'No taps detected';
    session = null;
    riff.mood(res.ok ? 'happy' : 'sad').react(res.ok ? 'jump' : 'droop');
    ctx.submit(res.ok, { answer: msg, explain: res.ok ? tip : `${tip} Count along out loud: ${countString(spec.tokens)}`.trim(), headline: res.ok ? null : msg });
  }

  ctx.body.append(box, el('div', { class: 'btn-row' }, listen, start), el('div', { class: 'pad-wrap grow' }, status, pad, riff.el));
}

function countString(tokens) {
  const SYL = { 0.25: 'e', 0.5: '&', 0.75: 'a' };
  let t = 0;
  const out = [];
  for (const tok of tokens) {
    const f = Math.round((t % 1) * 4) / 4;
    const s = SYL[f] ?? String(Math.floor(t) + 1);
    out.push(tok.endsWith('r') ? `(${s})` : s);
    t += durOf(tok);
  }
  return out.join(' ');
}

// ---------------------------------------------------------------- buildSeq
// Play a sequence of keys in order (e.g. a scale).
// spec: { prompt, sub, notes: [midis], names: [display names], from, to, marks, labels }
function buildSeq(spec, ctx) {
  ctx.body.append(prompt(spec.prompt, spec.sub));
  // Echo mode: hear a riff first, then play it back.
  if (spec.play) {
    const play = () => playEvents(spec.play);
    ctx.body.append(el('div', { class: 'btn-row' }, speakerButton(play, spec.playLabel || 'Play riff')));
    setTimeout(play, 400);
  }
  const chips = spec.notes.map(() => el('span', { class: 'seq-chip' }, '?'));
  ctx.body.append(el('div', { class: 'seq-chips' }, chips));
  let idx = 0;
  const piano = createPiano({
    from: spec.from, to: spec.to, labels: spec.labels ?? false,
    onPress(m) {
      const want = spec.notes[idx];
      if (m === want) {
        piano.mark(m, 'correct');
        chips[idx].textContent = spec.names[idx];
        chips[idx].classList.add('done');
        idx++;
        if (idx === spec.notes.length) {
          piano.setDisabled(true);
          burst(piano.el, { count: 22, speed: 6 });
          ctx.submit(true, { explain: spec.explain });
        }
      } else {
        piano.setDisabled(true);
        piano.mark(m, 'wrong');
        piano.mark(want, 'correct');
        chips[idx].classList.add('miss');
        chips.slice(idx).forEach((c, i) => (c.textContent = spec.names[idx + i]));
        const played = [...spec.notes.slice(0, idx), m];
        ctx.submit(false, {
          answer: spec.names.join(' '),
          mistake: `Note ${idx + 1} is ${spec.names[idx]}. ${offBy(m, want)}`,
          explain: spec.explain,
          compare: { yours: () => playMidis(played, 0.3), right: () => playMidis(spec.notes, 0.3) },
        });
      }
    },
  });
  (spec.marks || []).forEach((m) => piano.mark(m, 'hint'));
  ctx.body.append(el('div', { class: 'piano-wrap grow' }, piano.el));
}

// ---------------------------------------------------------------- buildChord
// Select keys to build a chord; any octave and order counts.
// spec: { prompt, sub, pcs: [pitch classes], names, voicing: [midis], from, to, marks }
function buildChord(spec, ctx) {
  ctx.body.append(prompt(spec.prompt, spec.sub));
  const chosen = new Set();
  const chipRow = el('div', { class: 'seq-chips' });
  const target = new Set(spec.pcs);
  const showChips = () => {
    chipRow.replaceChildren(...[...chosen].sort((a, b) => a - b).map((m) => el('span', { class: 'seq-chip done' }, noteName(m, 'both'))));
    if (!chosen.size) chipRow.append(el('span', { class: 'seq-hint' }, `Pick ${spec.pcs.length} notes`));
  };
  const piano = createPiano({
    from: spec.from, to: spec.to,
    onPress(m) {
      if (chosen.has(m)) {
        chosen.delete(m);
        piano.unmark(m, 'selected');
      } else {
        chosen.add(m);
        piano.mark(m, 'selected');
      }
      showChips();
      ctx.setCheck(chosen.size ? check : null);
    },
  });
  (spec.marks || []).forEach((m) => piano.mark(m, 'hint'));
  showChips();
  ctx.body.append(chipRow, el('div', { class: 'piano-wrap grow' }, piano.el));

  function check() {
    const pcs = new Set([...chosen].map(pc));
    const ok = pcs.size === target.size && [...target].every((p) => pcs.has(p)) && chosen.size === target.size;
    piano.clear('selected', 'hint');
    for (const m of chosen) piano.mark(m, target.has(pc(m)) ? 'correct' : 'wrong');
    if (!ok) spec.voicing.forEach((m) => !chosen.has(m) && piano.mark(m, 'correct'));
    playEvents([{ m: ok ? [...chosen] : spec.voicing, t: 0, d: 1.4 }]);
    if (ok) burst(piano.el, { count: 22, speed: 6 });
    const info = { answer: spec.names.join(' – '), explain: spec.explain };
    if (!ok) {
      const extra = [...chosen].filter((m) => !target.has(pc(m))).map((m) => noteName(m, 'both'));
      const missing = spec.voicing.filter((m) => ![...chosen].some((c) => pc(c) === pc(m))).map((m) => noteName(m, 'both'));
      const parts = [];
      if (extra.length) parts.push(`${extra.join(' and ')} ${extra.length > 1 ? "aren't" : "isn't"} in this chord`);
      if (missing.length) parts.push(`it still needs ${missing.join(' and ')}`);
      if (!parts.length) parts.push('each note should appear only once');
      info.mistake = parts.join('; ') + '.';
      const yours = [...chosen];
      info.compare = { yours: () => playEvents([{ m: yours, t: 0, d: 1.4 }]), right: () => playEvents([{ m: spec.voicing, t: 0, d: 1.4 }]) };
    }
    ctx.submit(ok, info);
  }
}

export const EXERCISES = { learn, findKey, choice, hearFind, tapRhythm, buildSeq, buildChord };
export { namesFor };
