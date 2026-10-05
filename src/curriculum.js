// Units, lessons and exercise generators.
// A generator returns an exercise spec: { type, item, ... } (see exercises.js).
import { choice as pick, sampleWith, shuffle, noteName, namesFor, pc, isBlack, WHITE_PCS, BLACK_PCS, SHARP_NAMES, FLAT_NAMES, rand, pcFromName } from './util.js';
import { TOKEN_NAMES, durOf, totalBeats } from './notation.js';
import { beatsText } from './exercises.js';
import staffUnit from './units/staff.js';
import intervalsUnit from './units/intervals.js';
import scalesUnit from './units/scales.js';
import chordsUnit from './units/chords.js';
import progressionsUnit from './units/progressions.js';
import pentatonicUnit from './units/pentatonic.js';

const C4 = 60;
const RANGE = { from: 60, to: 76 }; // C4..E5: two Cs, two Ds, two Es

// ===================================================== Unit 1 generators
const keysWithPc = (p) => {
  const out = [];
  for (let m = RANGE.from; m <= RANGE.to; m++) if (pc(m) === p) out.push(m);
  return out;
};

function genFindKey(pcs, { labels = false, nameStyle = 'random' } = {}) {
  return () => {
    const p = pick(pcs);
    const names = namesFor(p);
    const name = nameStyle === 'random' ? pick(names) : names[0];
    return {
      type: 'findKey', item: `find:${p}`,
      prompt: `Tap ${isBlack(p) ? name : `${'EFA'.includes(name) ? 'an' : 'a'} ${name}`}`,
      sub: labels ? null : keysWithPc(p).length > 1 ? 'Any octave counts.' : null,
      target: p, accept: 'pc', ...RANGE, labels,
      answer: noteName(p, 'both'),
      explain: hintFor(p),
    };
  };
}

function hintFor(p) {
  return {
    0: 'C is just left of the group of 2 black keys.',
    2: 'D is between the 2 black keys.',
    4: 'E is just right of the group of 2 black keys.',
    5: 'F is just left of the group of 3 black keys.',
    7: 'G is the first gap inside the group of 3 black keys.',
    9: 'A is the second gap inside the group of 3 black keys.',
    11: 'B is just right of the group of 3 black keys.',
  }[p] || `${SHARP_NAMES[p]} is one key above ${SHARP_NAMES[(p + 11) % 12]}. It's also called ${FLAT_NAMES[p]}, one key below ${SHARP_NAMES[(p + 1) % 12]}.`;
}

function genNameKey(pcs, optionCount = 3) {
  return ({ d = 1 } = {}) => {
    const p = pick(pcs);
    const midi = pick(keysWithPc(p));
    const correctName = pick(namesFor(p));
    const others = pcs.filter((x) => x !== p).map((x) => pick(namesFor(x)));
    const n = optionCount + (d >= 3 ? 1 : 0) + (d >= 5 ? 1 : 0);
    const opts = sampleWith([correctName, ...others], Math.min(n, others.length + 1), correctName);
    const pcOf = (label) => pcFromName(label);
    const near = (q) => midi + ((((q - p) % 12) + 18) % 12) - 6;
    return {
      type: 'choice', item: `name:${p}`,
      prompt: 'What is this key called?',
      media: { piano: { ...RANGE, marks: [midi] }, notes: [midi], label: 'Hear it' },
      options: opts, correct: opts.indexOf(correctName),
      answer: noteName(p, 'both'),
      explain: hintFor(p),
      whyWrong: (label) => (pcOf(label) >= 0 ? `${hintFor(pcOf(label))} This key is ${noteName(p, 'both')}.` : null),
      audioFor: (label) => (pcOf(label) >= 0 ? [{ m: [near(pcOf(label))], t: 0, d: 1, v: 0.8 }] : []),
    };
  };
}

