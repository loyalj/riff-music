import './style.css';
import './juice.css';
import './review.css';
import './mastery.css';
import './arcade/arcade.css';
import './arcade/games2.css';
import { arcadeSection } from './arcade/hub.js';
import { el, dayKey, addDays, parseDay, choice as pick } from './util.js';
import * as store from './state.js';
import { state } from './state.js';
import { UNITS, ALL_LESSONS, lessonById } from './curriculum.js';
import { EXERCISES } from './exercises.js';
import { unlock, sfx, setVolume, playSequence, installUnlockListeners, audioStatus, repairAudio } from './audio.js';
import { calibrate } from './rhythm.js';
import { createRhino, CHEERS, COMFORT, GREETINGS } from './mascot.js';
import { confetti, burst, countUp, pulse, clearFx } from './juice.js';
import { entriesOf, fromEntry, dueKeys, dueByLesson, lessonStrength, reviewSpecs, refreshSpecs, mixInSpecs, resetIndex, drillSpec } from './review.js';

const app = document.getElementById('app');
let tab = 'learn';
let cleanupScreen = null;

// ------------------------------------------------------------ boot
setVolume(state.settings.volume);
applyTheme(state.settings.theme);
store.requestPersist();

function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
installUnlockListeners();

function onResume() {
  const r = store.reconcile();
  if (r.used) toast(`🧊 Streak freeze used for ${r.used} missed day${r.used > 1 ? 's' : ''}. Your streak is safe!`);
  else if (r.broken && state.lastBrokenNotice !== dayKey()) {
    state.lastBrokenNotice = dayKey();
    store.save();
    toast('Your streak reset. Start a new one today! 🔥');
  }
}
onResume();
let lastDay = dayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && dayKey() !== lastDay) {
    lastDay = dayKey();
    onResume();
    if (!inLesson) render();
  }
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ------------------------------------------------------------ helpers
function toast(msg, ms = 3200) {
  const t = el('div', { class: 'toast' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

function sheet(content, { onClose } = {}) {
  const backdrop = el('div', { class: 'sheet-backdrop' });
  const panel = el('div', { class: 'sheet' }, el('div', { class: 'sheet-grip' }), content);
  const close = () => {
    backdrop.classList.remove('show');
    panel.classList.remove('show');
    setTimeout(() => {
      backdrop.remove();
      panel.remove();
    }, 250);
    onClose?.();
  };
  backdrop.addEventListener('click', close);
  document.body.append(backdrop, panel);
  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    panel.classList.add('show');
  });
  return close;
}

const FLAME = (on) => el('span', { class: `flame ${on ? 'on' : ''}`, html: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3-1-3 0-6 1-9.5z"/></svg>' });

function unitUnlocked(u) {
  if (!u.requires) return true;
  const req = UNITS.find((x) => x.id === u.requires);
  return req.lessons.every((l) => store.isLessonDone(l.id));
}

function lessonUnlocked(unit, idx) {
  if (!unitUnlocked(unit)) return false;
  return idx === 0 || store.isLessonDone(unit.lessons[idx - 1].id);
}


// ------------------------------------------------------------ top bar & tabs
function topBar() {
  const streak = store.currentStreak();
  const met = store.goalMetToday();
  const goal = state.settings.dailyGoal;
  const pct = Math.min(1, store.todayXp() / goal);
  const ring = el('div', { class: 'goal-ring', style: { '--p': pct }, title: 'Daily goal' }, el('span', {}, met ? '✓' : `${store.todayXp()}`));
  const xpNum = el('b', {}, shown.xp);
  const xpChip = el('div', { class: 'chip xp' }, '⚡', xpNum, el('small', {}, 'XP'));
  const streakChip = el('button', { class: `chip streak ${met ? 'met' : ''}`, onclick: () => go('stats') }, FLAME(met), el('b', {}, streak));
  if (state.xp !== shown.xp) {
    const from = shown.xp;
    setTimeout(() => {
      countUp(xpNum, state.xp, { from, ms: 700 });
      pulse(xpChip, 'bump');
    }, 250);
  }
  if (streak !== shown.streak && shown.streak !== null) setTimeout(() => pulse(streakChip, 'bump'), 250);
  shown.xp = state.xp;
  shown.streak = streak;
  return el('header', { class: 'topbar' },
    streakChip,
    el('div', { class: 'chip freeze', title: 'Streak freezes' }, '🧊', el('b', {}, state.freezes)),
    xpChip,
    el('button', { class: 'chip goal', onclick: () => go('stats') }, ring, el('small', {}, `/${goal}`)),
  );
}
const shown = { xp: state.xp, streak: null };

function tabBar() {
  const tabs = [
    ['learn', 'Learn', '🏠'],
    ['practice', 'Practice', '🎯'],
    ['stats', 'Progress', '📈'],
    ['settings', 'Settings', '⚙️'],
  ];
  return el('nav', { class: 'tabbar' }, tabs.map(([id, label, icon]) =>
    el('button', { class: `tab ${tab === id ? 'active' : ''}`, onclick: () => go(id) }, el('span', { class: 'tab-icon' }, icon), el('span', {}, label))));
}

function go(t) {
  tab = t;
  render();
  window.scrollTo(0, 0);
}

function render() {
  clearFx();
  cleanupScreen?.();
  cleanupScreen = null;
  app.className = 'screen-main';
  app.replaceChildren();
  const main = el('main', { class: 'content' });
  ({ learn: renderLearn, practice: renderPractice, stats: renderStats, settings: renderSettings })[tab](main);
  app.append(topBar(), main, tabBar());
}

// ------------------------------------------------------------ learn path
function renderLearn(main) {
  maybeInstallHint(main);
  const due = dueKeys().length;
  main.append(heroRhino(due), reviewCard(due));
  const dueMap = dueByLesson();
  let currentFound = false;
  for (const unit of UNITS) {
    const open = unitUnlocked(unit) && !unit.soon;
    const section = el('section', { class: `unit c-${unit.color} ${open ? '' : 'locked'}` });
    section.append(el('div', { class: 'unit-head' },
      el('div', {}, el('h3', {}, unit.title), el('p', {}, unit.soon ? `Coming soon · ${unit.desc}` : open ? unit.desc : `Finish ${UNITS.find((x) => x.id === unit.requires).title} to unlock`)),
      unit.soon ? el('span', { class: 'unit-lock' }, '🔒') : null));
    if (unit.lessons.length) {
      const path = el('div', { class: 'path' });
      unit.lessons.forEach((lesson, i) => {
        const done = store.isLessonDone(lesson.id);
        const unlocked = lessonUnlocked(unit, i);
        const current = unlocked && !done && !currentFound;
        if (current) currentFound = true;
        const offset = [0, 1, 1.4, 1, 0, -1, -1.4, -1][i % 8];
        const fading = done && dueMap[lesson.id] > 0;
        const node = el('button', {
          class: `node ${done ? 'done' : ''} ${fading ? 'faded' : ''} ${unlocked ? '' : 'locked'} ${current ? 'current' : ''}`,
          style: { '--x': offset },
          onclick: () => lessonSheet(unit, lesson, unlocked, done, dueMap[lesson.id] || 0),
        }, el('span', { class: 'node-icon' }, done ? (fading ? '↻' : '✓') : unlocked ? lesson.icon : '🔒'),
          fading ? el('span', { class: 'node-badge' }, dueMap[lesson.id]) : null,
          done ? el('span', { class: `node-crowns c${store.crownsOf(lesson.id)}` }, '👑', store.crownsOf(lesson.id)) : null);
        if (done && store.crownsOf(lesson.id) >= 5) node.classList.add('legendary');
        const wrap = el('div', { class: 'node-wrap', style: { '--x': offset, '--i': i } }, current ? el('div', { class: 'start-bubble' }, 'START') : null, node, el('div', { class: 'node-label' }, lesson.title));
        path.append(wrap);
      });
      section.append(path);
    }
    main.append(section);
  }
}

function reviewCard(due) {
  const mem = store.memorySummary();
  if (!mem.learned) return el('div');
  if (!due) {
    return el('div', { class: 'review-card done' }, el('span', { class: 'rc-icon' }, '✓'),
      el('div', {}, el('b', {}, 'All caught up'), el('p', {}, mem.dueTomorrow ? `${mem.dueTomorrow} item${mem.dueTomorrow > 1 ? 's' : ''} to review tomorrow` : 'Nothing due. Your memory is fresh!')));
  }
  return el('button', { class: 'review-card', onclick: startReview },
    el('span', { class: 'rc-icon' }, '🔁'),
    el('div', {}, el('b', {}, 'Daily review'), el('p', {}, `${due} item${due > 1 ? 's' : ''} ready to refresh · ${Math.min(due, 10)} question${due > 1 ? "s" : ""}`)),
    el('span', { class: 'rc-xp' }, '+10 XP'));
}

function heroRhino(due = 0) {
  const streak = store.currentStreak();
  const left = state.settings.dailyGoal - store.todayXp();
  const met = store.goalMetToday();
  const riff = createRhino({ size: 104, mood: met ? 'happy' : 'idle', cls: 'hero-rhino' });
  const line = () => {
    if (met) return pick([`Goal done! ${streak} day${streak === 1 ? '' : 's'} 🔥`, 'Daily goal smashed! 🎉', 'Bonus practice? I\'m in!']);
    if (due >= 5) return `${due} things are fading from memory. A quick review will lock them in!`;
    if (streak > 0) return `Keep your ${streak}-day streak alive! ${left} XP to go.`;
    return `Hi, I'm Riff! Let's start a streak: ${left} XP today.`;
  };
  riff.say(line());
  let taps = 0;
  riff.el.addEventListener('click', () => {
    unlock();
    taps++;
    riff.react(taps % 3 === 0 ? 'spin' : 'jump').say(taps % 2 ? pick(GREETINGS) : line());
    const base = 60 + [0, 2, 4, 7, 9][taps % 5];
    playSequence([{ midi: base, at: 0, dur: 0.2 }, { midi: base + 7, at: 0.1, dur: 0.3 }, { midi: base + 12, at: 0.2, dur: 0.4 }]);
    burst(riff.el.querySelector('.rhino-fig'), { count: 10, speed: 4, shape: 'circle' });
  });
  return el('div', { class: 'hero' }, riff.el);
}

function lessonSheet(unit, lesson, unlocked, done, dueCount = 0) {
  const info = state.lessons[lesson.id];
  const body = el('div', { class: `lesson-sheet c-${unit.color}` },
    el('div', { class: 'ls-unit' }, unit.title),
    el('h3', {}, `${lesson.icon} ${lesson.title}`),
    unlocked
      ? el('p', {}, done ? `Completed ${info.done}× · best ${Math.round(info.best * 100)}%` : `${lesson.count} exercises · +${10} XP`)
      : el('p', {}, 'Finish the previous lesson to unlock this one.'),
  );
  if (unlocked) {
    const crowns = store.crownsOf(lesson.id);
    body.append(el('div', { class: 'level-pips' },
      ...Array.from({ length: 5 }, (_, i) => el('span', { class: `pip ${i < crowns ? 'on' : ''} ${i === crowns ? 'next' : ''}` }, i < crowns ? '👑' : String(i + 1))),
      el('span', { class: 'pip-label' }, crowns >= 5 ? 'Mastered' : `Level ${crowns + 1} of 5`)));
  }
  if (done) {
    const strength = lessonStrength(lesson.id);
    body.append(el('div', { class: 'strength' },
      el('div', { class: 'strength-label' }, el('span', {}, 'Memory'), el('span', {}, dueCount ? `${dueCount} to refresh` : 'Fresh ✓')),
      el('div', { class: 'strength-bar' }, el('div', { class: 'strength-fill', style: { width: `${Math.round(strength * 100)}%` } }))));
  }
  let close;
  if (unlocked && done && dueCount) {
    body.append(el('button', { class: 'btn primary', onclick: () => { close(); startRefresh(lesson); } }, 'Refresh it (+10 XP)'));
    body.append(el('button', { class: 'btn ghost', onclick: () => { close(); startLesson(lesson); } }, 'Play the full lesson'));
  } else if (unlocked) {
    const crowns = store.crownsOf(lesson.id);
    body.append(el('button', { class: 'btn primary', onclick: () => { close(); startLesson(lesson); } }, !done ? 'Start lesson' : crowns >= 5 ? 'Practice (max level)' : `Start level ${crowns + 1} (+${xpFor(0, crowns + 1)} XP)`));
    if (done) body.append(el('button', { class: 'btn ghost', onclick: () => { close(); startLesson(lesson, { forceIntro: true }); } }, 'Review the intro'));
  }
  close = sheet(body);
}

function maybeInstallHint(main) {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone || state.settings.hideInstall) return;
  const b = el('div', { class: 'banner install' },
    el('div', {}, el('b', {}, 'Install the app'),
      el('div', {}, ios ? 'Tap Share, then "Add to Home Screen". Safari may delete progress from sites you don\'t install, so this keeps your streak safe.' : 'Use your browser menu: "Add to Home screen" or "Install app". It works offline too.')),
    el('button', { class: 'x', 'aria-label': 'Dismiss', onclick: () => { store.setSetting('hideInstall', true); b.remove(); } }, '×'));
  main.append(b);
}

// ------------------------------------------------------------ lesson engine
let inLesson = false;

function pickSpec(entries, lastItem, k = 3, d = 1) {
  // Best-of-k: generate a few candidates and favor weak / new / due items.
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < k; i++) {
    const spec = fromEntry(pick(entries), d);
    let score = store.itemWeight(spec.item) * (0.6 + Math.random() * 0.8);
    if (spec.item === lastItem) score *= 0.1;
    if (score > bestScore) {
      best = spec;
      bestScore = score;
    }
  }
  return best;
}

/** Questions made one at a time, at whatever difficulty the session is at by then. */
function lazyQueue(entries, count) {
  return Array.from({ length: count }, () => ({ make: (d, last) => pickSpec(entries, last, 3, d) }));
}

/** XP for a session at a level: higher levels pay a little more. */
const xpFor = (accuracy, level = 1) => 10 + (level - 1) * 2 + (accuracy === 1 ? 5 : 0);

function startLesson(lesson, { forceIntro = false } = {}) {
  const intro = !store.isLessonDone(lesson.id) || forceIntro ? lesson.intro : [];
  const level = store.nextLevel(lesson.id);
  runSession({
    title: lesson.title,
    intro,
    level,
    queue: lessonQueue(lesson),
    onFinish: (stats) => {
      const r = store.lessonDone(lesson.id, stats.accuracy);
      return { xp: xpFor(stats.accuracy, level), level: { ...r, played: level } };
    },
  });
}

/** A lesson's questions with a few older items mixed in (after the first two). */
function lessonQueue(lesson) {
  const mixed = mixInSpecs(lesson, lesson.count >= 10 ? 3 : 2);
  const queue = lazyQueue(entriesOf(lesson), lesson.count - mixed.length);
  for (const s of mixed) queue.splice(2 + Math.floor(Math.random() * (queue.length - 1)), 0, s);
  return queue;
}

function startPractice(entries, title = 'Practice') {
  const levels = [...new Set(entries.map((e) => e.l))].map((l) => store.crownsOf(l));
  const level = Math.max(1, Math.min(5, Math.round(levels.reduce((a, b) => a + b, 0) / Math.max(levels.length, 1))));
  runSession({ title, intro: [], level, queue: lazyQueue(entries, 10), onFinish: (s) => xpFor(s.accuracy, level) });
}

/** Two-choice drill on a pair the learner keeps mixing up. */
function startDrill(conf) {
  const level = Math.max(1, store.crownsOf(conf.l));
  const targets = shuffleArr([conf.a, conf.b, conf.a, conf.b, conf.a, conf.b, conf.a, conf.b]);
  const srcs = conf.srcs || [{ l: conf.l, g: conf.g }];
  const queue = targets.map((t) => ({ make: (d) => {
    const c = { ...conf, ...srcs[Math.floor(Math.random() * srcs.length)] };
    return drillSpec(c, t, d) || drillSpec(c, t === c.a ? c.b : c.a, d) || fromEntry(entriesOf(lessonById(c.l))[c.g], d);
  } }));
  runSession({ title: 'Mix-up drill', intro: [], level, queue, onFinish: (s) => xpFor(s.accuracy, level) });
}
const shuffleArr = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

function startReview() {
  const specs = reviewSpecs(10);
  if (!specs.length) return toast('Nothing to review right now. Nice! ✓');
  runSession({ title: 'Daily review', intro: [], queue: specs, onFinish: (s) => 10 + (s.accuracy === 1 ? 5 : 0) });
}

function startRefresh(lesson) {
  runSession({ title: lesson.title, intro: [], queue: refreshSpecs(lesson), onFinish: (s) => 10 + (s.accuracy === 1 ? 5 : 0) });
}

function runSession({ title, intro, queue, onFinish, level = 1 }) {
  inLesson = true;
  cleanupScreen?.();
  history.pushState({ lesson: true }, '');
  app.className = 'screen-lesson';
  app.replaceChildren();

  const total = queue.length;
  const items = [...intro.map((s) => ({ spec: s, learn: true })), ...queue.map((q) => (q.make ? { make: q.make } : { spec: q }))];
  // Adaptive difficulty: 3 right in a row nudges it up, 2 misses in a row eases off (one step either way).
  let adapt = 0;
  let runRight = 0;
  let runWrong = 0;
  let lastItem = null;
  const curD = () => Math.max(1, Math.min(5, level + adapt));
  let correct = 0;
  let firstTry = 0;
  let attempts = 0;
  let combo = 0;
  const failedOnce = new Set();
  const started = Date.now();
  let cleanups = [];

  const bar = el('div', { class: 'progress' }, el('div', { class: 'progress-fill' }));
  const quit = el('button', { class: 'quit', 'aria-label': 'Quit lesson', onclick: confirmQuit }, '✕');
  const comboEl = el('div', { class: 'combo' });
  const lvEl = el('div', { class: 'lv-chip', title: 'Difficulty' }, `Lv ${curD()}`);
  const top = el('header', { class: 'lesson-top' }, quit, bar, lvEl, comboEl);
  const setLevelChip = (note) => {
    lvEl.textContent = `Lv ${curD()}`;
    lvEl.dataset.adapt = adapt;
    if (note) {
      pulse(lvEl, 'bump');
      comboEl.textContent = note;
      comboEl.classList.add('show');
      pulse(comboEl, 'pop');
    }
  };
  const body = el('div', { class: 'ex-body' });
  const footer = el('footer', { class: 'lesson-foot' });
  app.append(top, body, footer);

  const setProgress = () => {
    bar.firstChild.style.width = `${(correct / total) * 100}%`;
  };

  function confirmQuit() {
    let close;
    close = sheet(el('div', { class: 'quit-sheet' },
      el('h3', {}, 'Quit this lesson?'),
      el('p', {}, 'You\'ll lose your progress in this lesson.'),
      el('button', { class: 'btn primary', onclick: () => close() }, 'Keep learning'),
      el('button', { class: 'btn danger-ghost', onclick: () => { close(); exit(); } }, 'Quit'),
    ));
  }

  function exit() {
    cleanups.forEach((f) => f());
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey);
    inLesson = false;
    render();
  }

  const onPop = () => {
    if (!inLesson) return;
    history.pushState({ lesson: true }, '');
    confirmQuit();
  };
  window.addEventListener('popstate', onPop);

  let mainAction = null;
  const onKey = (e) => {
    if (e.key === 'Enter' && mainAction) {
      e.preventDefault();
      mainAction();
    }
  };
  document.addEventListener('keydown', onKey);

  function next() {
    cleanups.forEach((f) => f());
    cleanups = [];
    if (!items.length) return finish();
    const item = items.shift();
    const learn = item.learn;
    const spec = item.spec || item.make(curD(), lastItem);
    lastItem = spec.item;
    body.replaceChildren();
    body.className = `ex-body ex-${spec.type}`;
    footer.replaceChildren();
    footer.className = 'lesson-foot';
    mainAction = null;
    let answered = false;

    const btn = el('button', { class: 'btn primary', disabled: true }, 'Check');
    const selfSubmit = ['findKey', 'tapRhythm', 'buildSeq'].includes(spec.type);
    if (spec.type === 'tapRhythm') {
      footer.append(el('button', { class: 'btn ghost skip', onclick: () => { if (!answered) { answered = true; correct++; setProgress(); next(); } } }, 'Can\'t tap now? Skip'));
    } else if (!selfSubmit || learn) footer.append(btn);

    const ctx = {
      body,
      onCleanup: (f) => cleanups.push(f),
      setContinue() {
        btn.disabled = false;
        btn.textContent = 'Continue';
        mainAction = () => next();
        btn.onclick = mainAction;
      },
      setCheck(fn) {
        if (answered) return;
        btn.disabled = !fn;
        mainAction = fn;
        btn.onclick = fn;
      },
      submit(ok, info = {}) {
        if (answered) return;
        answered = true;
        attempts++;
        body.classList.add('answered');
        store.recordItem(spec.item, ok, spec.src);
        // Mix-ups: remember what got confused with what; drills ease them off.
        if (!ok && info.confused && spec.src) {
          const n = store.recordConfusion(spec.src, info.confused.right, info.confused.wrong);
          if (n >= 2 && !spec.drillPair) info.confusionNote = `You've mixed up ${info.confused.right} and ${info.confused.wrong} ${n} times. Practice → Mix-ups has a drill for that.`;
        }
        if (ok && spec.drillPair) store.easeConfusion(spec.src, spec.drillPair[0], spec.drillPair[1]);
        store.save();
        let levelNote = null;
        if (ok) {
          runRight++;
          runWrong = 0;
          if (runRight >= 3 && adapt < 1 && level + adapt < 5) { adapt++; runRight = 0; levelNote = '⚡ Turning it up!'; }
        } else {
          runWrong++;
          runRight = 0;
          if (runWrong >= 2 && adapt > -1 && level + adapt > 1) { adapt--; runWrong = 0; levelNote = '🫶 Easing off a little'; }
        }
        if (ok) {
          correct++;
          combo++;
          if (!failedOnce.has(spec)) firstTry++;
          sfx('correct');
        } else {
          combo = 0;
          failedOnce.add(spec);
          items.push({ spec }); // come back to it later
          sfx('wrong');
          navigator.vibrate?.(60);
          pulse(body, 'shake');
        }
        setProgress();
        if (ok) {
          pulse(bar, 'glow');
          setTimeout(() => {
            const r = bar.firstChild.getBoundingClientRect();
            burst({ x: r.right - 6, y: r.top + r.height / 2 }, { count: 10, speed: 3.5, colors: ['#ff6fb5', '#4cc3ff', '#ffffff'] });
          }, 250);
        }
        comboEl.textContent = combo >= 3 ? `🔥 ${combo} in a row!` : '';
        comboEl.classList.toggle('show', combo >= 3);
        if (combo >= 3) pulse(comboEl, 'pop');
        if (levelNote) setLevelChip(levelNote);
        showFeedback(ok, info);
      },
    };

    function showFeedback(ok, info) {
      footer.replaceChildren();
      footer.className = `lesson-foot feedback ${ok ? 'good' : 'bad'}`;
      const head = ok ? (combo >= 5 ? `${combo} in a row! 🔥` : pick(CHEERS)) : pick(COMFORT);
      const lines = [el('div', { class: 'fb-head' }, head)];
      if (!ok && info.headline) lines.push(el('div', { class: 'fb-answer' }, info.headline));
      else if (!ok && info.answer) lines.push(el('div', { class: 'fb-answer' }, el('span', {}, 'Correct answer: '), el('b', {}, info.answer)));
      else if (ok && info.answer && spec.type === 'tapRhythm') lines.push(el('div', { class: 'fb-answer' }, info.answer));
      if (!ok && info.mistake) lines.push(el('div', { class: 'fb-mistake' }, info.mistake));
      if (info.explain) lines.push(el('div', { class: 'fb-explain' }, info.explain));
      if (!ok && info.compare) {
        const ear = (label, fn) => {
          const b = el('button', { class: 'cmp-btn' }, '🔈 ', label);
          b.onclick = () => { unlock(); pulse(b, 'bump'); fn(); };
          return b;
        };
        lines.push(el('div', { class: 'cmp-row' }, ear('Yours', info.compare.yours), ear('Correct', info.compare.right)));
      }
      if (info.confusionNote) lines.push(el('div', { class: 'fb-confusion' }, '🔀 ', info.confusionNote));
      const cont = el('button', { class: `btn ${ok ? 'good' : 'danger'}` }, 'Continue');
      mainAction = () => next();
      cont.onclick = mainAction;
      const riff = createRhino({ size: 64, mood: ok ? 'happy' : 'sad', cls: 'fb-rhino' });
      setTimeout(() => riff.react(ok ? 'jump' : 'droop'), 60);
      footer.append(el('div', { class: 'fb-row' }, riff.el, el('div', { class: 'fb-text' }, lines)), cont);
    }

    if (learn) {
      EXERCISES.learn(spec, ctx);
    } else {
      EXERCISES[spec.type](spec, ctx);
      if (spec.mixedFrom) body.prepend(el('div', { class: 'mixed-chip' }, '🔁 Review · ', spec.mixedFrom.title));
    }
  }

  function finish() {
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey);
    const accuracy = total ? firstTry / total : 1;
    const out = onFinish({ accuracy });
    const xp = typeof out === 'number' ? out : out.xp;
    const res = store.addXp(xp);
    inLesson = false;
    showResults({ xp, accuracy, seconds: Math.round((Date.now() - started) / 1000), res, review: title === 'Daily review', level: out.level });
  }

  setProgress();
  next();
}

