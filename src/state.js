// Persistent progress: XP, streaks, freezes, lesson completion, per-item stats.
import { dayKey, addDays, daysBetween } from './util.js';

const KEY = 'musicapp.v1';
const MAX_FREEZES = 2;

function fresh() {
  return {
    version: 1,
    created: dayKey(),
    xp: 0,
    days: {}, // 'YYYY-MM-DD' -> { xp, met, frozen }
    freezes: 1,
    freezeAwardedAt: 0,
    longestStreak: 0,
    lessons: {}, // lessonId -> { done, best, crowns (levels passed, 0-5), passed }
    confusions: {}, // 'lessonId|gen|a|b' -> { l, g, a, b, count, last }
    arcade: {}, // mini games: personal bests and stats only, never XP or streak
    items: {}, // itemKey -> { seen, wrong, streak, last }
    settings: { dailyGoal: 20, volume: 0.8, latencyMs: 0, calibrated: false, theme: 'system' },
  };
}

export let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const base = fresh();
      return { ...base, ...s, confusions: s.confusions || {}, arcade: s.arcade || {}, settings: { ...base.settings, ...(s.settings || {}) } };
    }
  } catch {}
  return fresh();
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

/** Ask the browser not to evict our storage (helps keep streaks safe). */
export function requestPersist() {
  try {
    navigator.storage?.persist?.();
  } catch {}
}

const isCounted = (d) => d && (d.met || d.frozen);

/** Current streak: consecutive met days ending today or yesterday. Frozen days bridge gaps. */
export function currentStreak() {
  const today = dayKey();
  let d = state.days[today]?.met ? today : addDays(today, -1);
  let n = 0;
  while (isCounted(state.days[d])) {
    if (state.days[d].met) n++;
    d = addDays(d, -1);
  }
  return n;
}

export function todayXp() {
  return state.days[dayKey()]?.xp || 0;
}

export function goalMetToday() {
  return !!state.days[dayKey()]?.met;
}

/**
 * Called on app start / resume. If days were missed since the last
 * practiced day, spend freezes to cover them (if there are enough).
 */
export function reconcile() {
  const today = dayKey();
  const counted = Object.keys(state.days).filter((k) => k < today && isCounted(state.days[k])).sort();
  if (!counted.length) return { used: 0, broken: false };
  const last = counted[counted.length - 1];
  const gap = daysBetween(last, today) - 1;
  if (gap <= 0) return { used: 0, broken: false };
  if (gap <= state.freezes) {
    for (let i = 1; i <= gap; i++) {
      const k = addDays(last, i);
      state.days[k] = { ...(state.days[k] || { xp: 0 }), frozen: true };
    }
    state.freezes -= gap;
    save();
    return { used: gap, broken: false };
  }
  return { used: 0, broken: true };
}

/** Add XP to today. Returns info for celebrating. */
export function addXp(n) {
  const k = dayKey();
  const day = state.days[k] || (state.days[k] = { xp: 0, met: false });
  const before = currentStreak();
  day.xp += n;
  state.xp += n;
  let goalJustMet = false;
  let freezeEarned = false;
  if (!day.met && day.xp >= state.settings.dailyGoal) {
    day.met = true;
    goalJustMet = true;
  }
  const after = currentStreak();
  state.longestStreak = Math.max(state.longestStreak, after);
  if (goalJustMet && after > 0 && after % 7 === 0 && state.freezeAwardedAt !== after && state.freezes < MAX_FREEZES) {
    state.freezes++;
    state.freezeAwardedAt = after;
    freezeEarned = true;
  }
  save();
  return { goalJustMet, before, after, freezeEarned };
}

// ---------------------------------------------------------------- spaced repetition
// Each item has an interval in days (ivl), an ease factor and a due day.
// A correct answer on or after the due day grows the interval (1, 3, then
// x ease); a miss resets it so the item comes back tomorrow. Correct answers
// before the due day don't grow it, so drilling an item five times in one
// lesson doesn't push it a month out.
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
const MAX_IVL = 60; // days: even mastered skills come back every couple of months
export const MASTERED_DAYS = 21;

/** Give items from before spaced repetition a sensible schedule. */
function migrateItems(items) {
  for (const it of Object.values(items || {})) {
    if (it.due) continue;
    const ivl = it.streak >= 3 ? 7 : it.streak === 2 ? 3 : it.streak === 1 ? 1 : 0;
    it.ivl = ivl;
    it.ease = 2.3;
    it.due = addDays(dayKey(new Date(it.last || Date.now())), Math.max(ivl, 1));
  }
}
migrateItems(state.items);

/** src: { l: lessonId, g: generator index } so the item can be asked again later. */
export function recordItem(key, correct, src) {
  const today = dayKey();
  const it = state.items[key] || (state.items[key] = { seen: 0, wrong: 0, streak: 0, last: 0, ivl: 0, ease: 2.3, due: today });
  if (src) it.src = src;
  it.seen++;
  if (correct) {
    it.streak++;
    const wasDue = !it.due || it.due <= today;
    if (it.ivl === 0) it.ivl = 1;
    else if (wasDue) {
      it.ivl = Math.min(MAX_IVL, it.ivl === 1 ? 3 : Math.round(it.ivl * it.ease));
      it.ease = Math.min(MAX_EASE, it.ease + 0.05);
    }
    if (wasDue || it.due <= today) it.due = addDays(today, it.ivl);
  } else {
    it.wrong++;
    it.streak = 0;
    it.ivl = 0;
    it.ease = Math.max(MIN_EASE, (it.ease || 2.3) - 0.2);
    it.due = today; // still due: shows up in today's review until answered right
  }
  it.last = Date.now();
}