const ALPHA = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
function genAlphabet() {
  const i = rand(7);
  const after = Math.random() < 0.6;
  const letter = ALPHA[i];
  const ans = ALPHA[(i + (after ? 1 : 6)) % 7];
  const opts = sampleWith(ALPHA.filter((x) => x !== letter), 4, ans);
  return {
    type: 'choice', item: `alpha:${after ? '+' : '-'}${letter}`,
    prompt: `Which letter comes ${after ? 'after' : 'before'} ${letter}?`,
    sub: 'The musical alphabet: A B C D E F G, then A again.',
    options: opts, correct: opts.indexOf(ans),
  };
}

function genOtherName() {
  const p = pick(BLACK_PCS);
  const fromSharp = Math.random() < 0.5;
  const given = fromSharp ? SHARP_NAMES[p] : FLAT_NAMES[p];
  const ans = fromSharp ? FLAT_NAMES[p] : SHARP_NAMES[p];
  const pool = BLACK_PCS.filter((x) => x !== p).map((x) => (fromSharp ? FLAT_NAMES[x] : SHARP_NAMES[x]));
  const opts = sampleWith(pool, 3, undefined).concat(ans);
  const sh = shuffle(opts);
  return {
    type: 'choice', item: `other:${p}`,
    prompt: `What's another name for ${given}?`,
    media: { piano: { ...RANGE, marks: [C4 + p], labels: 'white' } },
    options: sh, correct: sh.indexOf(ans),
    explain: `${SHARP_NAMES[p]} (one above ${SHARP_NAMES[p - 1]}) and ${FLAT_NAMES[p]} (one below ${SHARP_NAMES[p + 1]}) are the same key.`,
  };
}

const HL_SIZES = { 1: [12, 9, 7, 5], 2: [7, 5, 4, 3], 3: [5, 4, 3, 2], 4: [3, 2, 1], 5: [2, 1] };
function genHigherLower({ d = 1 } = {}) {
  const size = pick(HL_SIZES[d] || HL_SIZES[1]);
  const a = 55 + rand(14);
  const up = Math.random() < 0.5;
  const b = up ? a + size : a - size;
  return {
    type: 'choice', ear: true, item: `hl:${size >= 5 ? 'big' : 'small'}`,
    prompt: 'Is the second note higher or lower?',
    media: { notes: [a, b], gap: 0.85 },
    options: ['Higher', 'Lower'], correct: up ? 0 : 1,
    whyWrong: () => `The second note went ${up ? 'up' : 'down'} by ${size} half step${size > 1 ? 's' : ''}. Small steps are the hardest to hear, so try humming them.`,
  };
}

function genOctave() {
  const a = 57 + rand(10);
  const same = Math.random() < 0.5;
  const size = same ? 12 : pick([10, 11, 9, 4, 3]);
  const b = a + size;
  return {
    type: 'choice', ear: true, item: `oct:${same}`,
    prompt: 'Same note name, an octave apart?',
    sub: 'Octaves sound almost like the same note, just higher.',
    media: { notes: [a, b], gap: 0.85 },
    options: ['Yes, an octave', 'No, different notes'], correct: same ? 0 : 1,
    answer: same ? `Yes: ${noteName(a)} and ${noteName(b)}` : `No: ${noteName(a, 'both')} and ${noteName(b, 'both')}`,
  };
}

const HEAR_TARGETS = { 1: [62, 64, 65, 67], 2: [62, 64, 65, 67, 69], 3: [62, 64, 65, 67, 69, 71], 4: [62, 63, 64, 65, 66, 67, 69, 71], 5: [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71] };
function genHearFind({ d = 1 } = {}) {
  const target = pick(HEAR_TARGETS[d] || HEAR_TARGETS[1]);
  return { type: 'hearFind', ear: true, item: `hear:${pc(target)}`, ref: 60, target, from: 60, to: 72, refName: 'C' };
}

function genStepFind({ d = 1 } = {}) {
  const size = pick([1, 2]);
  const up = Math.random() < (d <= 1 ? 1 : d <= 2 ? 0.7 : 0.5);
  const start = pick(up ? [60, 62, 64, 65, 67, 69, 71] : [62, 64, 65, 67, 69, 71, 72]);
  const target = up ? start + size : start - size;
  const stepName = size === 1 ? 'half step' : 'whole step';
  return {
    type: 'findKey', item: `stepfind:${size}${up ? '+' : '-'}`,
    prompt: `Tap the key a ${stepName} ${up ? 'above' : 'below'} ${noteName(start)}`,
    sub: d <= 2 ? (size === 1 ? 'Half step = the very next key.' : 'Whole step = skip one key.') : null,
    target, accept: 'midi', ...RANGE, marks: [start], labels: false,
    answer: noteName(target, 'both'),
    explain: size === 1 ? 'A half step is the very next key, black or white.' : 'A whole step is two half steps: skip one key.',
  };
}