function showResults({ xp, accuracy, seconds, res, review = false, level = null }) {
  app.className = 'screen-result';
  app.replaceChildren();
  sfx('complete');
  const perfect = accuracy === 1;
  const mins = Math.floor(seconds / 60);
  const time = `${mins}:${String(seconds % 60).padStart(2, '0')}`;
  const stat = (label, icon, valueNode, cls, i) => el('div', { class: `stat-card ${cls}`, style: { '--i': i } }, el('div', { class: 'sc-label' }, label), el('div', { class: 'sc-value' }, icon, ' ', valueNode));
  const xpN = el('span', {}, '0');
  const accN = el('span', {}, '0%');
  const riff = createRhino({ size: 170, mood: 'cheer', cls: 'result-rhino' });
  const page = el('div', { class: 'result' },
    riff.el,
    el('h1', {}, review ? (perfect ? 'Perfect review!' : 'Review complete!') : perfect ? 'Perfect lesson!' : 'Lesson complete!'),
    el('p', { class: 'result-sub' }, perfect ? 'Not a single mistake. Riff is impressed.' : pick(['Every lesson makes you better.', 'Your musical brain is growing!', 'That\'s how musicians are made.'])),
    el('div', { class: 'stat-row' },
      stat('Total XP', '⚡', xpN, 'gold', 0),
      stat(perfect ? 'Perfect' : 'Accuracy', '🎯', accN, 'pink', 1),
      stat('Time', '⏱', el('span', {}, time), 'blue', 2)),
  );
  if (level) {
    const crowns = '👑'.repeat(level.crowns) + '♢'.repeat(5 - level.crowns);
    if (level.leveledUp) {
      page.append(el('div', { class: 'level-banner up' },
        el('div', { class: 'lb-crowns' }, crowns),
        el('b', {}, level.crowns === 5 ? 'Lesson mastered!' : `Level ${level.crowns} complete!`),
        el('span', {}, level.firstPass ? 'Next lesson unlocked. Replay this one for harder levels.' : level.crowns === 5 ? 'Every level beaten. Legendary!' : `Level ${level.crowns + 1} is harder. Ready when you are.`)));
      setTimeout(() => { sfx('streak'); confetti(140); }, 1100);
    } else if (!level.passed) {
      page.append(el('div', { class: 'level-banner retry' },
        el('b', {}, `Get ${Math.round(level.mark * 100)}% right first try to ${level.crowns === 0 ? 'unlock the next lesson' : `pass level ${level.played}`}`),
        el('span', {}, `You got ${Math.round(accuracy * 100)}%. So close. Have another go!`)));
    }
  }
  setTimeout(() => confetti(perfect ? 180 : 110), 150);
  setTimeout(() => {
    countUp(xpN, xp, { ms: 800 });
    countUp(accN, Math.round(accuracy * 100), { ms: 900, suffix: '%' });
  }, 600);
  const cont = el('button', { class: 'btn primary' }, 'Continue');
  cont.onclick = () => (res.goalJustMet ? showStreak(res) : render());
  app.append(page, el('footer', { class: 'result-foot' }, cont));
}

