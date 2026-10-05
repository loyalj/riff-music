// Unit 5: Scales & Keys
import { sampleWith, shuffle, choice as pick, rand } from '../util.js';
import { scale, MAJOR, NAT_MINOR, MAJOR_KEYS, MINOR_KEYS, pretty, stripOct, midiOf, parse, relativeMinor, relativeMajor, keySigNotes } from '../theory.js';
import { fact, seqEvents, rangeFor } from '../gen.js';

const MAJOR_PATTERN = 'W W H W W W H';
const MINOR_PATTERN = 'W H W W H W W';

function genBuild(tonics, minor = false) {
  return ({ d = 1 } = {}) => {
    const t = pick(tonics);
    let names = scale(t, minor ? NAT_MINOR : MAJOR);
    const kind = minor ? 'minor' : 'major';
    // Level 4+: sometimes play it coming down from the top.
    const down = d >= 4 && Math.random() < 0.5;
    if (down) names = names.slice().reverse();
    const notes = names.map(midiOf);
    const pattern = minor ? MINOR_PATTERN : MAJOR_PATTERN;
    return {
      type: 'buildSeq', item: `sbuild:${stripOct(t)}:${kind}`,
      prompt: `Play the ${pretty(t)} ${kind} scale${down ? ' going down' : ''}`,
      sub: down ? 'Start on the marked key at the top and go down.' : d <= 2 ? `Start on the marked key and go up: ${pattern}` : 'Start on the marked key and go up.',
      notes, names: names.map((n) => pretty(n)),
      ...rangeFor(notes, 8), marks: [notes[0]],
      explain: `${pretty(t)} ${kind}: ${names.map((n) => pretty(n)).join(' ')}`,
    };
  };
}

function genNotIn(tonics, minor = false) {
  return () => {
    const t = pick(tonics);
    const names = scale(t + '4', minor ? NAT_MINOR : MAJOR).slice(0, 7).map(stripOct);
    // Outsider: alter one scale note by a half step (keeps the same letter, so it's a near miss)
    const victim = pick(names);
    const p = parse(victim);
    const alt = p.letter + (p.acc === 0 ? (Math.random() < 0.5 ? '#' : 'b') : '');
    const outsider = ['E#', 'B#', 'Fb', 'Cb'].includes(alt) ? p.letter + (alt.endsWith('#') ? 'b' : '#') : alt;
    const ins = sampleWith(names.filter((n) => n !== victim), 3);
    const opts = shuffle([outsider, ...ins].map((n) => pretty(n)));
    return {
      type: 'choice', item: `notin:${t}:${minor}`,
      prompt: `Which note is NOT in ${pretty(t)} ${minor ? 'minor' : 'major'}?`,
      options: opts, correct: opts.indexOf(pretty(outsider)),
      explain: `${pretty(t)} ${minor ? 'minor' : 'major'}: ${names.map((n) => pretty(n)).join(' ')}`,
    };
  };
}

const sigText = (c) => (c === 0 ? 'No sharps or flats' : `${Math.abs(c)} ${c > 0 ? 'sharp' : 'flat'}${Math.abs(c) > 1 ? 's' : ''}`);

function genSigCount(keys) {
  return () => {
    const k = pick(keys);
    const c = MAJOR_KEYS[k];
    const opts = sampleWith([0, 1, 2, 3, 4, -1, -2, -3, -4].map(sigText), 4, sigText(c));
    return { type: 'choice', item: `sigcount:${k}`, prompt: `What's the key signature of ${pretty(k)} major?`, options: opts, correct: opts.indexOf(sigText(c)), explain: c ? `${pretty(k)} major has ${keySigNotes(c).map((n) => pretty(n)).join(', ')}.` : 'C major uses only white keys.' };
  };
}

function genSigName(keys, minor = false) {
  return () => {
    const k = pick(keys);
    const table = minor ? MINOR_KEYS : MAJOR_KEYS;
    const c = table[k];
    const opts = sampleWith(keys.map((x) => `${pretty(x)} ${minor ? 'minor' : 'major'}`), 4, `${pretty(k)} ${minor ? 'minor' : 'major'}`);
    return {
      type: 'choice', item: `signame:${k}:${minor}`,
      prompt: `Which ${minor ? 'minor' : 'major'} key has this key signature?`,
      media: { staff: { clef: 'treble', key: c, notes: [] } },
      options: opts, correct: opts.indexOf(`${pretty(k)} ${minor ? 'minor' : 'major'}`),
      explain: c > 0 ? 'For sharp keys, the major key is a half step above the last sharp.' : c < 0 ? (c === -1 ? 'One flat (B♭) is F major.' : 'For flat keys, the second-to-last flat names the major key.') : 'No sharps or flats: C major (or A minor).',
    };
  };
}

