// Unit: Pentatonic & Blues (Scales II)
import { sampleWith, shuffle, choice as pick, rand } from '../util.js';
import { SCALES, scaleOf, scale, NAT_MINOR, pretty, stripOct, midiOf, parse, relativeMajor, relativeMinor } from '../theory.js';
import { fact, seqEvents, rangeFor } from '../gen.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const KIND_LABEL = { majPent: 'Major pentatonic', minPent: 'Minor pentatonic', blues: 'Blues scale' };
const LABEL_KIND = Object.fromEntries(Object.entries(KIND_LABEL).map(([k, v]) => [v, k]));
const SOUND = {
  majPent: 'Major pentatonic sounds open and sunny: no half steps at all.',
  minPent: 'Minor pentatonic sounds dark and bluesy-cool: the rock and hip-hop scale.',
  blues: 'The blues scale adds a gritty "blue note" (♭5) that slides between the 4th and 5th.',
};
const names = (tonic, kind) => scaleOf(tonic, kind).map((n) => pretty(n));
const spelled = (tonic, kind) => names(tonic, kind).slice(0, -1).join(' ');

/** Swung riff: notes alternate long-short like a groove. */
function riffEvents(midis, base = 0.3) {
  let t = 0;
  return midis.map((m, i) => {
    const e = { m: [m], t, d: base * 1.3, v: 0.8 };
    t += i % 2 === 0 ? base * 1.25 : base * 0.75;
    return e;
  });
}

function genBuild(tonics, kind) {
  return ({ d = 1 } = {}) => {
    const t = pick(tonics);
    let notes = scaleOf(t, kind);
    const down = d >= 4 && Math.random() < 0.5;
    if (down) notes = notes.slice().reverse();
    const midis = notes.map(midiOf);
    return {
      type: 'buildSeq', item: `pbuild:${stripOct(t)}:${kind}`,
      prompt: `Play ${pretty(t)} ${SCALES[kind].name}${down ? ' going down' : ''}`,
      sub: down ? 'Start on the marked key at the top and go down.' : d <= 2 ? `Start on the marked key and go up: ${SCALES[kind].formula}` : 'Start on the marked key and go up.',
      notes: midis, names: notes.map((n) => pretty(n)),
      ...rangeFor(midis, 8), marks: [midis[0]],
      explain: `${pretty(t)} ${SCALES[kind].name}: ${spelled(t, kind)} (${SCALES[kind].formula})`,
    };
  };
}

// The notes a scale leaves out of its parent scale make the best "not in" answers.
function genNotIn(tonics, kind) {
  return () => {
    const t = pick(tonics);
    const ins = names(t + '4', kind).slice(0, -1);
    const parent = kind === 'majPent' ? scale(t + '4') : scale(t + '4', NAT_MINOR);
    const left = parent.slice(0, 7).map((n) => pretty(n)).filter((n) => !ins.includes(n));
    const outsider = pick(left);
    const opts = shuffle([outsider, ...sampleWith(ins.filter((n) => n !== outsider), 3)]);
    return {
      type: 'choice', item: `pnotin:${t}:${kind}`,
      prompt: `Which note is NOT in ${pretty(t)} ${SCALES[kind].name}?`,
      options: opts, correct: opts.indexOf(outsider),
      explain: `${pretty(t)} ${SCALES[kind].name}: ${ins.join(' ')}. It leaves out ${left.join(' and ')}.`,
    };
  };
}

function genHearType(kinds) {
  return ({ d = 1 } = {}) => {
    const kind = pick(kinds);
    const t = 55 + rand(8);
    const down = d >= 3 && Math.random() < 0.4;
    const gap = d >= 3 ? 0.24 : 0.3;
    const make = (k) => {
      const m = SCALES[k].semis.map((s) => t + s);
      return seqEvents(down ? m.reverse() : m, gap);
    };
    const opts = shuffle(kinds.map((k) => KIND_LABEL[k]));
    return {
      type: 'choice', item: `phear:${kind}`, ear: true,
      prompt: `Which scale is this?${down ? ' (going down)' : ''}`,
      media: { play: make(kind) },
      options: opts, correct: opts.indexOf(KIND_LABEL[kind]),
      explain: SOUND[kind],
      whyWrong: (label) => (LABEL_KIND[label] ? `${SOUND[LABEL_KIND[label]]} This one was the ${SCALES[kind].name}.` : null),
      audioFor: (label) => (LABEL_KIND[label] ? make(LABEL_KIND[label]) : []),
    };
  };
}

