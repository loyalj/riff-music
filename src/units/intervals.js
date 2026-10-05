// Unit 4: Intervals
import { sampleWith, choice as pick, noteName, isBlack, rand } from '../util.js';
import { INTERVALS, interval, ORDINAL, LETTERS, spell, pretty, parse } from '../theory.js';
import { fact, seqEvents, chordEvent } from '../gen.js';

const RANGE = { from: 60, to: 76 };
const WHITE_ROOTS = [60, 62, 64, 65, 67, 69, 71, 72];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const songTip = (s) => `${cap(interval(s).name)}: ${interval(s).s} half steps. Think of ${interval(s).song}.`;

// Interval label <-> semitones, for explaining mistakes and playing "yours vs right".
const byLabel = (label) => INTERVALS.find((i) => cap(i.name) === label);
const hs = (n) => `${n} half step${n === 1 ? '' : 's'}`;
const whyInterval = (s) => (label) => {
  const p = byLabel(label);
  return p ? `${label} is ${hs(p.s)}. This one was ${hs(s)}: a ${interval(s).name}.` : null;
};
/** Sound of any interval label from the same starting note, same direction / style. */
const intervalAudio = (start, dir = 'up', harmonic = false) => (label) => {
  const p = byLabel(label);
  if (!p) return [];
  const other = dir === 'down' ? start - p.s : start + p.s;
  return harmonic ? [chordEvent([start, other], 0, 1.6)] : seqEvents([start, other], 0.75);
};
/** Interval names to offer: the pool, plus near neighbours at higher difficulty. */
function intervalOptions(pool, s, d) {
  const names = new Set(pool.map((x) => interval(x).name));
  if (d >= 3) for (const n of [s - 1, s + 1]) if (n >= 1 && n <= 12) names.add(interval(n).name);
  const count = d >= 4 ? 5 : 4;
  return sampleWith([...names], Math.min(count, names.size), interval(s).name);
}

function genNumber({ d = 1 } = {}) {
  const li = rand(5); // C..G
  const steps = 1 + rand(7);
  const a = LETTERS[li] + '4';
  const b = LETTERS[(li + steps) % 7] + (4 + Math.floor((li + steps) / 7)); // white-key target
  const name = ORDINAL[steps];
  const opts = sampleWith(ORDINAL.slice(1), d >= 3 ? 5 : 4, name);
  const letters = Array.from({ length: steps + 1 }, (_, i) => LETTERS[(li + i) % 7]).join(' ');
  return {
    type: 'choice', item: `num:${steps}`,
    prompt: 'What interval number is this?',
    sub: d <= 2 ? 'Count the letter names, including both notes.' : null,
    media: d <= 2
      ? { staff: { clef: 'treble', notes: [a, b] }, notes: [parse(a).midi, parse(b).midi], autoplay: false, label: 'Hear it' }
      : { staff: { clef: 'treble', notes: [a, b] } },
    options: opts, correct: opts.indexOf(name),
    answer: name, explain: `${letters}: that's ${steps + 1} letters, so a ${name}.`,
    whyWrong: (label) => {
      const n = ORDINAL.indexOf(label);
      return n > 0 ? `A ${label} spans ${n + 1} letter names. Here there are ${steps + 1}: ${letters}.` : null;
    },
  };
}

function genNumberFact() {
  const li = rand(7);
  const steps = 1 + rand(6);
  const a = LETTERS[li];
  const b = LETTERS[(li + steps) % 7];
  const name = ORDINAL[steps];
  const opts = sampleWith(ORDINAL.slice(1, 7), 4, name);
  return { type: 'choice', item: `numf:${steps}`, prompt: `${a} up to ${b} is a…`, options: opts, correct: opts.indexOf(name) };
}

function genPiano(pool) {
  return ({ d = 1 } = {}) => {
    const s = pick(pool);
    const r = pick(WHITE_ROOTS.filter((m) => m + s <= RANGE.to));
    const opts = intervalOptions(pool, s, d);
    return {
      type: 'choice', item: `ipiano:${s}`,
      prompt: 'What interval is this?',
      sub: d <= 2 ? 'Count the half steps between the keys.' : null,
      media: { piano: { ...RANGE, marks: [r, r + s] }, notes: [r, r + s], gap: 0.6, label: 'Hear it', autoplay: d <= 3 },
      options: opts.map(cap), correct: opts.indexOf(interval(s).name),
      explain: `${noteName(r)} to ${noteName(r + s, 'both')} is ${hs(s)}: a ${interval(s).name}.`,
      whyWrong: whyInterval(s), audioFor: intervalAudio(r),
    };
  };
}

