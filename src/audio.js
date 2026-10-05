// Web Audio engine: a small synthesized piano, metronome clicks and UI sounds.
import { midiToFreq } from './util.js';

let ctx = null;
let master = null;
let unlocked = false;
let volume = 0.8;
// Set when the app goes to the background or the OS interrupts audio. The
// next real gesture resumes the same context and re-applies the volume,
// which is what reliably brings iOS audio back. (Closing and recreating the
// context on return made things worse: the old context's close finishes
// late and can deactivate the app's audio session under the new one.)
let needsWake = false;
let rebuilds = 0;
let lastError = '';

// iOS 17+: play Web Audio even when the ringer switch is on silent. Set it
// before any context exists so the first context starts in that mode.
function setSessionType() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
  } catch {}
}
setSessionType();

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC({ latencyHint: 'interactive' });
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = null; // buffers belong to a context
  ctx.onstatechange = () => {
    if (ctx && ctx.state !== 'running') needsWake = true;
  };
  return ctx;
}

// ---------------------------------------------------------------- dead-engine detection
// iOS sometimes hands back an engine that reports "running" but whose clock
// never moves, so nothing plays. A still clock alone is normal (iOS idles it
// when nothing is playing), so we only call it dead when sound was scheduled
// on a running engine and the clock still hasn't budged a moment later. The
// fix is a fresh engine created inside the next tap (iOS lets those play).
let pending = null; // { wall, ct }: when sound was scheduled and the clock reading then

function noteScheduled() {
  if (ctx && ctx.state === 'running' && !pending) pending = { wall: performance.now(), ct: ctx.currentTime };
}
function clockMoved() {
  if (pending && ctx && ctx.currentTime > pending.ct) pending = null;
}
function looksDead() {
  clockMoved();
  return !!pending && !!ctx && ctx.state === 'running' && performance.now() - pending.wall > 450;
}
/** Swap in a fresh engine. Only call from a tap. The dead one is abandoned, not closed. */
function replaceEngine() {
  ctx = null;
  master = null;
  unlocked = false;
  pending = null;
  rebuilds++;
  lastError = 'replaced a stuck engine';
  ensure();
}

/** Re-apply the master volume and push a silent sample through the graph. */
function kick() {
  try {
    master.gain.cancelScheduledValues(0);
    master.gain.setValueAtTime(volume, ctx.currentTime);
    master.gain.value = volume;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {
    lastError = String(e?.message || e);
  }
}

/**
 * After waking, note whether the audio clock moved. iPhones can legitimately
 * freeze it while nothing is playing, so a still clock is NOT treated as broken
 * (rebuilding the engine on that basis left iOS silent). We only ask for
 * another wake-up on the next tap.
 */
function watchdog() {
  const c = ctx;
  const t0 = c.currentTime;
  setTimeout(() => {
    if (c === ctx && c.state === 'running' && c.currentTime === t0) {
      lastError = 'clock idle';
      needsWake = true;
      if (!pending) pending = { wall: performance.now() - 1000, ct: t0 }; // kick() played but the clock didn't move
    }
  }, 1200);
}

/**
 * Wakes the audio engine. Safe to call often; does real work only when the
 * context needs it. Browsers only allow starting audio from real gestures
 * (tap release, click, key press), so installUnlockListeners() also wires
 * this to those events globally.
 */
export function unlock() {
  setSessionType();
  if (ctx && ctx.state === 'closed') {
    // A closed engine can never play again: start a fresh one on this tap.
    ctx = null;
    master = null;
    unlocked = false;
  }
  if (ctx && looksDead()) replaceEngine();
  ensure();
  if (ctx.state !== 'running' || needsWake) {
    const c = ctx;
    const p = c.state === 'running' ? Promise.resolve() : c.resume();
    p.then(() => {
      if (c !== ctx || c.state !== 'running') return;
      needsWake = false;
      kick();
      watchdog();
    }).catch((e) => {
      lastError = String(e?.message || e);
    });
  }
  if (!unlocked) {
    unlocked = true;
    kick();
    // Older iOS: playing an <audio> element switches the session so the silent switch is ignored.
    if (!navigator.audioSession) {
      try {
        const a = new Audio(silentWavUrl());
        a.setAttribute('playsinline', '');
        a.play().catch(() => {});
      } catch {}
    }
  }
}

function silentWavUrl() {
  const n = 2205;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Keep audio alive across gestures and app switches. Call once at startup. */
export function installUnlockListeners() {
  const wake = () => unlock();
  // These are the events browsers accept as permission to start audio.
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, wake, { capture: true, passive: true });
  }
  const sleep = () => {
    needsWake = true;
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sleep();
    else needsWake = true;
  });
  window.addEventListener('pagehide', sleep);
  window.addEventListener('pageshow', () => (needsWake = true));
  window.addEventListener('focus', () => (needsWake = true));
}

/**
 * Wake audio and wait until the clock is really moving. Resolves true once
 * it ticks, false if it didn't within `timeout` ms (on iOS that usually
 * means another tap is needed). Call it from a tap handler.
 */