function showStreak(res) {
  app.className = 'screen-result';
  app.replaceChildren();
  sfx('streak');
  const num = el('div', { class: 'streak-num' }, String(res.before));
  const riff = createRhino({ size: 96, mood: 'cheer', cls: 'streak-rhino' });
  const page = el('div', { class: 'result streak-screen' },
    el('div', { class: 'flame-stage' }, el('div', { class: 'big-flame' }, FLAME(true)), riff.el),
    num,
    el('h1', {}, 'day streak!'),
    el('p', {}, res.after === 1 ? 'Day one. Come back tomorrow to keep it going.' : 'Daily goal reached. See you tomorrow!'),
    res.freezeEarned ? el('div', { class: 'banner freeze-earned' }, '🧊 You earned a streak freeze! It protects your streak if you miss a day.') : null,
    weekStrip(),
  );
  setTimeout(() => {
    num.textContent = String(res.after);
    num.classList.add('bump');
    burst(num, { count: 24, speed: 7, colors: ['#ff9a3c', '#ffc94d', '#ff6fb5'] });
    confetti(90);
  }, 700);
  const cont = el('button', { class: 'btn primary' }, 'Continue');
  cont.onclick = () => render();
  app.append(page, el('footer', { class: 'result-foot' }, cont));
}

function weekStrip() {
  const today = dayKey();
  const days = [];
  for (let i = -6; i <= 0; i++) {
    const k = addDays(today, i);
    const d = state.days[k];
    days.push(el('div', { class: `wday ${d?.met ? 'met' : d?.frozen ? 'frozen' : ''} ${i === 0 ? 'today' : ''}` },
      el('span', {}, parseDay(k).toLocaleDateString(undefined, { weekday: 'narrow' })),
      el('i', {}, d?.met ? '✓' : d?.frozen ? '🧊' : '')));
  }
  return el('div', { class: 'week-strip' }, days);
}