export const isDue = (it, today = dayKey()) => !!it && !!it.due && it.due <= today;

/** Memory stats for the Progress screen. */
export function memorySummary() {
  const today = dayKey();
  const tomorrow = addDays(today, 1);
  let learned = 0, due = 0, mastered = 0, dueTomorrow = 0;
  for (const it of Object.values(state.items)) {
    learned++;
    if (it.due <= today) due++;
    else if (it.due === tomorrow) dueTomorrow++;
    if ((it.ivl || 0) >= MASTERED_DAYS) mastered++;
  }
  return { learned, due, mastered, dueTomorrow };
}

/**
 * How much an item needs practice. New items, items answered wrong,
 * items that are due and items not seen for a while score higher.
 */
export function itemWeight(key) {
  const it = state.items[key];
  if (!it) return 1.5;
  const errorRate = (it.wrong + 0.5) / (it.seen + 1);
  const days = (Date.now() - it.last) / 86400000;
  const stale = Math.min(1.5, days / 4);
  const mastered = Math.min(it.streak, 5) * 0.12;
  const due = isDue(it) ? 0.8 : 0;
  return Math.max(0.15, 0.4 + errorRate * 2.5 + stale - mastered + due);
}

// ---------------------------------------------------------------- mastery levels
export const MAX_LEVEL = 5;
/** First-try accuracy needed to pass a level: 60% for level 1, 70% after. */
export const passMark = (crowns) => (crowns === 0 ? 0.6 : 0.7);

/** Lessons finished before levels existed count as passed with one crown. */
function migrateLessons(lessons) {
  for (const l of Object.values(lessons || {})) {
    if (l.crowns != null) continue;
    l.passed = (l.done || 0) > 0;
    l.crowns = l.passed ? 1 : 0;
  }
}
migrateLessons(state.lessons);

export const crownsOf = (id) => state.lessons[id]?.crowns || 0;
/** The level you'd play next (1-5). */
export const nextLevel = (id) => Math.min(MAX_LEVEL, crownsOf(id) + 1);

/** Record a finished lesson. Returns whether it passed and whether a crown was earned. */
export function lessonDone(id, accuracy) {
  const l = state.lessons[id] || (state.lessons[id] = { done: 0, best: 0, crowns: 0, passed: false });
  const before = l.crowns || 0;
  const mark = passMark(before);
  const passed = accuracy >= mark;
  l.done++;
  l.best = Math.max(l.best, accuracy);
  if (passed) {
    l.passed = true;
    l.crowns = Math.min(MAX_LEVEL, before + 1);
  }
  save();
  return { passed, mark, leveledUp: l.crowns > before, crowns: l.crowns, firstPass: passed && before === 0 };
}

export function isLessonDone(id) {
  return !!state.lessons[id]?.passed;
}

// ---------------------------------------------------------------- confusion pairs
const confKey = (l, g, a, b) => [l, g, ...[a, b].sort()].join('|');

/** The learner picked `wrong` when the answer was `right`. Returns how often this pair was mixed up. */
export function recordConfusion(src, right, wrong) {
  if (!src || !right || !wrong || right === wrong) return 0;
  const k = confKey(src.l, src.g, right, wrong);
  const c = state.confusions[k] || (state.confusions[k] = { l: src.l, g: src.g, a: right, b: wrong, count: 0 });
  c.count += 1;
  c.last = Date.now();
  return Math.round(c.count);
}

/** A correct answer in a drill for this pair: the mix-up fades. */
export function easeConfusion(src, a, b) {
  const k = confKey(src.l, src.g, a, b);
  const c = state.confusions[k];
  if (!c) return;
  c.count -= 0.5;
  if (c.count <= 0) delete state.confusions[k];
}

export function confusionCount(src, a, b) {
  return Math.round(state.confusions[confKey(src?.l, src?.g, a, b)]?.count || 0);
}

/**
 * Pairs mixed up at least twice, worst first. The same two answers coming from
 * different question types are merged into one entry with several sources.
 */
export function topConfusions(n = 3) {
  const merged = new Map();
  for (const c of Object.values(state.confusions)) {
    const k = [c.a, c.b].sort().join('|');
    const m = merged.get(k) || { a: c.a, b: c.b, count: 0, last: 0, srcs: [] };
    m.count += c.count;
    m.last = Math.max(m.last, c.last || 0);
    m.srcs.push({ l: c.l, g: c.g });
    merged.set(k, m);
  }
  return [...merged.values()].filter((c) => c.count >= 2).sort((x, y) => y.count - x.count || y.last - x.last).slice(0, n).map((c) => ({ ...c, l: c.srcs[0].l, g: c.srcs[0].g }));
}

export function setSetting(k, v) {
  state.settings[k] = v;
  save();
}

export function exportData() {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function importData(code) {
  const s = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (!s || s.version !== 1 || typeof s.xp !== 'number') throw new Error('Not a valid backup');
  state = { ...fresh(), ...s, settings: { ...fresh().settings, ...(s.settings || {}) } };
  migrateItems(state.items);
  migrateLessons(state.lessons);
  state.confusions = state.confusions || {};
  save();
}

export function resetAll() {
  state = fresh();
  save();
}
