// Unit 3: Reading the Staff
import { sampleWith, shuffle, choice as pick } from '../util.js';
import { parse, pretty, LETTERS } from '../theory.js';
import { fact, seqEvents } from '../gen.js';

/** Where a letter sits relative to the shown note: nearest step distance, -3..+3. */
function stepsBetween(fromLetter, toLetter) {
  let diff = LETTERS.indexOf(toLetter) - LETTERS.indexOf(fromLetter);
  if (diff > 3) diff -= 7;
  if (diff < -3) diff += 7;
  return diff;
}
/** The midi of a letter-name label placed near the shown note. */
function nearMidi(shown, label) {
  const p = parse(shown);
  const m = /^([A-G])(#|b)?/.exec(label.replace('♯', '#').replace('♭', 'b'));
  if (!m) return null;
  const steps = stepsBetween(p.letter, m[1]);
  const d = p.d + steps;
  const name = LETTERS[((d % 7) + 7) % 7] + (m[2] || '') + Math.floor(d / 7);
  return parse(name).midi;
}

const T_LINES = ['E4', 'G4', 'B4', 'D5', 'F5'];
const T_SPACES = ['F4', 'A4', 'C5', 'E5'];
const T_LEDGER = ['C4', 'D4', 'G5', 'A5'];
const B_LINES = ['G2', 'B2', 'D3', 'F3', 'A3'];
const B_SPACES = ['A2', 'C3', 'E3', 'G3'];
const B_LEDGER = ['E2', 'F2', 'B3', 'C4'];
const T_ACC = ['F#4', 'C#5', 'G#4', 'D#5', 'Bb4', 'Eb5', 'Ab4', 'Db5', 'A#4', 'Gb4'];

const label = (items) => items.map((n) => ({ notes: [n], label: pretty(n) }));

function explainFor(clef, n) {
  const T = {
    C4: 'Middle C sits on its own little ledger line below the treble staff.',
    D4: 'D hangs just below the bottom line.',
    G5: 'G sits just above the top line.',
    A5: 'A is on the first ledger line above the staff.',
  };
  const B = {
    C4: 'Middle C is on the first ledger line above the bass staff.',
    B3: 'B sits just above the top line.',
    F2: 'F hangs just below the bottom line.',
    E2: 'E is on the first ledger line below the staff.',
  };
  const plain = stripAcc(n);
  if (clef === 'treble') {
    if (T[plain]) return T[plain];
    if (T_LINES.includes(plain)) return 'Treble lines, bottom to top: E G B D F, "Every Good Boy Does Fine".';
    return 'Treble spaces, bottom to top, spell F A C E.';
  }
  if (B[plain]) return B[plain];
  if (B_LINES.includes(plain)) return 'Bass lines, bottom to top: G B D F A, "Good Boys Do Fine Always".';
  return 'Bass spaces, bottom to top: A C E G, "All Cows Eat Grass".';
}
const stripAcc = (n) => n.replace(/[#b]/, '');

function genStaffName(clef, pool, { accidentals = false } = {}) {
  return ({ d = 1 } = {}) => {
    const n = pick(pool);
    const p = parse(n);
    const right = pretty(n);
    let opts;
    if (accidentals) {
      const cands = [];
      for (const L of LETTERS) for (const a of ['', '#', 'b']) {
        const name = L + a;
        if (['E#', 'B#', 'Fb', 'Cb'].includes(name)) continue; // unusual spellings
        if (parse(name).pc === p.pc) continue; // the answer and its enharmonic twin
        cands.push(pretty(name));
      }
      const near = [pretty(p.letter)];
      opts = shuffle([right, ...sampleWith(near, 1), ...sampleWith(cands.filter((c) => c !== right && !near.includes(c)), 2)]);
    } else {
      opts = sampleWith(LETTERS, d >= 4 ? 5 : 4, p.letter);
    }
    return {
      type: 'choice', item: `staff:${clef}:${n}`,
      prompt: 'What note is this?',
      // From level 3 there's no "Hear it" button: read it, don't hear it.
      media: d <= 2 ? { staff: { clef, notes: [n] }, notes: [p.midi], autoplay: false, label: 'Hear it' } : { staff: { clef, notes: [n] } },
      options: opts, correct: opts.indexOf(accidentals ? right : p.letter),
      answer: right, explain: explainFor(clef, n),
      whyWrong: (label) => {
        const letter = label[0];
        const steps = stepsBetween(p.letter, letter);
        if (steps === 0) return `Right letter, wrong accidental: this note is ${right}.`;
        const n2 = Math.abs(steps);
        return `${label} would sit ${n2} step${n2 > 1 ? 's' : ''} ${steps > 0 ? 'higher' : 'lower'} on the staff (${n2 === 1 ? 'the next line or space' : 'further away'}).`;
      },
      audioFor: (label) => {
        const m = label === right ? p.midi : nearMidi(n, label);
        return m == null ? [] : seqEvents([m], 1);
      },
    };
  };
}

function genStaffToKey(clef, pool) {
  return () => {
    const n = pick(pool);
    const p = parse(n);
    return {
      type: 'findKey', item: `staffkey:${clef}:${n}`,
      prompt: 'Tap this note on the piano',
      sub: 'Any octave counts.',
      staff: { clef, notes: [n] },
      target: p.pc, accept: 'pc',
      from: clef === 'bass' ? 48 : 60, to: clef === 'bass' ? 64 : 76,
      answer: pretty(n), explain: explainFor(clef, n),
    };
  };
}

function genWhichStaff(clef, pool) {
  return ({ d = 1 } = {}) => {
    const n = pick(pool);
    const letter = parse(n).letter;
    const others = shuffle(pool.filter((x) => parse(x).letter !== letter));
    const picks = [n];
    for (const o of others) if (picks.length < (d >= 3 ? 4 : 3) && !picks.some((x) => parse(x).letter === parse(o).letter)) picks.push(o);
    const opts = shuffle(picks);
    return {
      type: 'choice', item: `which:${clef}:${n}`,
      prompt: `Which one is ${'AEF'.includes(letter) ? 'an' : 'a'} ${letter}?`,
      options: opts.map((x) => ({ staff: { clef, notes: [x] } })),
      correct: opts.indexOf(n),
      answer: `This one: ${letter}`, explain: explainFor(clef, n),
    };
  };
}

const clefFact = () => {
  const clef = Math.random() < 0.5 ? 'treble' : 'bass';
  return {
    type: 'choice', item: `clef:${clef}`,
    prompt: 'Which clef is this?',
    media: { staff: { clef, notes: [] } },
    options: ['Treble clef', 'Bass clef'], correct: clef === 'treble' ? 0 : 1,
    explain: clef === 'treble' ? 'The treble (G) clef curls around the G line.' : 'The bass (F) clef\'s two dots surround the F line.',
  };
};

export default {
  id: 'u3', title: 'Reading the Staff', desc: 'Treble & bass clef', color: 'purple', requires: 'u1',
  lessons: [
    {
      id: 'u3l1', title: 'Treble clef', icon: '🎼',
      intro: [
        { type: 'learn', title: 'The staff', text: 'Written music lives on a <b>staff</b>: 5 lines and 4 spaces. <b>Higher on the staff = higher pitch</b>, just like rows in your piano roll.<br><br>Each line and each space is a white key.', staff: { clef: 'treble', items: label(['E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5']) }, events: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ m: [[64, 65, 67, 69, 71, 72, 74, 76, 77][i]], t: i * 0.35, d: 0.4, v: 0.8 })) },
        { type: 'learn', title: 'Treble clef', text: 'The <b>treble clef</b> (or G clef) curls around the <b>G line</b>, the second line from the bottom. It\'s used for higher notes: melodies, leads, vocals.' , staff: { clef: 'treble', items: label(['G4']) } },
        { type: 'learn', title: 'Lines and spaces', text: 'Lines, bottom to top: <b>E G B D F</b>, "Every Good Boy Does Fine".<br><br>Spaces spell <b>F A C E</b>.', staff: { clef: 'treble', items: label(['E4', 'G4', 'B4', 'D5', 'F5']) } },
      ],
      gens: [genStaffName('treble', [...T_LINES, ...T_SPACES]), genStaffName('treble', [...T_LINES, ...T_SPACES]), genStaffToKey('treble', [...T_LINES, ...T_SPACES]), genWhichStaff('treble', [...T_LINES, ...T_SPACES])],
      count: 10,
    },
    {
      id: 'u3l2', title: 'Ledger lines', icon: '➖',
      intro: [
        { type: 'learn', title: 'Ledger lines', text: 'Notes beyond the staff get short extra lines called <b>ledger lines</b>.<br><br>Just keep counting line, space, line, space.', staff: { clef: 'treble', items: label(['C4', 'D4', 'E4', 'F5', 'G5', 'A5']) } },
        { type: 'learn', title: 'Middle C', text: '<b>Middle C</b> sits on one ledger line below the treble staff. It\'s the C in the middle of a piano.<br><br>Heads up: many DAWs (Ableton, Logic, Cubase) label middle C as <b>C3</b>, while musicians call it <b>C4</b>.', staff: { clef: 'treble', items: label(['C4']) }, events: [{ m: [60], t: 0, d: 1.2, v: 0.8 }] },
      ],
      gens: [genStaffName('treble', T_LEDGER), genStaffName('treble', [...T_LEDGER, ...T_LINES, ...T_SPACES]), genStaffToKey('treble', [...T_LEDGER, ...T_SPACES]), genWhichStaff('treble', [...T_LEDGER, ...T_LINES]),
        fact('fact:middlec', 'Many DAWs (Ableton, Logic, Cubase) label middle C as…', ['C3', 'C4', 'C5', 'C1'], 0)],
      count: 10,
    },
    {
      id: 'u3l3', title: 'Bass clef', icon: '🎸',
      intro: [
        { type: 'learn', title: 'Bass clef', text: 'The <b>bass clef</b> (or F clef) is for low notes: basslines and the piano\'s left hand. Its two dots sit either side of the <b>F line</b>.', staff: { clef: 'bass', items: label(['F3']) }, events: [{ m: [53], t: 0, d: 1.2, v: 0.8 }] },
        { type: 'learn', title: 'Bass lines and spaces', text: 'Lines, bottom to top: <b>G B D F A</b>, "Good Boys Do Fine Always".<br><br>Spaces: <b>A C E G</b>, "All Cows Eat Grass".', staff: { clef: 'bass', items: label(['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3']) } },
        { type: 'learn', title: 'Middle C again', text: 'Middle C is one ledger line <b>above</b> the bass staff. It\'s the same note as one ledger line below the treble staff. That\'s how the two staffs connect.', staff: { clef: 'bass', items: label(['A3', 'B3', 'C4']) } },
      ],
      gens: [genStaffName('bass', [...B_LINES, ...B_SPACES]), genStaffName('bass', [...B_LINES, ...B_SPACES, ...B_LEDGER]), genStaffToKey('bass', [...B_LINES, ...B_SPACES]), genWhichStaff('bass', [...B_LINES, ...B_SPACES])],
      count: 10,
    },
    {
      id: 'u3l4', title: 'Sharps & flats', icon: '♭',
      intro: [
        { type: 'learn', title: 'Accidentals', text: 'A <b>♯</b> or <b>♭</b> written <b>before</b> a note raises or lowers it by a half step. They\'re called <b>accidentals</b>.', staff: { clef: 'treble', items: label(['F#4', 'Bb4', 'C#5', 'Eb5']) } },
        { type: 'learn', title: 'Natural ♮', text: 'A <b>natural</b> sign ♮ cancels a sharp or flat, back to the white key.' },
      ],
      gens: [genStaffName('treble', T_ACC, { accidentals: true }), genStaffName('treble', T_ACC, { accidentals: true }), genStaffToKey('treble', T_ACC),
        fact('fact:sharp', 'A sharp (♯) means…', ['One half step higher', 'One half step lower', 'One whole step higher', 'Play it louder'], 0)],
      count: 10,
    },
    {
      id: 'u3l5', title: 'Both clefs', icon: '🎹',
      intro: [
        { type: 'learn', title: 'The grand staff', text: 'Piano music stacks a treble staff on top of a bass staff: the <b>grand staff</b>. Right hand on top, left hand below, middle C between them.<br><br>Time to mix both clefs!' },
      ],
      gens: [genStaffName('treble', [...T_LINES, ...T_SPACES, ...T_LEDGER]), genStaffName('bass', [...B_LINES, ...B_SPACES, ...B_LEDGER]), genStaffToKey('treble', [...T_LINES, ...T_SPACES]), genStaffToKey('bass', [...B_LINES, ...B_SPACES]), clefFact],
      count: 12,
    },
  ],
};