// ------------------------------------------------------------ practice
/** Launch an arcade game full screen. Games never touch XP or the streak. */
function openGame(game) {
  cleanupScreen?.();
  cleanupScreen = null;
  inLesson = true; // keeps the day-change refresh from redrawing over the game
  history.pushState({ game: true }, '');
  app.className = 'screen-game';
  app.replaceChildren();
  let stop = null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', close);
    try { stop?.(); } catch {}
    inLesson = false;
    tab = 'practice';
    render();
    window.scrollTo(0, 0);
  };
  window.addEventListener('popstate', close);
  stop = game.module.start(app, { onExit: close });
}

function renderPractice(main) {
  const done = ALL_LESSONS.filter((l) => store.isLessonDone(l.id));
  main.append(el('h2', { class: 'page-title' }, 'Practice'));
  if (!done.length) {
    const riff = createRhino({ size: 120, mood: 'think' });
    riff.say('Finish a lesson first!');
    main.append(el('div', { class: 'empty' }, riff.el, el('p', {}, 'Practice unlocks after your first lesson. It focuses on the things you find hardest.')), arcadeSection(openGame));
    return;
  }
  const card = (title, desc, icon, lessons, color) =>
    el('button', { class: `practice-card c-${color}`, onclick: () => startPractice(lessons.flatMap((l) => l.entries || entriesOf(l)), title) },
      el('span', { class: 'pc-icon' }, icon), el('div', {}, el('b', {}, title), el('p', {}, desc)), el('span', { class: 'pc-xp' }, '+10 XP'));
  const due = dueKeys().length;
  if (due) {
    main.append(el('button', { class: 'practice-card c-pink', onclick: startReview },
      el('span', { class: 'pc-icon' }, '🔁'), el('div', {}, el('b', {}, 'Daily review'), el('p', {}, `${due} item${due > 1 ? 's' : ''} due. Lock them into memory.`)), el('span', { class: 'pc-xp' }, '+10 XP')));
  }
  const mixups = store.topConfusions(3);
  if (mixups.length) {
    main.append(el('h3', { class: 'section-title' }, 'Mix-ups'), el('p', { class: 'muted small mixup-hint' }, 'Pairs you keep confusing. Each drill uses only those two answers.'));
    for (const c of mixups) {
      const lesson = lessonById(c.l);
      if (!lesson) continue;
      main.append(el('button', { class: 'practice-card mixup c-purple', onclick: () => startDrill(c) },
        el('span', { class: 'pc-icon' }, '🔀'),
        el('div', {}, el('b', {}, c.a, ' vs ', c.b), el('p', {}, `Mixed up ${Math.round(c.count)}× · ${lesson.title}`)),
        el('span', { class: 'pc-xp' }, '8 Qs')));
    }
    main.append(el('h3', { class: 'section-title' }, 'More practice'));
  }
  main.append(card('Weak spots', 'A mix of everything you\'ve learned, focused on what you miss most.', '💪', done, 'purple'));
  for (const u of UNITS) {
    const ls = done.filter((l) => l.unit.id === u.id);
    if (ls.length) main.append(card(u.title, `${ls.length} lesson${ls.length > 1 ? 's' : ''} learned`, u.lessons[0].icon, ls, u.color));
  }
  // Ear workout: only the listening exercises from finished lessons.
  const earEntries = done.flatMap(entriesOf).filter((e) => e.g().ear);
  if (earEntries.length) main.append(card('Ear workout', 'Listening exercises only. Headphones on!', '🎧', [{ entries: earEntries }], 'teal'));
  main.append(arcadeSection(openGame));
}