// Riffs as indexes into each scale's notes (blues riffs lean on the blue note, index 3).
const RIFFS = {
  majPent: [[0, 1, 2, 4, 2, 1, 0], [2, 3, 4, 3, 2, 0], [0, 2, 3, 4, 5, 4, 2], [4, 3, 2, 1, 0, 1, 2]],
  minPent: [[0, 1, 2, 1, 0], [0, 1, 2, 3, 2, 1, 0], [4, 3, 2, 1, 0], [0, 2, 3, 4, 3, 1, 0]],
  blues: [[0, 1, 2, 3, 4, 3, 2, 0], [4, 3, 2, 1, 0], [0, 2, 3, 4, 1, 0], [2, 3, 4, 5, 4, 3, 2]],
};
const riffMidis = (t, kind, riff) => riff.map((i) => t + SCALES[kind].semis[i]);

function genRiffHear(kinds) {
  return ({ d = 1 } = {}) => {
    const kind = pick(kinds);
    const t = 55 + rand(8);
    const riff = pick(RIFFS[kind]);
    const speed = d >= 4 ? 0.24 : 0.3;
    const opts = shuffle(kinds.map((k) => KIND_LABEL[k]));
    return {
      type: 'choice', item: `priff:${kind}`, ear: true,
      prompt: 'Which scale is this riff from?',
      media: { play: riffEvents(riffMidis(t, kind, riff), speed) },
      options: opts, correct: opts.indexOf(KIND_LABEL[kind]),
      explain: SOUND[kind],
      whyWrong: (label) => (LABEL_KIND[label] ? `${SOUND[LABEL_KIND[label]]} This riff used the ${SCALES[kind].name}.` : null),
      audioFor: (label) => {
        const k = LABEL_KIND[label];
        return k ? riffEvents(riffMidis(t, k, k === kind ? riff : RIFFS[k][0]), speed) : [];
      },
    };
  };
}

/** Echo: hear a short riff, then play it back on the keys. */
function genEcho(tonics, kinds) {
  return ({ d = 1 } = {}) => {
    const kind = pick(kinds);
    const t = pick(tonics);
    const len = Math.min(3 + d - 1, 6);
    const sc = scaleOf(t, kind);
    // A short stepwise-ish riff inside the scale, starting on the tonic at low levels.
    let idx;
    do {
      idx = [d <= 2 ? 0 : rand(3)];
      while (idx.length < len) {
        const last = idx[idx.length - 1];
        let move = pick(d >= 4 ? [-2, -1, 1, 2] : [-1, 1, 1]);
        if (last + move < 0 || last + move > sc.length - 1) move = -move; // bounce off the ends
        idx.push(last + move);
      }
    } while (new Set(idx).size < Math.min(3, len)); // a riff, not one note repeated
    const notes = idx.map((i) => sc[i]);
    const midis = notes.map(midiOf);
    return {
      type: 'buildSeq', item: `echo:${kind}:${len}`,
      prompt: 'Play this riff back',
      sub: d <= 2 ? `It uses ${pretty(t)} ${SCALES[kind].name}. The first note is marked.` : `It uses ${pretty(t)} ${SCALES[kind].name}.`,
      play: riffEvents(midis, d >= 4 ? 0.26 : 0.34),
      notes: midis, names: notes.map((n) => pretty(n)),
      ...rangeFor(scaleOf(t, kind).map(midiOf), 8), marks: d <= 2 ? [midis[0]] : [],
      explain: `The riff: ${notes.map((n) => pretty(n)).join(' ')}`,
    };
  };
}

function genBlueNote(tonics) {
  return () => {
    const t = pick(tonics);
    const sc = names(t + '4', 'blues').slice(0, -1);
    const blue = sc[3];
    const opts = shuffle([blue, ...sampleWith(sc.filter((n) => n !== blue), 3)]);
    return {
      type: 'choice', item: `pblue:${t}`,
      prompt: `Which is the blue note in ${pretty(t)} blues?`,
      sub: 'It\'s the ♭5: between the 4th and the 5th.',
      options: opts, correct: opts.indexOf(blue),
      explain: `${pretty(t)} blues: ${sc.join(' ')}. The blue note is ${blue}.`,
    };
  };
}