const MODE_WHY = {
  Major: 'Major sounds bright: its 3rd note is 4 half steps up.',
  Minor: 'Minor sounds darker: its 3rd note is only 3 half steps up.',
};

function genScaleHear({ d = 1 } = {}) {
  const minor = Math.random() < 0.5;
  const t = 55 + rand(10);
  const gap = d >= 3 ? 0.24 : 0.32;
  const make = (label) => seqEvents((label === 'Minor' ? NAT_MINOR : MAJOR).map((s) => t + s), gap);
  return {
    type: 'choice', item: `shear:${minor}`, ear: true,
    prompt: 'Major or minor scale?',
    sub: d <= 2 ? 'Major sounds bright; minor sounds darker.' : null,
    media: { play: make(minor ? 'Minor' : 'Major') },
    whyWrong: (label) => `${MODE_WHY[label]} This one was ${minor ? 'minor' : 'major'}.`,
    audioFor: make,
    options: ['Major', 'Minor'], correct: minor ? 1 : 0,
    explain: minor ? 'Minor: the 3rd note is only 3 half steps above the start.' : 'Major: the 3rd note is 4 half steps above the start.',
  };
}

const MOTIFS = [[0, 1, 2, 3, 4, 2, 0], [0, 2, 4, 2, 0], [4, 3, 2, 1, 0], [0, 2, 4, 7, 4, 2, 0], [0, 4, 2, 5, 4, 2, 1, 0]];
function genMelodyHear({ d = 1 } = {}) {
  const minor = Math.random() < 0.5;
  const t = 57 + rand(8);
  const motif = pick(d >= 3 ? MOTIFS : MOTIFS.slice(0, 3));
  const make = (label) => seqEvents(motif.map((deg) => t + (label === 'Minor' ? NAT_MINOR : MAJOR)[deg]), d >= 4 ? 0.3 : 0.38);
  return {
    type: 'choice', item: `mhear:${minor}`, ear: true,
    prompt: 'Is this melody major or minor?',
    media: { play: make(minor ? 'Minor' : 'Major') },
    whyWrong: (label) => `${MODE_WHY[label]} This melody was ${minor ? 'minor' : 'major'}.`,
    audioFor: make,
    options: ['Major', 'Minor'], correct: minor ? 1 : 0,
  };
}

function genRelative(majors) {
  return () => {
    const toMinor = Math.random() < 0.6;
    const k = pick(majors);
    const m = relativeMinor(k);
    if (toMinor) {
      const opts = sampleWith(majors.map((x) => `${pretty(relativeMinor(x))} minor`), 4, `${pretty(m)} minor`);
      return { type: 'choice', item: `rel:${k}`, prompt: `What's the relative minor of ${pretty(k)} major?`, sub: 'Count 3 half steps down from the major key.', options: opts, correct: opts.indexOf(`${pretty(m)} minor`), explain: `${pretty(m)} minor shares ${pretty(k)} major's key signature.` };
    }
    const opts = sampleWith(majors.map((x) => `${pretty(x)} major`), 4, `${pretty(k)} major`);
    return { type: 'choice', item: `relm:${m}`, prompt: `What's the relative major of ${pretty(m)} minor?`, sub: 'Count 3 half steps up from the minor key.', options: opts, correct: opts.indexOf(`${pretty(k)} major`), explain: `${pretty(relativeMajor(m))} major shares ${pretty(m)} minor's key signature.` };
  };
}

const cMajor = scale('C4');
const aMinor = scale('A3', NAT_MINOR);