// ------------------------------------------------------------ stats
function renderStats(main) {
  const s = store.currentStreak();
  main.append(el('h2', { class: 'page-title' }, 'Your progress'));
  const tile = (icon, value, label) => el('div', { class: 'tile' }, el('div', { class: 'tile-icon' }, icon), el('div', {}, el('b', {}, value), el('span', {}, label)));
  const done = ALL_LESSONS.filter((l) => store.isLessonDone(l.id)).length;
  main.append(el('div', { class: 'tiles' },
    tile('🔥', s, 'Day streak'),
    tile('🏅', state.longestStreak, 'Longest streak'),
    tile('⚡', state.xp, 'Total XP'),
    tile('📚', `${done}/${ALL_LESSONS.length}`, 'Lessons done'),
    tile('🧊', state.freezes, 'Streak freezes'),
    tile('🎯', `${state.settings.dailyGoal} XP`, 'Daily goal'),
  ));
  const mem = store.memorySummary();
  main.append(el('h3', { class: 'section-title' }, 'Memory'), el('div', { class: 'tiles' },
    tile('🧠', mem.learned, 'Items learned'),
    tile('💎', mem.mastered, 'Mastered (3+ weeks)'),
    tile('🔁', mem.due, 'Due for review'),
    tile('📅', mem.dueTomorrow, 'Due tomorrow'),
  ));
  main.append(el('h3', { class: 'section-title' }, 'This week'), weekStrip());
  main.append(el('h3', { class: 'section-title' }, 'Last 18 weeks'), heatmap(18));
  main.append(el('p', { class: 'muted small' }, 'Streak freezes: you earn one every 7 days of streak (max 2). If you miss a day, one is used automatically.'));
}