function genRelative(majors) {
  return () => {
    const k = pick(majors);
    const m = relativeMinor(k);
    if (Math.random() < 0.5) {
      const right = `${pretty(k)} major pentatonic`;
      const opts = sampleWith(majors.map((x) => `${pretty(x)} major pentatonic`), 4, right);
      return { type: 'choice', item: `prel:${m}`, prompt: `${pretty(m)} minor pentatonic has the same notes as…`, sub: 'Its relative major is 3 half steps up.', options: opts, correct: opts.indexOf(right), explain: `${pretty(m)} minor pentatonic (${spelled(m + '4', 'minPent')}) and ${pretty(k)} major pentatonic (${spelled(k + '4', 'majPent')}) share all five notes.` };
    }
    const right = `${pretty(m)} minor pentatonic`;
    const opts = sampleWith(majors.map((x) => `${pretty(relativeMinor(x))} minor pentatonic`), 4, right);
    return { type: 'choice', item: `prelm:${k}`, prompt: `${pretty(k)} major pentatonic has the same notes as…`, sub: 'Its relative minor is 3 half steps down.', options: opts, correct: opts.indexOf(right), explain: `Same five notes, different home note: ${pretty(relativeMajor(m))} vs ${pretty(m)}.` };
  };
}

function genSafeScale() {
  const minor = Math.random() < 0.6;
  const key = pick(minor ? ['A', 'E', 'D', 'C', 'F', 'G', 'B'] : ['C', 'G', 'D', 'F', 'A', 'Bb', 'E']);
  const right = `${pretty(key)} ${minor ? 'minor' : 'major'} pentatonic`;
  const wrongs = [
    `${pretty(key)} ${minor ? 'major' : 'minor'} pentatonic`,
    `${pretty(minor ? relativeMinor(key) : relativeMajor(key))} ${minor ? 'minor' : 'major'} pentatonic`,
    ...['C', 'D', 'E', 'F', 'G', 'A', 'B'].filter((x) => x !== key).map((x) => `${x} ${minor ? 'minor' : 'major'} pentatonic`),
  ];
  const opts = sampleWith([...new Set(wrongs)].filter((o) => o !== right), 3).concat(right);
  const sh = shuffle(opts);
  return {
    type: 'choice', item: `psafe:${minor}`,
    prompt: `Your track is in ${pretty(key)} ${minor ? 'minor' : 'major'}. Which scale is a safe bet for a hook?`,
    options: sh, correct: sh.indexOf(right),
    explain: `The ${minor ? 'minor' : 'major'} pentatonic on the key's home note never clashes with the chords. That's why it's the go-to for hooks, basslines and solos.`,
  };
}

const staffOf = (tonic, kind) => ({ clef: 'treble', items: scaleOf(tonic, kind).map((n) => ({ notes: [n], label: pretty(n) })) });
const playScale = (tonic, kind) => seqEvents(scaleOf(tonic, kind).map(midiOf), 0.32);