function genBuild(pool) {
  return ({ d = 1 } = {}) => {
    const s = pick(pool);
    const down = d >= 4 && Math.random() < 0.5 && WHITE_ROOTS.some((m) => m - s >= RANGE.from);
    const r = pick(WHITE_ROOTS.filter((m) => (down ? m - s >= RANGE.from : m + s <= RANGE.to)));
    const target = down ? r - s : r + s;
    return {
      type: 'findKey', item: `ibuild:${s}${down ? '-' : ''}`,
      prompt: `Tap a ${interval(s).name} ${down ? 'below' : 'above'} ${noteName(r)}`,
      sub: d <= 2 ? `Count ${hs(s)} ${down ? 'down' : 'up'}.` : null,
      target, accept: 'midi', ...RANGE, marks: [r],
      answer: noteName(target, 'both'), explain: songTip(s),
    };
  };
}

function genHear(pool) {
  return ({ d = 1 } = {}) => {
    const s = pick(pool);
    const dir = d >= 3 && Math.random() < 0.4 ? 'down' : 'up';
    const harmonic = d >= 4 && Math.random() < 0.3;
    const start = dir === 'down' ? 64 + rand(10) : 55 + rand(10);
    const other = dir === 'down' ? start - s : start + s;
    const opts = intervalOptions(pool, s, d);
    return {
      type: 'choice', item: `ihear:${s}`, ear: true,
      prompt: harmonic ? 'Which interval? (played together)' : dir === 'down' ? 'Which interval? (going down)' : 'Which interval do you hear?',
      media: harmonic ? { play: [chordEvent([start, other], 0, 1.6)] } : { notes: [start, other], gap: 0.75 },
      options: opts.map(cap), correct: opts.indexOf(interval(s).name),
      explain: songTip(s),
      whyWrong: whyInterval(s), audioFor: intervalAudio(start, dir, harmonic),
    };
  };
}

function genCount(pool) {
  return () => {
    const s = pick(pool);
    const opts = sampleWith([1, 2, 3, 4, 5, 7, 9, 10, 11, 12].map(String), 4, String(s));
    return { type: 'choice', item: `icount:${s}`, prompt: `How many half steps in a ${interval(s).name}?`, options: opts, correct: opts.indexOf(String(s)) };
  };
}

const demo = (a, b) => seqEvents([a, b], 0.7).concat([{ m: [a, b], t: 1.5, d: 1.4, v: 0.6 }]);