function genStepName() {
  const size = pick([1, 2]);
  const a = pick([60, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72]);
  const b = a + size;
  return {
    type: 'choice', item: `stepname:${size}:${[4, 11].includes(pc(a)) ? 'ef' : 'x'}`,
    prompt: 'Half step or whole step?',
    media: { piano: { ...RANGE, marks: [a, b] }, notes: [a, b], gap: 0.6, label: 'Hear it' },
    options: ['Half step', 'Whole step'], correct: size - 1,
    explain: size === 1 ? 'Neighbouring keys, with nothing in between: a half step.' : 'There is one key between them: a whole step.',
    audioFor: (label) => (label === 'Half step' ? [{ m: [a], t: 0, d: 0.6, v: 0.8 }, { m: [a + 1], t: 0.6, d: 0.6, v: 0.8 }] : [{ m: [a], t: 0, d: 0.6, v: 0.8 }, { m: [a + 2], t: 0.6, d: 0.6, v: 0.8 }]),
  };
}

function genStepHear() {
  const size = pick([1, 2]);
  const a = 58 + rand(12);
  return {
    type: 'choice', ear: true, item: `stephear:${size}`,
    prompt: 'Listen: half step or whole step?',
    sub: 'A half step sounds tight and tense. A whole step is a little wider.',
    media: { notes: [a, a + size], gap: 0.7 },
    options: ['Half step', 'Whole step'], correct: size - 1,
    whyWrong: () => (size === 1 ? 'This was a half step: the very next key, tight and tense.' : 'This was a whole step: two keys apart, a little more open.'),
    audioFor: (label) => (label === 'Half step' ? [{ m: [a], t: 0, d: 0.7, v: 0.8 }, { m: [a + 1], t: 0.7, d: 0.7, v: 0.8 }] : [{ m: [a], t: 0, d: 0.7, v: 0.8 }, { m: [a + 2], t: 0.7, d: 0.7, v: 0.8 }]),
  };
}

// ===================================================== Unit 2 generators
// Cells are building blocks of a 4/4 bar: { t: tokens, b: beats, tag }
const CELL = {
  q: { t: ['q'], b: 1 },
  qr: { t: ['qr'], b: 1, rest: true },
  h: { t: ['h'], b: 2 },
  hr: { t: ['hr'], b: 2, rest: true },
  w: { t: ['w'], b: 4 },
  ee: { t: ['e', 'e'], b: 1 },
  ssss: { t: ['s', 's', 's', 's'], b: 1 },
  ess: { t: ['e', 's', 's'], b: 1 },
  sse: { t: ['s', 's', 'e'], b: 1 },
};

/** Random bar built from cell names. `need` = at least one of these cells must appear. */
function randomBar(pool, need = [], weights = {}) {
  for (let tries = 0; tries < 200; tries++) {
    const cells = [];
    let t = 0;
    while (t < 4) {
      const fits = pool.filter((n) => {
        const c = CELL[n];
        if (c.b === 4) return t === 0;
        if (c.b === 2) return t % 2 === 0 && t + 2 <= 4;
        return true;
      });
      const ws = fits.map((n) => weights[n] ?? 1);
      let r = Math.random() * ws.reduce((a, b) => a + b, 0);
      let n = fits[fits.length - 1];
      for (let i = 0; i < fits.length; i++) if ((r -= ws[i]) <= 0) { n = fits[i]; break; }
      cells.push(n);
      t += CELL[n].b;
    }
    const notes = cells.filter((n) => !CELL[n].rest).length;
    if (notes === 0) continue;
    if (cells[0] && CELL[cells[0]].rest && cells.length < 3) continue;
    if (need.length && !cells.some((n) => need.includes(n))) continue;
    return cells;
  }
  return ['q', 'q', 'q', 'q'];
}

