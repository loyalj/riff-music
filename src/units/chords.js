// Unit 6: Chords
import { sampleWith, shuffle, choice as pick } from '../util.js';
import { chord, chordSymbol, QUALITIES, pretty, parse, voice } from '../theory.js';
import { fact, chordEvent, arpEvents, rangeFor } from '../gen.js';

const rootMidi = (root) => 60 + parse(root).pc; // C4..B4
const voicing = (root, q) => QUALITIES[q].semis.map((s) => rootMidi(root) + s);
const tones = (root, q) => chord(root, q).map((n) => pretty(n)).join(' ');
const qName = (q) => QUALITIES[q].name;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Turn a chord symbol back into [root, quality], e.g. 'F♯m7' -> ['F#', 'min7']. */
function parseSymbol(sym) {
  for (const r of ROOTS) for (const q of Object.keys(QUALITIES)) if (chordSymbol(r, q) === sym) return [r, q];
  return null;
}
const qByLabel = (label) => Object.keys(QUALITIES).find((q) => cap(qName(q)) === label);
/** Move the lowest chord tone(s) up an octave: 1st or 2nd inversion. */
const invert = (notes, n) => {
  const out = notes.slice();
  for (let i = 0; i < n; i++) out.push(out.shift() + 12);
  return out;
};

function genBuild(combos, { hintRoot: hintOpt = false } = {}) {
  return ({ d = 1 } = {}) => {
    const hintRoot = hintOpt && d <= 1;
    const [root, q] = pick(combos);
    const v = voicing(root, q);
    const r = rangeFor(v, 8);
    return {
      type: 'buildChord', item: `cbuild:${root}${q}`,
      prompt: `Build ${chordSymbol(root, q)} (${pretty(root)} ${qName(q)})`,
      sub: hintRoot ? 'The root is marked. Tap the notes, then Check.' : 'Tap the notes, then Check. Any octave works.',
      pcs: QUALITIES[q].semis.map((s) => (parse(root).pc + s) % 12),
      names: chord(root, q).map((n) => pretty(n)),
      voicing: v, from: 60, to: Math.max(76, r.to), marks: hintRoot ? [v[0]] : [],
      explain: `${chordSymbol(root, q)} = ${tones(root, q)}`,
    };
  };
}

function symbolOptions(root, q, combos) {
  const right = chordSymbol(root, q);
  const pool = new Set();
  for (const qq of Object.keys(QUALITIES)) if (combos.some(([, c]) => c === qq) && qq !== q) pool.add(chordSymbol(root, qq));
  for (const [r2, q2] of combos) pool.add(chordSymbol(r2, q2));
  pool.delete(right);
  return sampleWith([right, ...pool], 4, right);
}

const chordWhy = (root, q) => (label) => {
  const p = parseSymbol(label);
  return p ? `${label} is ${tones(p[0], p[1])}. This one is ${chordSymbol(root, q)}: ${tones(root, q)}.` : null;
};
const chordAudio = (label) => {
  const p = parseSymbol(label);
  return p ? [chordEvent(voicing(p[0], p[1]))] : [];
};

function genNamePiano(combos) {
  return ({ d = 1 } = {}) => {
    const [root, q] = pick(combos);
    const v = voicing(root, q);
    const opts = symbolOptions(root, q, combos);
    return {
      whyWrong: chordWhy(root, q), audioFor: chordAudio,
      type: 'choice', item: `cname:${root}${q}`,
      prompt: 'Which chord is this?',
      media: { piano: { from: 60, to: Math.max(76, rangeFor(v).to), marks: v }, play: [chordEvent(v)], label: 'Hear it', autoplay: false },
      options: opts, correct: opts.indexOf(chordSymbol(root, q)),
      explain: `${chordSymbol(root, q)} = ${tones(root, q)}`,
    };
  };
}

function genNameStaff(combos) {
  return ({ d = 1 } = {}) => {
    const [root, q] = pick(combos);
    // From level 4, chords may be written in inversion (a different note on the bottom).
    const inv = d >= 4 && Math.random() < 0.5 ? 1 + Math.floor(Math.random() * 2) : 0;
    let notes = chord(root + '4', q);
    for (let i = 0; i < inv; i++) notes = [...notes.slice(1), notes[0].replace(/\d+$/, (o) => String(+o + 1))];
    const opts = symbolOptions(root, q, combos);
    return {
      whyWrong: chordWhy(root, q), audioFor: chordAudio,
      sub: inv ? 'It\'s in an inversion: stack it back into 3rds to find the root.' : null,
      type: 'choice', item: `cstaff:${root}${q}`,
      prompt: 'Which chord is written here?',
      media: { staff: { clef: 'treble', chord: notes }, play: [chordEvent(notes.map((n) => parse(n).midi))], label: 'Hear it', autoplay: false },
      options: opts, correct: opts.indexOf(chordSymbol(root, q)),
      explain: `${chordSymbol(root, q)} = ${tones(root, q)}`,
    };
  };
}

