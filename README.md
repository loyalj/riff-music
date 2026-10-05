# Riff

Bite-sized daily music lessons, in the style of Duolingo, with Riff the rhino
as your guide. It runs at **https://riff.dblpl.us** and is built for phones
first. Add it to your home screen and it works offline.

Eight units, 40 lessons: the keyboard, rhythm, reading the staff, intervals,
scales and keys, chords, progressions, and pentatonic & blues scales, with six more units teased as
coming soon. Exercises mix reading, listening and playing: tap the key, name
the note on the staff, hear an interval or chord and name it, tap a rhythm
along with a metronome, play a scale in order, build a chord, and recognise a
progression by ear. Missed questions come back later in the same lesson,
and Practice favours the items you get wrong most.

Every item (a note, an interval, a chord...) is on a spaced-repetition
schedule: right answers push its next review out (1, 3, 7, 17... days, capped
at 60), misses bring it back tomorrow. Due items feed a Daily Review card on
the path, finished lessons crack and fade when their items are due (tap one to
refresh it), and new lessons mix in a few questions from earlier ones.

Each lesson has five levels (crowns). Passing needs 60% right first try at
level 1 (which also unlocks the next lesson) and 70% after that, and higher
levels change the questions: closer and descending intervals, chord
inversions, more choices, faster tempos, fewer hints. Within a session the
difficulty adapts: three right in a row steps it up, two misses eases off.
Wrong answers explain the specific mistake and can play yours against the
right one, and pairs you keep confusing get two-choice drills under
Practice → Mix-ups.

The Practice tab also has **Riff's Arcade**: mini games that are just for fun and never touch XP or the streak, only personal bests. Riff Run is a beat-keeper runner (jump on the rhythm, read the next bar in notation, tempo creeps up), Chordle is a daily chord puzzle (every guess must be a real chord; notes come back as in, root or out; you can listen to the mystery chord), Melody Memory is piano Simon in pentatonic, major or chromatic, Chord Catcher has you sort falling chord bubbles by sound (major, minor, then dim, aug and dom 7), Odd Note Out asks you to spot the moment a looping tune slips out of key, and Note Rain is sight-reading against the clock on treble, bass or both staffs.

A daily XP goal keeps a streak going. Streak freezes are earned every seven
days (at most two held) and are spent automatically on a missed day.

All sound is synthesised with Web Audio. There are no samples.

## Run it

Needs Node 20 or newer.

```
npm install
npm run dev          # http://localhost:5173, also on your LAN for testing on a phone
npm run build        # production build in dist/
npm run deploy       # build, then publish dist/ to Cloudflare Pages
```

`deploy` publishes with `wrangler deploy` to the `riff` project, configured in
`wrangler.jsonc`. Cloudflare no longer creates new classic Pages projects, so
riff is served as static assets on Workers (Pages' successor). `_headers` works
the same. The first run created the project at riff.loyalj.workers.dev; the
custom domain is added in the dashboard under Workers & Pages → riff →
Settings → Domains & Routes → Add → Custom domain → `riff.dblpl.us`.

## Layout

```
index.html
public/
  _headers             # caching rules for Cloudflare Pages
  sw.js                # service worker: offline support
  manifest.webmanifest, favicon.svg, icons/
src/
  main.js              # screens: path, lesson runner, results, practice, stats, settings
  curriculum.js        # units 1-2 (keyboard, rhythm), the unit list and teasers
  units/               # units 3-8: staff, intervals, scales, chords, progressions, pentatonic
  theory.js            # spelled notes, intervals, scales, chords, keys; staff notation SVG
  gen.js               # shared helpers for building exercise specs
  review.js            # spaced repetition: due items, Daily Review, refreshers, mix-ins
  arcade/              # mini games: hub, Riff Run, Chordle, Melody Memory, Chord Catcher,
                       #   Odd Note Out, Note Rain (+ shared ui, arcade.css, games2.css)
  exercises.js         # exercise renderers (learn, findKey, choice, hearFind, tapRhythm,
                       #   buildSeq, buildChord)
  state.js             # progress in localStorage: XP, streaks, freezes, per-item stats
  audio.js             # Web Audio piano, metronome and UI sounds
  rhythm.js            # rhythm playback, tap timing and latency calibration
  notation.js          # rhythm notation drawn as SVG
  piano.js             # the touch keyboard
  mascot.js            # Riff, an animated SVG rhino
  juice.js, juice.css  # confetti, sparkles, floating notes and the mascot's animations
  style.css            # theme tokens (light and dark) and layout
```

**Adding a lesson** means adding an entry to a unit (`curriculum.js` or a file
in `units/`): its intro cards and a list of generators. A generator returns an
exercise spec with an `item` key; that key is what the per-item stats and
spaced repetition track.

**Progress lives on the device only.** Settings can make a backup code to copy
it elsewhere. On iOS, Safari may clear storage for sites that are not added to
the home screen, so the app nudges you to install it.

**Tap timing** is judged on the audio clock. Bluetooth headphones add delay,
and Settings has a calibration that measures it and corrects for it.