export default {
  id: 'u5', title: 'Scales & Keys', desc: 'Major, minor and key signatures', color: 'lilac', requires: 'u4',
  lessons: [
    {
      id: 'u5l1', title: 'The major scale', icon: '🪜',
      intro: [
        { type: 'learn', title: 'Scales', text: 'A <b>scale</b> is a set of notes that sound good together. Songs mostly use the notes of one scale, and that\'s the song\'s <b>key</b>.<br><br>Your DAW\'s "scale" highlight in the piano roll shows exactly this.' },
        { type: 'learn', title: 'The major pattern', text: 'Every major scale follows the same step pattern:<br><b>W W H W W W H</b><br>(W = whole step, H = half step).<br><br>Start on C and you get only white keys: <b>C major</b>.', staff: { clef: 'treble', items: cMajor.map((n) => ({ notes: [n], label: pretty(n) })) }, events: seqEvents(cMajor.map(midiOf), 0.35) },
      ],
      gens: [genBuild(['C4']), genBuild(['C4']), genNotIn(['C']),
        fact('fact:majpat', 'What\'s the step pattern of a major scale?', ['W W H W W W H', 'W H W W H W W', 'W W W H W W H', 'H W W W H W W'], 0),
        fact('fact:halfsteps', 'Where are the half steps in C major?', ['E–F and B–C', 'C–D and F–G', 'D–E and A–B', 'There are none'], 0)],
      count: 8,
    },
    {
      id: 'u5l2', title: 'Sharps & flats in scales', icon: '🔑',
      intro: [
        { type: 'learn', title: 'Other major scales', text: 'Start the same pattern on another note and you\'ll need some black keys to keep it right.<br><br><b>G major</b> needs one sharp: <b>F♯</b>.', staff: { clef: 'treble', items: scale('G4').map((n) => ({ notes: [n], label: pretty(n) })) }, events: seqEvents(scale('G4').map(midiOf), 0.35) },
        { type: 'learn', title: 'Flat keys', text: '<b>F major</b> needs one flat: <b>B♭</b>.<br><br>Each letter appears exactly once in a scale, so it\'s B♭, not A♯.', staff: { clef: 'treble', items: scale('F4').map((n) => ({ notes: [n], label: pretty(n) })) }, events: seqEvents(scale('F4').map(midiOf), 0.35) },
      ],
      gens: [genBuild(['G4', 'D4', 'F4']), genBuild(['G4', 'D4', 'F4', 'A3']), genNotIn(['G', 'D', 'F', 'A']),
        fact('fact:gsharp', 'Which note is sharp in G major?', ['F♯', 'C♯', 'G♯', 'D♯'], 0),
        fact('fact:fflat', 'Which note is flat in F major?', ['B♭', 'E♭', 'A♭', 'D♭'], 0)],
      count: 10,
    },
    {
      id: 'u5l3', title: 'Key signatures', icon: '📜',
      intro: [
        { type: 'learn', title: 'Key signature', text: 'Instead of writing ♯ or ♭ on every note, music puts them once at the start of each line: the <b>key signature</b>.<br><br>This one has F♯ and C♯: <b>D major</b>.', staff: { clef: 'treble', key: 2, notes: [] } },
        { type: 'learn', title: 'Reading them', text: 'Sharps always appear in the order <b>F C G D A E B</b>; flats in the reverse, <b>B E A D G C F</b>.<br><br>Sharp keys: the key is a half step above the last sharp. Flat keys: the second-to-last flat names the key.', staff: { clef: 'treble', key: -3, notes: [] } },
      ],
      gens: [genSigName(['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb']), genSigName(['G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab']), genSigCount(['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'])],
      count: 10,
    },
    {
      id: 'u5l4', title: 'Minor scales', icon: '🌙',
      intro: [
        { type: 'learn', title: 'The minor scale', text: 'The <b>natural minor</b> scale has a darker sound. Its pattern:<br><b>W H W W H W W</b><br><br>Start on A and it\'s all white keys: <b>A minor</b>.', staff: { clef: 'treble', items: aMinor.map((n) => ({ notes: [n], label: pretty(n) })) }, events: seqEvents(aMinor.map(midiOf), 0.35) },
        { type: 'learn', title: 'Relative keys', text: 'A minor uses the same notes as C major. They\'re <b>relatives</b> and share a key signature.<br><br>To find a major key\'s relative minor, go <b>3 half steps down</b>. G major → <b>E minor</b>.' },
      ],
      gens: [genBuild(['A3', 'E4', 'D4'], true), genRelative(['C', 'G', 'D', 'F', 'Bb']), genScaleHear, genSigName(['A', 'E', 'D', 'B', 'G'], true),
        fact('fact:minpat', 'What\'s the step pattern of a natural minor scale?', ['W H W W H W W', 'W W H W W W H', 'H W W H W W W', 'W W W H W H W'], 0)],
      count: 10,
    },
    {
      id: 'u5l5', title: 'Scale ears', icon: '🎧',
      intro: [
        { type: 'learn', title: 'Bright vs dark', text: 'Most of what makes music feel happy or sad is major vs minor. Train your ears to hear it in scales and melodies.', events: [...seqEvents(MAJOR.map((s) => 60 + s), 0.3), ...seqEvents(NAT_MINOR.map((s) => 60 + s), 0.3).map((e) => ({ ...e, t: e.t + 3 }))], eventsLabel: 'Major, then minor' },
      ],
      gens: [genScaleHear, genMelodyHear, genMelodyHear, genRelative(['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb']), genBuild(['C4', 'G4', 'F4', 'D4']), genBuild(['A3', 'E4'], true)],
      count: 12,
    },
  ],
};