export default {
  id: 'u4', title: 'Intervals', desc: 'The distance between notes', color: 'teal', requires: 'u3',
  lessons: [
    {
      id: 'u4l1', title: 'Counting intervals', icon: '📏',
      intro: [
        { type: 'learn', title: 'Intervals', text: 'An <b>interval</b> is the distance between two notes. Melodies are made of intervals, and so are chords.' , events: demo(60, 67) },
        { type: 'learn', title: 'Count the letters', text: 'To name an interval\'s number, count the letter names <b>including both notes</b>.<br><br>C to E: <b>C D E</b> = a <b>3rd</b>.<br>C to G: C D E F G = a <b>5th</b>.', staff: { clef: 'treble', items: [{ notes: ['C4', 'E4'], label: '3rd' }, { notes: ['C4', 'G4'], label: '5th' }, { notes: ['C4', 'C5'], label: 'octave' }] } },
        { type: 'learn', title: 'Staff shortcut', text: 'On the staff, <b>line to next line</b> (or space to next space) is a <b>3rd</b>. Line to the next space is a <b>2nd</b>.', staff: { clef: 'treble', items: [{ notes: ['E4', 'G4'], label: '3rd' }, { notes: ['E4', 'F4'], label: '2nd' }] } },
      ],
      gens: [genNumber, genNumber, genNumberFact],
      count: 10,
    },
    {
      id: 'u4l2', title: 'Major & minor 3rds', icon: '🙂',
      intro: [
        { type: 'learn', title: 'Two kinds of 3rd', text: 'Intervals with the same number can differ by a half step. That\'s their <b>quality</b>.<br><br>A <b>major 3rd</b> is <b>4 half steps</b> and sounds bright.<br>A <b>minor 3rd</b> is <b>3 half steps</b> and sounds darker.', piano: { ...RANGE, marks: [60, 64], labels: 'white' }, events: demo(60, 64) },
        { type: 'learn', title: 'Hear the difference', text: 'Major 3rd: "When the Saints Go Marching In".<br>Minor 3rd: "Smoke on the Water".<br><br>These two intervals decide whether a chord sounds happy or sad.', events: [...demo(60, 64).map((e) => ({ ...e })), ...demo(60, 63).map((e) => ({ ...e, t: e.t + 3.2 }))], eventsLabel: 'Major, then minor' },
      ],
      gens: [genPiano([3, 4]), genBuild([3, 4]), genHear([3, 4]), genHear([3, 4]), genCount([3, 4])],
      count: 10,
    },
    {
      id: 'u4l3', title: '4ths & 5ths', icon: '⚡',
      intro: [
        { type: 'learn', title: 'Perfect 5th', text: 'A <b>perfect 5th</b> is <b>7 half steps</b>. It\'s strong and open: a <b>power chord</b> is just a root plus its 5th.<br><br>Think "Twinkle Twinkle" (twin-kle TWIN-kle).', piano: { ...RANGE, marks: [60, 67], labels: 'white' }, events: demo(60, 67) },
        { type: 'learn', title: 'Perfect 4th', text: 'A <b>perfect 4th</b> is <b>5 half steps</b>. Think "Here Comes the Bride".<br><br>And an <b>octave</b> is 12 half steps: same note, higher.', piano: { ...RANGE, marks: [60, 65], labels: 'white' }, events: demo(60, 65) },
      ],
      gens: [genPiano([5, 7, 12]), genBuild([5, 7]), genHear([5, 7, 12]), genHear([5, 7]), genCount([5, 7, 12])],
      count: 10,
    },
    {
      id: 'u4l4', title: '2nds, 6ths & 7ths', icon: '🧭',
      intro: [
        { type: 'learn', title: '2nds', text: 'A <b>minor 2nd</b> (1 half step) is tense: the Jaws theme.<br>A <b>major 2nd</b> (2 half steps) is a simple step: "Hap-py <b>Birth</b>-day".', events: [...demo(64, 65), ...demo(60, 62).map((e) => ({ ...e, t: e.t + 3.2 }))], eventsLabel: 'Minor, then major 2nd' },
        { type: 'learn', title: '6ths', text: 'A <b>major 6th</b> is <b>9 half steps</b>: "My Bon-nie Lies Over the Ocean". Sweet and wide.', piano: { ...RANGE, marks: [60, 69], labels: 'white' }, events: demo(60, 69) },
        { type: 'learn', title: '7ths', text: 'A <b>minor 7th</b> (10 half steps) is bluesy: the Star Trek theme.<br>A <b>major 7th</b> (11 half steps) is one shy of an octave: dreamy and lush.', events: [...demo(60, 70), ...demo(60, 71).map((e) => ({ ...e, t: e.t + 3.2 }))], eventsLabel: 'Minor, then major 7th' },
      ],
      gens: [genPiano([1, 2, 9, 10, 11]), genPiano([1, 2, 3, 4]), genBuild([2, 9, 10, 11]), genHear([1, 2, 12]), genCount([1, 2, 9, 10, 11])],
      count: 10,
    },
    {
      id: 'u4l5', title: 'Interval ears', icon: '🎧',
      intro: [
        { type: 'learn', title: 'The tritone', text: 'One more: the <b>tritone</b>, 6 half steps, exactly half an octave. It\'s unstable and spooky: The Simpsons theme.', events: demo(60, 66) },
        { type: 'learn', title: 'Ear workout', text: 'Now just listen. Sing the song tip in your head if you need to. Replay as often as you like.<br><br>🎧 Headphones on!' },
      ],
      gens: [genHear([3, 4, 5, 7]), genHear([5, 6, 7, 12]), genHear([1, 2, 3, 4]), genHear([3, 4, 7, 12]), genCount([3, 4, 5, 6, 7, 12])],
      count: 12,
    },
  ],
};