function heatmap(weeks) {
  const today = dayKey();
  const dow = (parseDay(today).getDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -(weeks - 1) * 7 - dow);
  const grid = el('div', { class: 'heatmap', style: { '--weeks': weeks } });
  const goal = state.settings.dailyGoal;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const k = addDays(start, w * 7 + d);
      const info = state.days[k];
      let lvl = 0;
      if (info?.xp) lvl = info.xp >= goal * 2 ? 3 : info.xp >= goal ? 2 : 1;
      const cell = el('div', { class: `hm l${lvl} ${info?.frozen && !info?.met ? 'frozen' : ''} ${k > today ? 'future' : ''}`, title: `${k}: ${info?.xp || 0} XP` });
      cell.style.gridColumn = w + 1;
      cell.style.gridRow = d + 1;
      grid.append(cell);
    }
  }
  return grid;
}

// ------------------------------------------------------------ settings
function renderSettings(main) {
  main.append(el('h2', { class: 'page-title' }, 'Settings'));

  const goals = [[10, 'Casual', '1 lesson'], [20, 'Regular', '2 lessons'], [30, 'Serious', '3 lessons'], [50, 'Intense', '5 lessons']];
  const goalBox = el('div', { class: 'goal-options' }, goals.map(([v, name, desc]) =>
    el('button', { class: `goal-opt ${state.settings.dailyGoal === v ? 'selected' : ''}`, onclick: () => { store.setSetting('dailyGoal', v); render(); } },
      el('b', {}, name), el('span', {}, `${v} XP/day · ${desc}`))));
  main.append(group('Daily goal', goalBox));

  const themes = [['system', 'Auto', '🌗'], ['light', 'Light', '☀️'], ['dark', 'Dark', '🌙']];
  const cur = state.settings.theme || 'system';
  main.append(group('Appearance', el('div', { class: 'theme-options' }, themes.map(([v, label, icon]) =>
    el('button', { class: `goal-opt theme-opt ${cur === v ? 'selected' : ''}`, onclick: () => { store.setSetting('theme', v); applyTheme(v); render(); } },
      el('span', { class: 'theme-icon' }, icon), el('b', {}, label))))));

  const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: state.settings.volume });
  vol.addEventListener('input', () => {
    setVolume(+vol.value);
    store.setSetting('volume', +vol.value);
  });
  vol.addEventListener('change', () => sfx('correct'));
  const statusEl = el('p', { class: 'muted small audio-status' });
  const showStatus = () => {
    const a = audioStatus();
    const parts = [`Audio engine: ${a.state}`];
    if (a.rate) parts.push(`${Math.round(a.rate / 1000)} kHz`);
    parts.push(`session: ${a.session}`);
    if (a.rebuilds) parts.push(`restarts: ${a.rebuilds}`);
    if (a.lastError) parts.push(a.lastError);
    statusEl.textContent = parts.join(' · ');
  };
  showStatus();
  const statusTimer = setInterval(showStatus, 1000);
  cleanupScreen = () => clearInterval(statusTimer);
  const testBtn = el('button', { class: 'btn secondary' }, 'Test sound');
  testBtn.onclick = () => {
    repairAudio();
    setTimeout(() => sfx('complete'), 120);
    setTimeout(showStatus, 400);
  };
  main.append(group('Sound', vol, testBtn, statusEl));

  const latencyVal = el('b', {}, `${state.settings.latencyMs} ms`);
  main.append(group('Tap timing',
    el('p', { class: 'muted' }, 'If rhythm exercises say you\'re always late, calibrate. This matters most with Bluetooth headphones.'),
    el('div', { class: 'row' }, el('span', {}, 'Current offset: '), latencyVal),
    el('button', { class: 'btn secondary', onclick: () => runCalibration(latencyVal) }, 'Calibrate'),
  ));

  const backupOut = el('textarea', { class: 'backup', readonly: true, rows: 3, placeholder: 'Tap "Create backup code"' });
  main.append(group('Backup',
    el('p', { class: 'muted' }, 'Progress is saved on this device only. Make a backup code to move it or keep it safe.'),
    el('button', { class: 'btn secondary', onclick: async () => {
      backupOut.value = store.exportData();
      backupOut.select();
      try { await navigator.clipboard.writeText(backupOut.value); toast('Backup code copied'); } catch {}
    } }, 'Create backup code'),
    backupOut,
    el('button', { class: 'btn ghost', onclick: () => {
      const code = prompt('Paste your backup code:');
      if (!code) return;
      try {
        store.importData(code);
        resetIndex();
        setVolume(state.settings.volume);
        toast('Progress restored ✓');
        render();
      } catch {
        toast('That code didn\'t work.');
      }
    } }, 'Restore from code'),
  ));

  main.append(group('Danger zone',
    el('button', { class: 'btn danger-ghost', onclick: () => {
      if (confirm('Erase ALL progress, XP and your streak? This cannot be undone.')) {
        store.resetAll();
        resetIndex();
        render();
      }
    } }, 'Reset all progress')));

  main.append(el('p', { class: 'muted small center' }, 'Riff · v1'));
}