function genHear(qs, roots = ['C', 'D', 'E', 'F', 'G', 'A']) {
  return ({ d = 1 } = {}) => {
    const q = pick(qs);
    const root = pick(roots);
    // Level 3+: inversions (same chord, different note on the bottom).
    const inv = d >= 3 && Math.random() < 0.5 ? 1 + Math.floor(Math.random() * 2) : 0;
    const build = (qq) => {
      const full = voice(root, qq);
      return [full[0], ...invert(full.slice(1), inv)];
    };
    const v = build(q);
    const opts = shuffle(qs.map((x) => cap(qName(x))));
    return {
      type: 'choice', item: `chear:${q}`, ear: true,
      prompt: 'What kind of chord is this?',
      media: d >= 4 ? { play: [chordEvent(v, 0, 1.8)] } : { play: [chordEvent(v, 0, 1.8)], alt: { label: 'Note by note', play: arpEvents(v.slice(1)) } },
      options: opts, correct: opts.indexOf(cap(qName(q))),
      explain: HEAR_TIPS[q],
      whyWrong: (label) => {
        const other = qByLabel(label);
        return other ? `${HEAR_TIPS[other]} This one is ${qName(q)}: ${HEAR_TIPS[q].split(': ')[1]}` : null;
      },
      audioFor: (label) => {
        const other = qByLabel(label);
        return other ? [chordEvent(build(other), 0, 1.8)] : [];
      },
    };
  };
}

const HEAR_TIPS = {
  maj: 'Major: bright, stable, happy.',
  min: 'Minor: darker, sad or serious.',
  dim: 'Diminished: tense and unstable, like a horror-movie sting.',
  aug: 'Augmented: dreamy and suspended, like a question.',
  maj7: 'Major 7th: lush and dreamy, the lo-fi chord.',
  dom7: 'Dominant 7th: bluesy, and it wants to move somewhere.',
  min7: 'Minor 7th: smooth and mellow, a neo-soul staple.',
};

function genSpell(combos) {
  return () => {
    const [root, q] = pick(combos);
    const right = tones(root, q);
    const pool = new Set();
    for (const qq of Object.keys(QUALITIES)) if (QUALITIES[qq].semis.length === QUALITIES[q].semis.length && qq !== q) pool.add(tones(root, qq));
    for (const [r2, q2] of combos) if (QUALITIES[q2].semis.length === QUALITIES[q].semis.length) pool.add(tones(r2, q2));
    pool.delete(right);
    const opts = sampleWith([right, ...pool], 4, right);
    const notesOf = (t) => t.split(' ');
    return {
      type: 'choice', item: `cspell:${root}${q}`, prompt: `Which notes make ${chordSymbol(root, q)}?`, options: opts, correct: opts.indexOf(right),
      whyWrong: (label) => {
        const off = notesOf(label).filter((n) => !notesOf(right).includes(n));
        return off.length ? `${off.join(' and ')} ${off.length > 1 ? 'aren\'t' : 'isn\'t'} in ${chordSymbol(root, q)}. It's ${right}.` : null;
      },
    };
  };
}

const combos = (roots, q) => roots.map((r) => [r, q]);
const MAJ_W = combos(['C', 'F', 'G'], 'maj');
const MIN_W = combos(['D', 'E', 'A'], 'min');
const MAJ_ALL = combos(['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'], 'maj');
const MIN_ALL = combos(['C', 'D', 'E', 'F', 'G', 'A', 'B'], 'min');
const DIM = combos(['B', 'C', 'D', 'E'], 'dim');
const AUG = combos(['C', 'F', 'G'], 'aug');
const SEVENTHS = [...combos(['C', 'F', 'G', 'D'], 'maj7'), ...combos(['G', 'C', 'D', 'A'], 'dom7'), ...combos(['D', 'E', 'A', 'C'], 'min7')];

const ev = (root, q, t) => chordEvent(voice(root, q), t, 1.4);

