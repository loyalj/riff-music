// Unit 7: Progressions
import { sampleWith, shuffle, choice as pick } from '../util.js';
import { diatonic, voice, pretty, QUALITIES } from '../theory.js';
import { fact, chordEvent } from '../gen.js';

const MAJ_PROGS = {
  'I–IV–V–I': ['I', 'IV', 'V', 'I'],
  'I–V–vi–IV': ['I', 'V', 'vi', 'IV'],
  'vi–IV–I–V': ['vi', 'IV', 'I', 'V'],
  'I–vi–IV–V': ['I', 'vi', 'IV', 'V'],
  'I–IV–I–V': ['I', 'IV', 'I', 'V'],
  'ii–V–I–I': ['ii', 'V', 'I', 'I'],
};
const MIN_PROGS = {
  'i–VI–III–VII': ['i', 'VI', 'III', 'VII'],
  'i–iv–v–i': ['i', 'iv', 'v', 'i'],
  'i–VII–VI–VII': ['i', 'VII', 'VI', 'VII'],
  'i–iv–VI–v': ['i', 'iv', 'VI', 'v'],
};

const chordsOf = (tonic, minor, numerals) => {
  const d = diatonic(tonic, minor);
  return numerals.map((n) => d.find((c) => c.numeral === n));
};
const progEvents = (tonic, minor, numerals, gap = 1.05) =>
  chordsOf(tonic, minor, numerals).map((c, i) => chordEvent(voice(c.root, c.q), i * gap, gap * 0.95));
const keyName = (t, minor) => `${pretty(t)} ${minor ? 'minor' : 'major'}`;

function genNumeralToChord(keys, minor = false) {
  return () => {
    const t = pick(keys);
    const d = diatonic(t, minor);
    const c = pick(d);
    const opts = sampleWith(d.map((x) => x.symbol), 4, c.symbol);
    return {
      type: 'choice', item: `n2c:${minor}:${c.numeral}`,
      prompt: `In ${keyName(t, minor)}, which chord is ${c.numeral}?`,
      options: opts, correct: opts.indexOf(c.symbol),
      explain: `${keyName(t, minor)}: ${d.map((x) => `${x.numeral} ${x.symbol}`).join(' · ')}`,
    };
  };
}

function genChordToNumeral(keys, minor = false) {
  return () => {
    const t = pick(keys);
    const d = diatonic(t, minor);
    const c = pick(d.slice(1));
    const opts = sampleWith(d.map((x) => x.numeral), 4, c.numeral);
    return {
      type: 'choice', item: `c2n:${minor}:${c.numeral}`,
      prompt: `In ${keyName(t, minor)}, ${c.symbol} is which chord?`,
      options: opts, correct: opts.indexOf(c.numeral),
      explain: `${keyName(t, minor)}: ${d.map((x) => `${x.numeral} ${x.symbol}`).join(' · ')}`,
    };
  };
}

function genNumeralQuality(minor = false) {
  return () => {
    const c = pick(diatonic('C', minor));
    const name = QUALITIES[c.q].name;
    const opts = ['major', 'minor', 'diminished'];
    return {
      type: 'choice', item: `nq:${minor}:${c.numeral}`,
      prompt: `In a ${minor ? 'minor' : 'major'} key, the ${c.numeral} chord is…`,
      sub: 'Uppercase = major, lowercase = minor, ° = diminished.',
      options: opts.map((x) => x[0].toUpperCase() + x.slice(1)), correct: opts.indexOf(name),
    };
  };
}