function group(title, ...children) {
  return el('section', { class: 'group' }, el('h3', {}, title), ...children);
}

function runCalibration(valueEl) {
  let ctl = null;
  const dot = el('div', { class: 'cal-dot' });
  const msg = el('p', {}, 'Tap the pad exactly on each click. 12 clicks.');
  const pad = el('button', { class: 'tap-pad armed' }, el('span', {}, 'TAP'));
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pad.classList.remove('hitfx');
    void pad.offsetWidth;
    pad.classList.add('hitfx');
    ctl?.tap(e);
  });
  const startBtn = el('button', { class: 'btn primary' }, 'Start');
  startBtn.onclick = () => {
    startBtn.disabled = true;
    msg.textContent = 'Listen to the first few clicks, then tap along…';
    ctl = calibrate({
      onBeat: () => {
        dot.classList.remove('beat');
        void dot.offsetWidth;
        dot.classList.add('beat');
      },
      onDone: (ms) => {
        startBtn.disabled = false;
        startBtn.textContent = 'Try again';
        if (ms == null) {
          msg.textContent = 'Not enough taps. Try again.';
          return;
        }
        const total = Math.max(-100, Math.min(400, ms));
        store.setSetting('latencyMs', total);
        store.setSetting('calibrated', true);
        valueEl.textContent = `${total} ms`;
        msg.textContent = `Done! Your taps arrive ${total} ms after the click. This will be corrected automatically.`;
      },
    });
  };
  sheet(el('div', { class: 'cal-sheet' }, el('h3', {}, 'Tap calibration'), msg, dot, pad, startBtn), { onClose: () => ctl?.stop() });
}

render();