export default {
  id: 'u8', title: 'Pentatonic & Blues', desc: 'Scales II · The 5-note scales behind riffs and solos', color: 'lilac', requires: 'u5',
  lessons: [
    {
      id: 'u8l1', title: 'Major pentatonic', icon: '🌤️',
      intro: [
        { type: 'learn', title: 'Five-note scales', text: '<b>Penta</b> means five. A <b>pentatonic</b> scale has just five notes, and it\'s behind a huge share of melodies, riffs and basslines.<br><br>Fewer notes, fewer clashes: it\'s hard to play a wrong note.' },
        { type: 'learn', title: 'Major pentatonic', text: 'Take the major scale and drop its <b>4th</b> and <b>7th</b>. Those are the notes that make half steps.<br><br>C major pentatonic = <b>C D E G A</b>. Formula: <b>1 2 3 5 6</b>.', staff: staffOf('C4', 'majPent'), events: playScale('C4', 'majPent') },
        { type: 'learn', title: 'Party trick', text: 'Play <b>only the black keys</b> and you\'re playing a pentatonic scale (G♭ major pentatonic). Mash them in any order and it sounds musical!', piano: { from: 60, to: 76, marks: [61, 63, 66, 68, 70, 73, 75], play: [61, 63, 66, 68, 70, 73], gap: 0.3 } },
      ],
      gens: [genBuild(['C4', 'G4', 'F4'], 'majPent'), genBuild(['C4', 'D4', 'G4'], 'majPent'), genNotIn(['C', 'G', 'F', 'D'], 'majPent'),
        fact('fact:pent5', 'How many different notes are in a pentatonic scale?', ['5', '7', '6', '4'], 0),
        fact('fact:pentleft', 'Major pentatonic is the major scale without its…', ['4th and 7th', '2nd and 6th', '3rd and 5th', '5th and octave'], 0)],
      count: 10,
    },
    {
      id: 'u8l2', title: 'Minor pentatonic', icon: '🌙',
      intro: [
        { type: 'learn', title: 'Minor pentatonic', text: 'The <b>minor pentatonic</b> is the sound of rock riffs, blues solos and countless hip-hop hooks.<br><br>A minor pentatonic = <b>A C D E G</b>. Formula: <b>1 ♭3 4 5 ♭7</b>.', staff: staffOf('A3', 'minPent'), events: playScale('A3', 'minPent') },
        { type: 'learn', title: 'Same notes, new home', text: 'A minor pentatonic uses the exact same notes as <b>C major pentatonic</b>, just starting on A. They\'re relatives, like A minor and C major.<br><br>Which note feels like "home" changes the whole mood.', events: [...playScale('C4', 'majPent'), ...playScale('A3', 'minPent').map((e) => ({ ...e, t: e.t + 2.4 }))], eventsLabel: 'C major, then A minor pentatonic' },
      ],
      gens: [genBuild(['A3', 'E4', 'D4'], 'minPent'), genBuild(['A3', 'E4', 'G4'], 'minPent'), genNotIn(['A', 'E', 'D', 'G'], 'minPent'), genRelative(['C', 'G', 'D', 'F']), genHearType(['majPent', 'minPent'])],
      count: 10,
    },
    {
      id: 'u8l3', title: 'The blues scale', icon: '🎷',
      intro: [
        { type: 'learn', title: 'The blue note', text: 'Add one note to the minor pentatonic, the <b>♭5</b>, and you get the <b>blues scale</b>. That extra note is the <b>blue note</b>: gritty, tense, soulful.<br><br>A blues = <b>A C D E♭ E G</b>.', staff: staffOf('A3', 'blues'), events: playScale('A3', 'blues') },
        { type: 'learn', title: 'Use it as a passing note', text: 'The blue note sounds best <b>on the way</b> between the 4th and 5th (D → E♭ → E), rather than held for ages. Slide through it.', events: riffEvents([57, 60, 62, 63, 64, 63, 62, 57].map((m) => m + 12), 0.3), eventsLabel: 'Hear a blues lick' },
      ],
      gens: [genBuild(['A3', 'E4', 'D4'], 'blues'), genBlueNote(['A', 'E', 'D', 'G', 'C']), genHearType(['minPent', 'blues']), genNotIn(['A', 'E', 'D'], 'minPent'),
        fact('fact:bluesadd', 'The blues scale is the minor pentatonic plus…', ['A ♭5 (the blue note)', 'A major 7th', 'A ♭2', 'A major 3rd'], 0)],
      count: 10,
    },
    {
      id: 'u8l4', title: 'Riffs & licks', icon: '🎸',
      intro: [
        { type: 'learn', title: 'Riffs', text: 'A <b>riff</b> is a short, catchy phrase that repeats. Most riffs live inside one of these three scales.<br><br>Now you\'ll hear riffs, name their scale, and play some back yourself.' },
        { type: 'learn', title: 'Echo', text: 'In an <b>echo</b>, Riff plays a short riff and you play it back on the keys. Replay it as often as you like. Hum it first!' },
      ],
      gens: [genRiffHear(['majPent', 'minPent', 'blues']), genRiffHear(['majPent', 'minPent']), genEcho(['C4', 'A3', 'G4'], ['majPent', 'minPent']), genEcho(['A3', 'E4'], ['minPent', 'blues'])],
      count: 10,
    },
    {
      id: 'u8l5', title: 'Pentatonic ears', icon: '🎧',
      intro: [
        { type: 'learn', title: 'Put it to work', text: 'In your DAW: if a track is in a minor key, the <b>minor pentatonic</b> on its home note is a safe bet for hooks, basslines and solos. Major key? Reach for the <b>major pentatonic</b>.<br><br>Add the blue note for extra attitude.' },
      ],
      gens: [genHearType(['majPent', 'minPent', 'blues']), genRiffHear(['majPent', 'minPent', 'blues']), genSafeScale, genEcho(['C4', 'A3', 'E4', 'G4'], ['majPent', 'minPent', 'blues']), genRelative(['C', 'G', 'D', 'F', 'Bb'])],
      count: 12,
    },
  ],
};