function genHearProg(progs, minor = false) {
  return ({ d = 1 } = {}) => {
    const names = Object.keys(progs);
    const name = pick(names);
    const t = pick(minor ? ['A', 'E', 'D', 'C', 'G', 'B'] : d >= 4 ? ['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'] : ['C', 'D', 'F', 'G', 'A']);
    const opts = sampleWith(names, Math.min(d >= 3 ? 4 : 3, names.length), name);
    const gap = d >= 3 ? 0.85 : 1.05;
    const symbols = (n) => chordsOf(t, minor, progs[n]).map((c) => c.symbol).join(' – ');
    return {
      type: 'choice', item: `phear:${name}`, ear: true,
      prompt: 'Which progression do you hear?',
      sub: d <= 2 ? 'Listen for where "home" (I) falls.' : null,
      media: { play: progEvents(t, minor, progs[name], gap) },
      whyWrong: (label) => (progs[label] ? `${label} would be ${symbols(label)}. This was ${name}: ${symbols(name)}.` : null),
      audioFor: (label) => (progs[label] ? progEvents(t, minor, progs[label], gap) : []),
      options: opts, correct: opts.indexOf(name),
      explain: `${name} in ${keyName(t, minor)}: ${chordsOf(t, minor, progs[name]).map((c) => c.symbol).join(' – ')}`,
    };
  };
}

function genProgInKey(progs, keys, minor = false) {
  return () => {
    const names = Object.keys(progs);
    const name = pick(names);
    const t = pick(keys);
    const right = chordsOf(t, minor, progs[name]).map((c) => c.symbol).join(' – ');
    const pool = new Set();
    for (const k of keys) if (k !== t) pool.add(chordsOf(k, minor, progs[name]).map((c) => c.symbol).join(' – '));
    for (const n of names) if (n !== name) pool.add(chordsOf(t, minor, progs[n]).map((c) => c.symbol).join(' – '));
    pool.delete(right);
    const opts = sampleWith([right, ...pool], 4, right);
    return {
      type: 'choice', item: `pkey:${name}:${t}`,
      prompt: `${name} in ${keyName(t, minor)} is…`,
      options: opts, correct: opts.indexOf(right),
      media: { play: progEvents(t, minor, progs[name]), autoplay: false, label: 'Hear it' },
    };
  };
}

function genModeHear() {
  const minor = Math.random() < 0.5;
  const progs = minor ? MIN_PROGS : MAJ_PROGS;
  const name = pick(Object.keys(progs));
  const majName = pick(Object.keys(MAJ_PROGS));
  const minName = pick(Object.keys(MIN_PROGS));
  return {
    type: 'choice', item: `pmode:${minor}`, ear: true,
    prompt: 'Is this progression in a major or minor key?',
    media: { play: progEvents(minor ? 'A' : 'C', minor, progs[name]) },
    audioFor: (label) => (label === 'Minor key' ? progEvents('A', true, MIN_PROGS[minor ? name : minName]) : progEvents('C', false, MAJ_PROGS[minor ? majName : name])),
    whyWrong: () => (minor ? 'This one settles on a minor chord, so it\'s in a minor key.' : 'Home here is a major chord, so it\'s in a major key.'),
    options: ['Major key', 'Minor key'], correct: minor ? 1 : 0,
    explain: minor ? 'Minor key: it starts and settles on a minor chord.' : 'Major key: home is a major chord.',
  };
}

const pick2 = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const cMaj = diatonic('C');