const cellsToTokens = (cells) => cells.flatMap((n) => CELL[n].t);

function mutateBar(cells, pool) {
  for (let tries = 0; tries < 50; tries++) {
    const out = cells.slice();
    const i = rand(out.length);
    const alts = pool.filter((n) => CELL[n].b === CELL[out[i]].b && n !== out[i]);
    if (!alts.length) continue;
    out[i] = pick(alts);
    if (out.some((n) => !CELL[n].rest)) return out;
  }
  return null;
}

const levelBpm = (bpm, d) => bpm + (d - 1) * 6;

function genTap(pool, need, bpm, weights) {
  return ({ d = 1 } = {}) => {
    const cells = randomBar(pool, need, weights);
    return { type: 'tapRhythm', item: `tap:${need.join('|') || 'base'}`, tokens: cellsToTokens(cells), bpm: levelBpm(bpm, d), counts: d <= 2 };
  };
}

function genPickRhythm(pool, need, bpm, weights) {
  return ({ d = 1 } = {}) => {
    const nOpts = d >= 3 ? 4 : 3;
    const lbpm = levelBpm(bpm, d);
    const cells = randomBar(pool, need, weights);
    const key = (c) => cellsToTokens(c).join(' ');
    const seen = new Set([key(cells)]);
    const options = [cells];
    for (let tries = 0; tries < 40 && options.length < nOpts; tries++) {
      const m = mutateBar(Math.random() < 0.7 ? cells : randomBar(pool, [], weights), pool) || randomBar(pool, [], weights);
      if (!seen.has(key(m))) {
        seen.add(key(m));
        options.push(m);
      }
    }
    const sh = shuffle(options);
    return {
      type: 'choice', item: `pick:${need.join('|') || 'base'}`,
      prompt: 'Which rhythm do you hear?',
      media: { rhythmAudio: cellsToTokens(cells), bpm: lbpm },
      options: sh.map((c) => ({ rhythm: cellsToTokens(c) })),
      correct: sh.indexOf(cells),
      answer: 'The highlighted one',
    };
  };
}

function genNoteValue(tokens) {
  return () => {
    const tok = pick(tokens);
    const d = durOf(tok);
    const values = [...new Set(tokens.map(durOf).concat([1, 2, 4]))];
    const optVals = sampleWith(values, Math.min(4, values.length), d).sort((a, b) => b - a);
    const opts = optVals.map(beatsText);
    return {
      type: 'choice', item: `val:${tok}`,
      prompt: 'How long does this last?',
      sub: 'In 4/4 time',
      media: { token: tok },
      options: opts, correct: optVals.indexOf(d),
      answer: `${beatsText(d)}: a ${TOKEN_NAMES[tok]}`,
    };
  };
}

function genNameSymbol(tokens) {
  return () => {
    const tok = pick(tokens);
    const opts = sampleWith(tokens, Math.min(4, tokens.length), tok);
    return {
      type: 'choice', item: `sym:${tok}`,
      prompt: `Which one is a ${TOKEN_NAMES[tok]}?`,
      options: opts.map((t) => ({ token: t })), correct: opts.indexOf(tok),
      answer: `${TOKEN_NAMES[tok]} (${beatsText(durOf(tok))})`,
    };
  };
}

function genCompleteBar(pool, candidates) {
  return () => {
    for (let tries = 0; tries < 100; tries++) {
      const missing = pick([1, 2]);
      const fill = candidates.filter((t) => durOf(t) === missing);
      if (!fill.length) continue;
      const ans = pick(fill);
      // build a bar of 4 - missing beats
      const cells = randomBar(pool, []).slice();
      let tokens = cellsToTokens(cells);
      // trim tokens from the end until we have 4 - missing beats
      while (totalBeats(tokens) > 4 - missing) tokens.pop();
      if (totalBeats(tokens) !== 4 - missing || !tokens.some((t) => !t.endsWith('r'))) continue;
      const wrong = candidates.filter((t) => durOf(t) !== missing);
      const opts = sampleWith([...new Set(wrong)], 2, undefined).concat(ans);
      const sh = shuffle(opts);
      return {
        type: 'choice', item: `fill:${ans}`,
        prompt: 'Which one completes the bar?',
        sub: `A bar of 4/4 holds exactly 4 beats. ${missing} ${missing === 1 ? 'beat is' : 'beats are'} missing.`,
        media: { rhythm: tokens, missing, counts: true },
        options: sh.map((t) => ({ token: t })), correct: sh.indexOf(ans),
        answer: `${TOKEN_NAMES[ans]} (${beatsText(durOf(ans))})`,
      };
    }
    return genNoteValue(candidates)();
  };
}

