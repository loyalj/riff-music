// Spaced-repetition sessions: due items, Daily Review, lesson refreshers and
// mixing older material into new lessons.
import { ALL_LESSONS, lessonById } from './curriculum.js';
import { state, isDue, itemWeight, isLessonDone, crownsOf } from './state.js';
import { dayKey, shuffle } from './util.js';

/** Generator entries for a lesson: { l, gi, g }, so specs remember where they came from. */
export const entriesOf = (lesson) => lesson.gens.map((g, gi) => ({ l: lesson.id, gi, g }));

/** Generate a spec at difficulty d (1-5) from an entry and tag it with its source. */
export function fromEntry(e, d = 1) {
  const spec = e.g({ d });
  spec.d = d;
  spec.src = { l: e.l, g: e.gi };
  return spec;
}

// Items answered before sources were recorded: find their generator by sampling once.
let index = null;
function buildIndex() {
  index = new Map();
  for (const l of ALL_LESSONS) {
    if (!isLessonDone(l.id)) continue;
    l.gens.forEach((g, gi) => {
      for (let i = 0; i < 60; i++) {
        try {
          const k = g().item;
          if (!index.has(k)) index.set(k, { l: l.id, g: gi });
        } catch {}
      }
    });
  }
}

/** Where an item comes from, or null if its lesson no longer exists. */
export function sourceOf(key) {
  const src = state.items[key]?.src;
  if (src && lessonById(src.l)?.gens[src.g]) return src;
  if (!index) buildIndex();
  return index.get(key) || null;
}

/** Difficulty to review a lesson's items at: the level you've reached there. */
const levelFor = (lessonId) => Math.max(1, Math.min(5, crownsOf(lessonId)));

/** A fresh question for this exact item (or the closest its generator gives). */
export function specForItem(key, d) {
  const src = sourceOf(key);
  if (!src) return null;
  const g = lessonById(src.l).gens[src.g];
  const level = d ?? levelFor(src.l);
  let spec = null;
  for (let i = 0; i < 80; i++) {
    spec = g({ d: level });
    if (spec.item === key) break;
  }
  spec.d = level;
  spec.src = src;
  return spec;
}

/** Due item keys, most overdue first. Only items we can still ask. */
export function dueKeys() {
  const today = dayKey();
  return Object.entries(state.items)
    .filter(([k, it]) => isDue(it, today) && sourceOf(k))
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : itemWeight(b[0]) - itemWeight(a[0])))
    .map(([k]) => k);
}

/** { lessonId: number of due items } for fading nodes on the path. */
export function dueByLesson() {
  const out = {};
  for (const k of dueKeys()) {
    const l = sourceOf(k).l;
    out[l] = (out[l] || 0) + 1;
  }
  return out;
}

/** How fresh a finished lesson is, 0..1 (share of its items not due). */
export function lessonStrength(lessonId) {
  let total = 0, due = 0;
  const today = dayKey();
  for (const [k, it] of Object.entries(state.items)) {
    if (sourceOf(k)?.l !== lessonId) continue;
    total++;
    if (isDue(it, today)) due++;
  }
  return total ? 1 - due / total : 1;
}

/** Specs for a Daily Review: up to `limit` due items, spread across lessons. */
export function reviewSpecs(limit = 10) {
  const keys = dueKeys();
  // Round-robin by lesson so one lesson doesn't take over the whole review.
  const byLesson = new Map();
  for (const k of keys) {
    const l = sourceOf(k).l;
    if (!byLesson.has(l)) byLesson.set(l, []);
    byLesson.get(l).push(k);
  }
  const picked = [];
  while (picked.length < limit && byLesson.size) {
    for (const [l, list] of byLesson) {
      if (picked.length >= limit) break;
      picked.push(list.shift());
      if (!list.length) byLesson.delete(l);
    }
  }
  return shuffle(picked).map(specForItem).filter(Boolean);
}

/** Specs to refresh one lesson: its due items, topped up with fresh questions. */
export function refreshSpecs(lesson, min = 6, max = 8) {
  const due = dueKeys().filter((k) => sourceOf(k).l === lesson.id).slice(0, max);
  const specs = due.map(specForItem).filter(Boolean);
  const entries = entriesOf(lesson);
  while (specs.length < min) specs.push(fromEntry(entries[Math.floor(Math.random() * entries.length)]));
  return shuffle(specs);
}

/**
 * A few questions from other finished lessons to mix into a lesson.
 * Prefers due items, then the weakest ones. Tagged so the UI can label them.
 */
export function mixInSpecs(lesson, count) {
  const others = new Set(ALL_LESSONS.filter((l) => l.id !== lesson.id && isLessonDone(l.id)).map((l) => l.id));
  if (!others.size || count <= 0) return [];
  const candidates = Object.keys(state.items).filter((k) => {
    const s = sourceOf(k);
    return s && others.has(s.l);
  });
  const today = dayKey();
  candidates.sort((a, b) => {
    const da = isDue(state.items[a], today) ? 1 : 0;
    const db = isDue(state.items[b], today) ? 1 : 0;
    return db - da || itemWeight(b) - itemWeight(a);
  });
  // At most one item per lesson, so the mix is varied.
  const seen = new Set();
  const pool = [];
  for (const k of candidates) {
    const l = sourceOf(k).l;
    if (seen.has(l)) continue;
    seen.add(l);
    pool.push(k);
    if (pool.length >= count * 2) break;
  }
  return shuffle(pool).slice(0, count).map((k) => {
    const spec = specForItem(k);
    if (spec) spec.mixedFrom = lessonById(sourceOf(k).l);
    return spec;
  }).filter(Boolean);
}

/**
 * A two-choice drill question for a confusion pair { l, g, a, b }: the answer
 * is `target` and the only other option is the label it gets mixed up with.
 */
export function drillSpec(conf, target, d = 1) {
  const g = lessonById(conf.l)?.gens[conf.g];
  if (!g) return null;
  const other = target === conf.a ? conf.b : conf.a;
  for (let i = 0; i < 150; i++) {
    const spec = g({ d });
    if (spec.type !== 'choice' || !spec.options.every((o) => typeof o === 'string')) return null;
    if (spec.options[spec.correct] !== target) continue;
    const options = Math.random() < 0.5 ? [target, other] : [other, target];
    return { ...spec, options, correct: options.indexOf(target), src: { l: conf.l, g: conf.g }, drillPair: [conf.a, conf.b], d };
  }
  return null;
}

/** Forget cached sources (after a restore or reset). */
export function resetIndex() {
  index = null;
}
