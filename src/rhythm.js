// Rhythm playback and tap-along timing evaluation.
import { click, tick, now, unlock } from './audio.js';
import { onsets, durOf, totalBeats } from './notation.js';
import { state } from './state.js';

/** Converts a pointer/key event's timestamp to audio-clock seconds. */
export function eventAudioTime(e) {
  const lag = e && e.timeStamp ? Math.max(0, performance.now() - e.timeStamp) / 1000 : 0;
  return now() - lag;
}

function scheduleUi(t, fn, timers) {
  const ms = Math.max(0, (t - now()) * 1000);
  timers.push(setTimeout(fn, ms));
}

/**
 * Play a rhythm with taps (and optional metronome).
 * opts: { bpm, countIn: beats, metronome: bool, onToken(i), onEnd() }
 */
export function playRhythm(tokens, opts = {}) {
  unlock();
  const { bpm = 80, countIn = 0, metronome = true } = opts;
  const spb = 60 / bpm;
  const timers = [];
  const t0 = now() + 0.15 + countIn * spb;
  for (let b = -countIn; b < 4; b++) {
    if (b < 0 || metronome) click(t0 + b * spb, b === -countIn || b === 0);
    scheduleUi(t0 + b * spb, () => opts.onBeat?.(b), timers);
  }
  let t = 0;
  tokens.forEach((tok, i) => {
    const at = t0 + t * spb;
    if (!tok.endsWith('r')) tick(at);
    scheduleUi(at, () => opts.onToken?.(i), timers);
    t += durOf(tok);
  });
  const end = t0 + totalBeats(tokens) * spb;
  scheduleUi(end, () => {
    opts.onToken?.(-1);
    opts.onEnd?.();
  }, timers);
  return { t0, spb, stop: () => timers.forEach(clearTimeout) };
}

/**
 * Run a tap-along attempt: count-in, then user taps the rhythm while the metronome plays.
 * Returns a controller: { tap(e), stop() }. Calls opts.onDone(result) when finished.
 * opts: { bpm, onBeat(beatIndex), onToken(i), onDone }
 */
export function tapSession(tokens, opts) {
  unlock();
  const { bpm = 80 } = opts;
  const spb = 60 / bpm;
  const countIn = 4;
  const timers = [];
  const t0 = now() + 0.2 + countIn * spb;
  for (let b = -countIn; b < 4; b++) {
    click(t0 + b * spb, b === -countIn || b === 0);
    scheduleUi(t0 + b * spb, () => opts.onBeat?.(b), timers);
  }
  let t = 0;
  tokens.forEach((tok, i) => {
    scheduleUi(t0 + t * spb, () => opts.onToken?.(i), timers);
    t += durOf(tok);
  });

  const taps = [];
  let done = false;
  const latency = (state.settings.latencyMs || 0) / 1000;
  const endAt = t0 + totalBeats(tokens) * spb + Math.min(0.6, spb * 0.75);
  scheduleUi(endAt, finish, timers);

  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    opts.onToken?.(-1);
    opts.onDone?.(evaluate(tokens, taps, t0, spb));
  }

  return {
    t0,
    spb,
    tap(e) {
      if (done) return;
      tick(now(), 0.8);
      taps.push(eventAudioTime(e) - latency);
    },
    stop() {
      done = true;
      timers.forEach(clearTimeout);
    },
  };
}

export function evaluate(tokens, taps, t0, spb) {
  const expected = onsets(tokens).map((b) => t0 + b * spb);
  let minGap = 4 * spb;
  for (let i = 1; i < expected.length; i++) minGap = Math.min(minGap, expected[i] - expected[i - 1]);
  const tol = Math.min(0.16, Math.max(0.07, minGap * 0.45));
  const relevant = taps.filter((x) => x > t0 - spb * 0.6);
  const used = new Set();
  const hits = [];
  const misses = [];
  for (const e of expected) {
    let best = -1;
    let bestErr = Infinity;
    relevant.forEach((x, i) => {
      if (used.has(i)) return;
      const err = Math.abs(x - e);
      if (err < bestErr) {
        bestErr = err;
        best = i;
      }
    });
    if (best >= 0 && bestErr <= tol) {
      used.add(best);
      hits.push({ at: e, tap: relevant[best], err: relevant[best] - e });
    } else misses.push(e);
  }
  const extras = relevant.filter((_, i) => !used.has(i));
  const avgErr = hits.length ? hits.reduce((a, h) => a + h.err, 0) / hits.length : 0;
  return {
    ok: misses.length === 0 && extras.length === 0,
    hits, misses, extras, avgErr, tol,
    rel: (x) => (x - t0) / spb, // convert time to beats for drawing
  };
}

/**
 * Latency calibration: plays clicks, user taps along. onDone(offsetMs) with
 * the median delay between clicks and taps.
 */
export function calibrate({ bpm = 90, beats = 12, onBeat, onDone }) {
  unlock();
  const spb = 60 / bpm;
  const t0 = now() + 0.3;
  const timers = [];
  const clicks = [];
  for (let b = 0; b < beats; b++) {
    const at = t0 + b * spb;
    clicks.push(at);
    click(at, b % 4 === 0);
    scheduleUi(at, () => onBeat?.(b), timers);
  }
  const taps = [];
  let done = false;
  scheduleUi(t0 + beats * spb + 0.4, () => {
    done = true;
    // ignore the first 4 beats while the user locks in
    const errs = [];
    for (const x of taps) {
      let best = Infinity;
      for (const c of clicks.slice(4)) if (Math.abs(x - c) < Math.abs(best)) best = x - c;
      if (Math.abs(best) < spb / 2) errs.push(best);
    }
    errs.sort((a, b) => a - b);
    onDone(errs.length >= 4 ? Math.round(errs[Math.floor(errs.length / 2)] * 1000) : null);
  }, timers);
  return {
    tap(e) {
      if (!done) taps.push(eventAudioTime(e));
    },
    stop() {
      done = true;
      timers.forEach(clearTimeout);
    },
  };
}