function fact(item, promptText, options, correctIdx, extra = {}) {
  return () => {
    const order = shuffle(options.map((_, i) => i));
    return {
      type: 'choice', item,
      prompt: promptText,
      options: order.map((i) => options[i]),
      correct: order.indexOf(correctIdx),
      ...extra,
    };
  };
}

// ===================================================== Curriculum
const BLACK_LABEL_NOTE = 'Piano rolls usually label black keys with sharps: C#, D#, F#, G#, A#.';

export const UNITS = [
  {
    id: 'u1', title: 'The Keyboard', desc: 'Find your way around the keys', color: 'pink',
    lessons: [
      {
        id: 'u1l1', title: 'C, D and E', icon: '🎹',
        intro: [
          { type: 'learn', title: 'Meet the keyboard', text: 'The keyboard is one pattern repeated over and over: <b>7 white keys and 5 black keys</b>.<br><br>The black keys come in <b>groups of 2</b> and <b>groups of 3</b>. That\'s your map.', piano: { ...RANGE, marks: [61, 63, 73, 75] } },
          { type: 'learn', title: 'This is C', text: '<b>C</b> is the white key just <b>left of the 2 black keys</b>.<br><br>In your DAW\'s piano roll, the rows labeled C3, C4, C5… are all C, just in different octaves.', piano: { ...RANGE, marks: [60, 72], labels: 'c', play: [60, 72] } },
          { type: 'learn', title: 'D and E', text: '<b>D</b> sits <b>between</b> the 2 black keys.<br><b>E</b> is just <b>right</b> of them.<br><br>Try tapping the keys!', piano: { ...RANGE, marks: [62, 64, 74, 76], labels: 'white', play: [60, 62, 64] } },
        ],
        gens: [genFindKey([0, 2, 4]), genFindKey([0, 2, 4]), genNameKey([0, 2, 4])],
        count: 8,
      },
      {
        id: 'u1l2', title: 'F, G, A, B', icon: '🔤',
        intro: [
          { type: 'learn', title: 'The musical alphabet', text: 'Music only uses 7 letters: <b>A B C D E F G</b>. After G, it starts again at A.<br><br>On the keyboard the white keys go <b>C D E F G A B</b>, then C again.', piano: { ...RANGE, labels: 'white', play: [60, 62, 64, 65, 67, 69, 71, 72], gap: 0.4 } },
          { type: 'learn', title: 'F, G, A, B', text: '<b>F</b> is just <b>left of the 3 black keys</b>. Then come <b>G</b>, <b>A</b> and <b>B</b>.<br><br>B is the last white key before the next C.', piano: { ...RANGE, marks: [65, 67, 69, 71], labels: 'white', play: [65, 67, 69, 71] } },
        ],
        gens: [genFindKey([5, 7, 9, 11]), genFindKey(WHITE_PCS), genNameKey([5, 7, 9, 11], 4), genNameKey(WHITE_PCS, 4), genAlphabet],
        count: 10,
      },
      {
        id: 'u1l3', title: 'Black keys', icon: '♯',
        intro: [
          { type: 'learn', title: 'Sharp ♯', text: 'A <b>sharp</b> (♯) means one key <b>higher</b> (to the right).<br><br>The black key just right of C is <b>C♯</b> ("C sharp").', piano: { ...RANGE, marks: [61], labels: 'white', play: [60, 61] } },
          { type: 'learn', title: 'Flat ♭', text: 'A <b>flat</b> (♭) means one key <b>lower</b> (to the left).<br><br>That same black key is also <b>D♭</b> ("D flat"). <b>One key, two names.</b> Both are correct.', piano: { ...RANGE, marks: [61], labels: 'white', play: [62, 61] } },
          { type: 'learn', title: 'All the black keys', text: `Each black key is named after its neighbors.<br><br>${BLACK_LABEL_NOTE}`, piano: { ...RANGE, labels: 'all' } },
        ],
        gens: [genFindKey(BLACK_PCS), genFindKey(BLACK_PCS), genNameKey(BLACK_PCS, 4), genOtherName],
        count: 10,
      },
      {
        id: 'u1l4', title: 'High & low', icon: '👂',
        intro: [
          { type: 'learn', title: 'Higher and lower', text: 'Keys to the <b>right</b> sound <b>higher</b>. Keys to the <b>left</b> sound <b>lower</b>.<br><br>Just like moving up and down in the piano roll.', piano: { ...RANGE, play: [60, 64, 67, 72, 76], gap: 0.45 } },
          { type: 'learn', title: 'Octaves', text: 'From one C to the next C is an <b>octave</b>: 12 keys.<br><br>Notes an octave apart share a name and sound alike, just higher or lower.', piano: { ...RANGE, marks: [60, 72], labels: 'c', play: [60, 72, 64, 76], gap: 0.8 } },
          { type: 'learn', title: 'Ear training', text: 'Next you\'ll train your ears. Don\'t worry if it feels hard. Everyone starts here, and you can replay sounds as often as you like.<br><br>🎧 Headphones help!' },
        ],
        gens: [genHigherLower, genHigherLower, genOctave, genHearFind],
        count: 10,
      },
      {
        id: 'u1l5', title: 'Half & whole steps', icon: '🪜',
        intro: [
          { type: 'learn', title: 'Half step', text: 'A <b>half step</b> (also called a semitone) is the <b>very next key</b>, black or white.<br><br>In your piano roll it\'s exactly <b>one row</b>.', piano: { ...RANGE, marks: [60, 61], labels: 'white', play: [60, 61, 64, 65], gap: 0.6 } },
          { type: 'learn', title: 'Whole step', text: 'A <b>whole step</b> is <b>two half steps</b>: skip one key.<br><br>C to D is a whole step (it skips C♯).', piano: { ...RANGE, marks: [60, 62], labels: 'white', play: [60, 62], gap: 0.6 } },
          { type: 'learn', title: 'The sneaky pairs', text: '<b>E→F</b> and <b>B→C</b> have <b>no black key</b> between them, so they are only a <b>half step</b> apart.', piano: { ...RANGE, marks: [64, 65, 71, 72], labels: 'white', play: [64, 65, 71, 72], gap: 0.6 } },
        ],
        gens: [genStepFind, genStepFind, genStepName, genStepName, genStepHear],
        count: 10,
      },
    ],
  },
  {
    id: 'u2', title: 'Rhythm', desc: 'Beats, bars and note lengths', color: 'blue',
    lessons: [
      {
        id: 'u2l1', title: 'The beat', icon: '🥁',
        intro: [
          { type: 'learn', title: 'Feel the beat', text: 'Music has a steady pulse called the <b>beat</b>. <b>Tempo</b> is how fast it goes, in beats per minute (BPM), just like the tempo in your DAW.' },
          { type: 'learn', title: 'Bars', text: 'Beats are grouped into <b>bars</b> (also called measures). Most music has <b>4 beats per bar</b>, written as <b>4/4</b>.<br><br>Your DAW\'s grid is 4/4 by default: each bar has 4 beats.' },
          { type: 'learn', title: 'Quarter note', text: 'A <b>quarter note</b> lasts <b>1 beat</b>. Four of them fill a bar of 4/4.<br><br>The numbers underneath show how to count.', rhythm: { tokens: ['q', 'q', 'q', 'q'], bpm: 80 } },
          { type: 'learn', title: 'How tapping works', text: 'Press <b>Start</b>, listen to <b>4 count-in clicks</b>, then tap the big pad on every note while the clicks continue.<br><br>🎧 Wired headphones or the phone speaker work best. Bluetooth adds delay; you can calibrate it in <b>Settings</b>.' },
        ],
        gens: [
          ({ d = 1 } = {}) => ({ type: 'tapRhythm', item: 'tap:qqqq', tokens: ['q', 'q', 'q', 'q'], bpm: pick([70, 80, 90]) + (d - 1) * 8, counts: d <= 2 }),
          ({ d = 1 } = {}) => ({ type: 'tapRhythm', item: 'tap:qqqq', tokens: ['q', 'q', 'q', 'q'], bpm: pick([70, 80, 90]) + (d - 1) * 8, counts: d <= 2 }),
          fact('fact:q', 'How many beats does a quarter note last?', ['1 beat', '2 beats', '4 beats', '½ beat'], 0),
          fact('fact:44', 'How many beats are in one bar of 4/4?', ['4', '2', '3', '8'], 0),
          fact('fact:bpm', 'What does BPM measure?', ['Tempo: beats per minute', 'Volume', 'Pitch', 'Bars per minute'], 0),
        ],
        count: 6,
      },
      {
        id: 'u2l2', title: 'Long notes', icon: '⏳',
        intro: [
          { type: 'learn', title: 'Half note', text: 'A <b>half note</b> has a hollow head and a stem. It lasts <b>2 beats</b>.<br><br>Tap once at the start and let it ring.', rhythm: { tokens: ['h', 'h'], bpm: 80 } },
          { type: 'learn', title: 'Whole note', text: 'A <b>whole note</b> is hollow with no stem. It lasts <b>4 beats</b>: a whole bar!', rhythm: { tokens: ['w'], bpm: 80 } },
          { type: 'learn', title: 'Note lengths so far', text: 'Longer notes look "emptier".', symbols: ['w', 'h', 'q'] },
        ],
        gens: [
          genTap(['q', 'h', 'w'], ['h', 'w'], 80, { w: 0.3 }),
          genTap(['q', 'h'], ['h'], 80),
          genPickRhythm(['q', 'h', 'w'], ['h'], 80, { w: 0.3 }),
          genNoteValue(['w', 'h', 'q']),
          genNameSymbol(['w', 'h', 'q']),
          genCompleteBar(['q', 'h'], ['q', 'h', 'w']),
        ],
        count: 10,
      },
      {
        id: 'u2l3', title: 'Rests', icon: '🤫',
        intro: [
          { type: 'learn', title: 'Rests are silence', text: 'A <b>rest</b> means "don\'t play" for a while. Silence is part of the rhythm!<br><br>Every note length has a matching rest.', symbols: ['qr', 'hr', 'wr'] },
          { type: 'learn', title: 'Quarter rest', text: 'A <b>quarter rest</b> is 1 beat of silence. Keep counting, but don\'t tap.', rhythm: { tokens: ['q', 'qr', 'q', 'qr'], bpm: 80 } },
          { type: 'learn', title: 'Half rest', text: 'A <b>half rest</b> sits <b>on top</b> of the line (like a hat) and lasts 2 beats. A <b>whole rest</b> hangs <b>below</b> the line (like a hole) and lasts a whole bar.', rhythm: { tokens: ['h', 'hr'], bpm: 80 } },
        ],
        gens: [
          genTap(['q', 'qr', 'h', 'hr'], ['qr', 'hr'], 80),
          genTap(['q', 'qr', 'h'], ['qr'], 80),
          genPickRhythm(['q', 'qr', 'h', 'hr'], ['qr', 'hr'], 80),
          genNoteValue(['qr', 'hr', 'wr', 'q', 'h']),
          genNameSymbol(['qr', 'hr', 'wr', 'q']),
          genCompleteBar(['q', 'h', 'qr'], ['qr', 'hr', 'wr']),
        ],
        count: 10,
      },
      {
        id: 'u2l4', title: 'Eighth notes', icon: '♫',
        intro: [
          { type: 'learn', title: 'Eighth notes', text: 'An <b>eighth note</b> lasts <b>½ beat</b>, so two fit in one beat. Pairs are joined by a <b>beam</b>.<br><br>Count them: <b>1 & 2 & 3 & 4 &</b>', rhythm: { tokens: ['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e'], bpm: 70 } },
          { type: 'learn', title: 'Mixing them', text: 'Quarters fall on the numbers. Eighths add the <b>&</b> in between.<br><br>In your DAW this is the <b>1/8</b> grid.', rhythm: { tokens: ['q', 'e', 'e', 'q', 'e', 'e'], bpm: 70 } },
        ],
        gens: [
          genTap(['q', 'ee', 'qr', 'h'], ['ee'], 70, { ee: 1.5 }),
          genTap(['q', 'ee'], ['ee'], 70),
          genPickRhythm(['q', 'ee', 'qr', 'h'], ['ee'], 70, { ee: 1.5 }),
          genNoteValue(['e', 'q', 'h', 'w']),
          fact('fact:count8', 'How do you count eighth notes?', ['1 & 2 & 3 & 4 &', '1 2 3 4', '1 e & a 2 e & a'], 0),
          fact('fact:grid8', 'Which DAW grid setting matches eighth notes?', ['1/8', '1/4', '1/16', '1/2'], 0),
        ],
        count: 10,
      },
      {
        id: 'u2l5', title: 'Sixteenths', icon: '⚡',
        intro: [
          { type: 'learn', title: 'Sixteenth notes', text: 'A <b>sixteenth note</b> lasts <b>¼ beat</b>: four in one beat. They have <b>two beams</b>.<br><br>Count: <b>1 e & a, 2 e & a…</b><br>This is the <b>1/16</b> grid, the hi-hat grid of most dance music.', rhythm: { tokens: ['s', 's', 's', 's', 'q', 's', 's', 's', 's', 'q'], bpm: 60 } },
          { type: 'learn', title: 'Common patterns', text: 'An eighth + two sixteenths, or two sixteenths + an eighth. Both still fill exactly one beat.', rhythm: { tokens: ['e', 's', 's', 'q', 's', 's', 'e', 'q'], bpm: 60 } },
        ],
        gens: [
          genTap(['q', 'ee', 'ssss'], ['ssss'], 60),
          genTap(['q', 'ee', 'ess', 'sse'], ['ess', 'sse'], 60),
          genPickRhythm(['q', 'ee', 'ssss', 'ess', 'sse'], ['ssss', 'ess', 'sse'], 60),
          genNoteValue(['s', 'e', 'q', 'h']),
          genNameSymbol(['s', 'e', 'q', 'h']),
          fact('fact:count16', 'How do you count sixteenth notes?', ['1 e & a 2 e & a', '1 & 2 &', '1 2 3 4'], 0),
          fact('fact:grid16', 'How many sixteenth notes fit in one beat?', ['4', '2', '8', '16'], 0),
        ],
        count: 10,
      },
    ],
  },
  staffUnit,
  intervalsUnit,
  scalesUnit,
  chordsUnit,
  progressionsUnit,
  // Advanced scales series, easiest to hardest
  pentatonicUnit,
  { id: 'u9', title: 'Harmonic & Melodic Minor', desc: 'Scales III · Minor with a dramatic twist', color: 'lilac', soon: true, lessons: [] },
  { id: 'u10', title: 'Modes & Color', desc: 'Scales IV · Dorian, Lydian, Mixolydian and more', color: 'lilac', soon: true, lessons: [] },
  { id: 'u11', title: 'Exotic Scales', desc: 'Scales V · Whole tone, diminished, Phrygian dominant', color: 'lilac', soon: true, lessons: [] },
  { id: 'u12', title: 'Groove & Syncopation', desc: 'Off-beats, swing and triplets', color: 'blue', soon: true, lessons: [] },
  { id: 'u13', title: 'Melody & Hooks', desc: 'Write lines people hum', color: 'pink', soon: true, lessons: [] },
  { id: 'u14', title: 'Song Structure', desc: 'Intros, drops and arrangement', color: 'teal', soon: true, lessons: [] },
];

export const ALL_LESSONS = UNITS.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u })));
export const lessonById = (id) => ALL_LESSONS.find((l) => l.id === id);
