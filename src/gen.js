// Shared helpers for building exercise specs.
import { shuffle, sampleWith, choice as pick } from './util.js';
import { midiOf, parse } from './theory.js';

/** A multiple-choice fact. options[correctIdx] is right; the order is shuffled. */
export function fact(item, promptText, options, correctIdx, extra = {}) {
  return () => {
    const order = shuffle(options.map((_, i) => i));
    return { type: 'choice', item, prompt: promptText, options: order.map((i) => options[i]), correct: order.indexOf(correctIdx), ...extra };
  };
}

/** Build a choice spec from a correct answer and a pool of distractors. */
export function mc(item, promptText, correct, distractors, extra = {}, count = 4) {
  const pool = [...new Set(distractors.filter((d) => d !== correct))];
  const opts = sampleWith([correct, ...pool], Math.min(count, pool.length + 1), correct);
  return { type: 'choice', item, prompt: promptText, options: opts, correct: opts.indexOf(correct), ...extra };
}

/** Play events for single notes in a row. names: spelled notes with octaves. */
export const seqEvents = (midis, gap = 0.7) => midis.map((m, i) => ({ m: [m], t: i * gap, d: gap * 0.95, v: 0.8 }));
export const chordEvent = (midis, t = 0, d = 1.6) => ({ m: midis, t, d, v: 0.55 });
export const arpEvents = (midis, gap = 0.35) => midis.map((m, i) => ({ m: [m], t: i * gap, d: 1.2, v: 0.7 }));

/** Piano range (white-key bounds) that fits the given midis with a little air. */
export function rangeFor(midis, minWhites = 8) {
  let lo = Math.min(...midis);
  let hi = Math.max(...midis);
  const white = (m) => ![1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  while (!white(lo)) lo--;
  while (!white(hi)) hi++;
  let whites = 0;
  for (let m = lo; m <= hi; m++) if (white(m)) whites++;
  while (whites < minWhites) {
    hi++;
    if (white(hi)) whites++;
  }
  return { from: lo, to: hi };
}

export { pick, midiOf, parse };