export default {
  id: 'u6', title: 'Chords', desc: 'Triads, by eye and by ear', color: 'coral', requires: 'u5',
  lessons: [
    {
      id: 'u6l1', title: 'Triads', icon: '🧱',
      intro: [
        { type: 'learn', title: 'Chords', text: 'A <b>chord</b> is three or more notes played together. The most common is the <b>triad</b>: three notes stacked in 3rds.', events: [ev('C', 'maj', 0)] },
        { type: 'learn', title: 'Root, 3rd, 5th', text: 'Start on a <b>root</b>, add the note a <b>3rd</b> above, then a <b>5th</b> above. On white keys: play one, skip one, play one, skip one, play one.<br><br><b>C major = C E G</b>.', piano: { from: 60, to: 76, marks: [60, 64, 67], labels: 'white' }, staff: { clef: 'treble', chord: ['C4', 'E4', 'G4'] }, events: [...arpEvents([60, 64, 67]), chordEvent([60, 64, 67], 1.1)] },
      ],
      gens: [genBuild([...MAJ_W, ...MIN_W], { hintRoot: true }), genBuild(MAJ_W, { hintRoot: true }), genSpell([...MAJ_W, ...MIN_W]), genNameStaff([...MAJ_W, ...MIN_W]),
        fact('fact:triad', 'A triad is built from…', ['A root, a 3rd and a 5th', 'Three notes in a row', 'A root, a 2nd and a 4th', 'Any three black keys'], 0)],
      count: 10,
    },
    {
      id: 'u6l2', title: 'Major vs minor', icon: '🎭',
      intro: [
        { type: 'learn', title: 'Major chords', text: 'A <b>major</b> triad = a <b>major 3rd</b> (4 half steps) + a <b>minor 3rd</b> (3) on top. Bright and happy.', piano: { from: 60, to: 76, marks: [60, 64, 67] }, events: [ev('C', 'maj', 0)] },
        { type: 'learn', title: 'Minor chords', text: 'A <b>minor</b> triad flips it: minor 3rd, then major 3rd. Just <b>lower the middle note</b> by a half step. C minor = C E♭ G.', piano: { from: 60, to: 76, marks: [60, 63, 67] }, events: [ev('C', 'maj', 0), ev('C', 'min', 1.8)], eventsLabel: 'Major, then minor' },
      ],
      gens: [genBuild([...MAJ_W, ...MIN_W]), genHear(['maj', 'min']), genHear(['maj', 'min']), genNamePiano([...MAJ_W, ...MIN_W, ...combos(['C', 'G'], 'min'), ...combos(['D', 'A'], 'maj')])],
      count: 10,
    },
    {
      id: 'u6l3', title: 'Any triad', icon: '🔧',
      intro: [
        { type: 'learn', title: 'Using black keys', text: 'Keep the half-step counts and any note can be a root: <b>4 + 3</b> for major, <b>3 + 4</b> for minor.<br><br>D major = D <b>F♯</b> A.', piano: { from: 60, to: 76, marks: [62, 66, 69], labels: 'all' }, events: [ev('D', 'maj', 0)] },
      ],
      gens: [genBuild([...MAJ_ALL, ...MIN_ALL]), genBuild(MAJ_ALL), genSpell([...MAJ_ALL, ...MIN_ALL]), genNameStaff([...MAJ_ALL, ...MIN_ALL]), genHear(['maj', 'min'])],
      count: 10,
    },
    {
      id: 'u6l4', title: 'Dim & aug', icon: '🌀',
      intro: [
        { type: 'learn', title: 'Diminished', text: 'Stack <b>two minor 3rds</b> (3 + 3) and you get a <b>diminished</b> chord: tense and spooky. Its symbol is °.<br><br>B° = B D F.', piano: { from: 60, to: 79, marks: [71, 74, 77] }, events: [ev('B', 'dim', 0)] },
        { type: 'learn', title: 'Augmented', text: 'Stack <b>two major 3rds</b> (4 + 4) for <b>augmented</b>: dreamy and unresolved. Its symbol is +.<br><br>C+ = C E G♯.', piano: { from: 60, to: 76, marks: [60, 64, 68] }, events: [ev('C', 'aug', 0)] },
      ],
      gens: [genHear(['maj', 'min', 'dim', 'aug']), genHear(['maj', 'min', 'dim']), genBuild([...DIM, ...AUG]), genNamePiano([...DIM, ...AUG, ...MAJ_W, ...MIN_W]), genSpell([...DIM, ...AUG])],
      count: 10,
    },
    {
      id: 'u6l5', title: 'Seventh chords', icon: '✨',
      intro: [
        { type: 'learn', title: 'Add a 7th', text: 'Stack one more 3rd on a triad and you get a <b>seventh chord</b>: four notes, richer colors. They\'re all over R&B, jazz, house and lo-fi.' },
        { type: 'learn', title: 'Three flavors', text: '<b>maj7</b> (Cmaj7 = C E G B): lush and dreamy.<br><b>7</b> (G7 = G B D F): bluesy, wants to resolve.<br><b>m7</b> (Dm7 = D F A C): smooth and mellow.', events: [ev('C', 'maj7', 0), ev('G', 'dom7', 1.8), ev('D', 'min7', 3.6)], eventsLabel: 'Hear all three' },
      ],
      gens: [genHear(['maj7', 'dom7', 'min7']), genHear(['maj7', 'dom7', 'min7']), genBuild(SEVENTHS), genSpell(SEVENTHS)],
      count: 10,
    },
  ],
};