export async function ensureRunning(timeout = 1500) {
  unlock();
  const startedAt = performance.now();
  let t0 = ctx ? ctx.currentTime : 0;
  while (performance.now() - startedAt < timeout) {
    await new Promise((r) => setTimeout(r, 60));
    if (!ctx) {
      ensure();
      t0 = ctx.currentTime;
    }
    // Running is enough: the clock may sit still until something plays (iOS).
    if (ctx.state === 'running') return true;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  return false;
}

/** For the Settings screen: what the audio engine is doing. */
export function audioStatus() {
  return {
    state: ctx ? ctx.state : 'not started',
    rate: ctx ? ctx.sampleRate : 0,
    session: navigator.audioSession ? navigator.audioSession.type : 'n/a',
    rebuilds,
    lastError,
  };
}

/** Manual "fix sound" for Settings: resume and re-kick from a tap. */
export function repairAudio() {
  needsWake = true;
  // This runs inside a tap, so a fresh engine created here is allowed to play.
  if (ctx && ctx.state === 'running' && (looksDead() || lastError === 'clock idle')) replaceEngine();
  unlock();
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

export function now() {
  const t = ensure().currentTime;
  clockMoved();
  return t;
}

export function getContext() {
  return ensure();
}

/** Estimated delay between scheduling a sound and it reaching the ears, in seconds. */
export function outputLatency() {
  ensure();
  return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
}

// Harmonic recipe for the piano-ish tone: [multiple, gain]
const PARTIALS = [[1, 1], [2, 0.42], [3, 0.2], [4, 0.1], [5, 0.05], [6, 0.03]];

/** Play a piano note. Returns the scheduled start time. */
export function playNote(midi, { when = 0, dur = 1.2, vel = 0.8 } = {}) {
  ensure();
  noteScheduled();
  const t = Math.max(when, ctx.currentTime + 0.005);
  const f = midiToFreq(midi);
  // Higher notes decay faster, like real strings.
  const decay = Math.max(0.5, 2.6 - (midi - 48) * 0.035);
  const length = Math.min(dur, decay * 1.5) + 0.3;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.32 * vel, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.12 * vel, t + 0.25);
  env.gain.exponentialRampToValueAtTime(0.0008, t + decay);
  // Release when the note is "let go".
  if (dur < decay) {
    env.gain.cancelScheduledValues(t + dur);
    env.gain.setTargetAtTime(0.0001, t + dur, 0.07);
  }

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  filter.frequency.setValueAtTime(Math.min(f * 9, 12000), t);
  filter.frequency.exponentialRampToValueAtTime(Math.min(f * 3, 8000), t + 0.6);

  env.connect(filter).connect(master);

  for (const [mult, g] of PARTIALS) {
    const freq = f * mult * (1 + 0.0004 * mult * mult); // slight inharmonicity
    if (freq > 16000) continue;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const pg = ctx.createGain();
    pg.gain.value = g;
    o.connect(pg).connect(env);
    o.start(t);
    o.stop(t + length);
  }
  // Hammer "thunk" for a bit of attack
  const n = noiseBurst(t, 0.03, 0.06 * vel, f * 4);
  n.connect(master);
  return t;
}

let noiseBuf = null;
function noiseBurst(t, len, gain, cutoff) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(cutoff, 10000);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(bp).connect(g);
  src.start(t);
  src.stop(t + len + 0.01);
  return g;
}

/** Play several notes in sequence. notes: [{midi, at (sec offset), dur}] */
export function playSequence(notes, startIn = 0.05) {
  ensure();
  const t0 = ctx.currentTime + startIn;
  for (const n of notes) playNote(n.midi, { when: t0 + n.at, dur: n.dur ?? 0.8, vel: n.vel ?? 0.8 });
  return t0;
}

/** Metronome click. accent = downbeat. */
export function click(when, accent = false) {
  ensure();
  noteScheduled();
  const t = Math.max(when, ctx.currentTime + 0.002);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1175;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = accent ? 2500 : 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.32, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(bp).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.06);
}

/** Percussive "tap" sound used to play back rhythms. */
export function tick(when, vel = 1) {
  ensure();
  noteScheduled();
  const t = Math.max(when, ctx.currentTime + 0.002);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(330, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.7 * vel, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.18);
  noiseBurst(t, 0.02, 0.15 * vel, 3000).connect(master);
}

// ---------------------------------------------------------------- drum kit & bass (arcade grooves)
function noiseHit(t, len, gain, type, freq, q = 0.8) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + len + 0.02);
}

/** kind: 'kick' | 'snare' | 'hat' | 'clap' */
export function drum(kind, when, vel = 1) {
  ensure();
  noteScheduled();
  const t = Math.max(when, ctx.currentTime + 0.002);
  if (kind === 'kick') {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.95 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.35);
  } else if (kind === 'snare') {
    noiseHit(t, 0.16, 0.45 * vel, 'bandpass', 1900, 0.7);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.12);
  } else if (kind === 'hat') {
    noiseHit(t, 0.045, 0.16 * vel, 'highpass', 7500, 0.5);
  } else if (kind === 'clap') {
    for (const dt of [0, 0.012, 0.024]) noiseHit(t + dt, 0.09, 0.3 * vel, 'bandpass', 1300, 1.2);
  }
}

/** A round synth bass note. */
export function bass(midi, when, dur = 0.3, vel = 0.7) {
  ensure();
  noteScheduled();
  const t = Math.max(when, ctx.currentTime + 0.002);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = midiToFreq(midi);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(220, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.08);
}

export function sfx(kind) {
  ensure();
  noteScheduled();
  const t = ctx.currentTime + 0.01;
  const tone = (freq, at, len, type = 'sine', gain = 0.22) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + at);
    g.gain.linearRampToValueAtTime(gain, t + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
    o.connect(g).connect(master);
    o.start(t + at);
    o.stop(t + at + len + 0.02);
  };
  if (kind === 'correct') {
    tone(1046.5, 0, 0.18, 'triangle');
    tone(1568, 0.09, 0.3, 'triangle');
  } else if (kind === 'wrong') {
    tone(196, 0, 0.25, 'square', 0.08);
    tone(185, 0.12, 0.3, 'square', 0.08);
  } else if (kind === 'complete') {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.5, 'triangle', 0.2));
  } else if (kind === 'streak') {
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => tone(f, i * 0.08, 0.4, 'triangle', 0.18));
  }
}