export default {
  id: 'u7', title: 'Progressions', desc: 'I–IV–V–vi and friends', color: 'gold', requires: 'u6',
  lessons: [
    {
      id: 'u7l1', title: 'Chords in a key', icon: '🏠',
      intro: [
        { type: 'learn', title: 'Seven chords', text: 'Build a triad on each note of a scale, using only notes from that scale, and you get the key\'s <b>seven chords</b>.<br><br>In C major: <b>C Dm Em F G Am B°</b>.', events: cMaj.map((c, i) => chordEvent(voice(c.root, c.q), i * 0.8, 0.75)), eventsLabel: 'Hear all seven' },
        { type: 'learn', title: 'Roman numerals', text: 'Musicians number them with <b>Roman numerals</b>, so progressions work in any key:<br><b>I ii iii IV V vi vii°</b><br><br>Uppercase = major, lowercase = minor, ° = diminished.' },
      ],
      gens: [genNumeralToChord(['C']), genChordToNumeral(['C']), genNumeralQuality()],
      count: 10,
    },
    {
      id: 'u7l2', title: 'I–IV–V', icon: '🎸',
      intro: [
        { type: 'learn', title: 'Home and away', text: '<b>I</b> is home. <b>IV</b> moves away. <b>V</b> builds tension that wants to land back on I.<br><br>I–IV–V–I is the backbone of rock, blues and folk.', events: progEvents('C', false, ['I', 'IV', 'V', 'I']), eventsLabel: 'I–IV–V–I' },
      ],
      gens: [genHearProg(pick2(MAJ_PROGS, ['I–IV–V–I', 'I–IV–I–V', 'ii–V–I–I'])), genNumeralToChord(['C', 'G', 'D', 'F']), genProgInKey(pick2(MAJ_PROGS, ['I–IV–V–I']), ['C', 'G', 'D', 'F', 'A']),
        fact('fact:v', 'Which chord creates tension that pulls back to I?', ['V', 'IV', 'vi', 'iii'], 0)],
      count: 10,
    },
    {
      id: 'u7l3', title: 'The pop progression', icon: '⭐',
      intro: [
        { type: 'learn', title: 'I–V–vi–IV', text: 'This four-chord loop is in a huge number of hits, from "Let It Be" to "With or Without You". In C: <b>C – G – Am – F</b>.', events: progEvents('C', false, ['I', 'V', 'vi', 'IV']), eventsLabel: 'I–V–vi–IV' },
        { type: 'learn', title: 'Same loop, new start', text: 'Start the same loop on vi and it feels sadder: <b>vi–IV–I–V</b> (Am – F – C – G). Where a loop starts changes its mood.', events: progEvents('C', false, ['vi', 'IV', 'I', 'V']), eventsLabel: 'vi–IV–I–V' },
      ],
      gens: [genHearProg(pick2(MAJ_PROGS, ['I–V–vi–IV', 'I–IV–V–I', 'vi–IV–I–V', 'I–vi–IV–V'])), genHearProg(pick2(MAJ_PROGS, ['I–V–vi–IV', 'vi–IV–I–V'])), genProgInKey(pick2(MAJ_PROGS, ['I–V–vi–IV', 'vi–IV–I–V']), ['C', 'G', 'D', 'F']), genChordToNumeral(['C', 'G', 'F'])],
      count: 10,
    },
    {
      id: 'u7l4', title: 'Minor progressions', icon: '🌑',
      intro: [
        { type: 'learn', title: 'Chords in a minor key', text: 'Minor keys have their own seven chords: <b>i ii° III iv v VI VII</b>.<br><br>In A minor: <b>Am B° C Dm Em F G</b>.' },
        { type: 'learn', title: 'The epic loop', text: '<b>i–VI–III–VII</b> (Am – F – C – G) is the emotional, anthemic loop behind countless EDM and pop drops.', events: progEvents('A', true, ['i', 'VI', 'III', 'VII']), eventsLabel: 'i–VI–III–VII' },
      ],
      gens: [genHearProg(MIN_PROGS, true), genNumeralToChord(['A', 'E', 'D'], true), genProgInKey(pick2(MIN_PROGS, ['i–VI–III–VII', 'i–iv–v–i']), ['A', 'E', 'D'], true), genNumeralQuality(true)],
      count: 10,
    },
    {
      id: 'u7l5', title: 'Progression ears', icon: '🎧',
      intro: [
        { type: 'learn', title: 'Hear the changes', text: 'Last stop: train your ears to recognize progressions in any key. Listen for the home chord and the lift of the V.<br><br>You\'ve come a long way. Riff is proud of you! 🦏' },
      ],
      gens: [genHearProg(MAJ_PROGS), genHearProg(MIN_PROGS, true), genModeHear, genModeHear, genProgInKey(MAJ_PROGS, ['C', 'G', 'D', 'F', 'A'])],
      count: 12,
    },
  ],
};
