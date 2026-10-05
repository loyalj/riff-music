// Touch-friendly on-screen piano.
import { el, isBlack, noteName } from './util.js';
import { playNote, unlock } from './audio.js';
import { floatNote } from './juice.js';

/**
 * opts: { from, to (MIDI, should be white keys), labels: false|'white'|'all'|'c',
 *         onPress(midi), sound: true, disabled: false }
 */
export function createPiano(opts) {
  const { from = 60, to = 76, labels = false, sound = true } = opts;
  const root = el('div', { class: 'piano', role: 'group', 'aria-label': 'Piano keyboard' });
  const whites = [];
  for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
  const ww = 100 / whites.length;
  const keys = new Map();
  let disabled = !!opts.disabled;

  const labelFor = (m) => {
    if (!labels) return '';
    if (labels === 'c') return noteName(m) === 'C' ? 'C' : '';
    if (labels === 'white') return isBlack(m) ? '' : noteName(m);
    return isBlack(m) ? noteName(m, 'both').replace('/', '\n') : noteName(m);
  };

  let wi = 0;
  for (let m = from; m <= to; m++) {
    const black = isBlack(m);
    const key = el('button', {
      class: `key ${black ? 'black' : 'white'}`,
      'aria-label': noteName(m, 'both'),
      'data-midi': m,
    });
    if (black) {
      key.style.left = `calc(${wi * ww}% - ${ww * 0.31}%)`;
      key.style.width = `${ww * 0.62}%`;
    } else {
      key.style.left = `${wi * ww}%`;
      key.style.width = `${ww}%`;
      wi++;
    }
    if (opts.allowed && !opts.allowed.has(m)) key.classList.add('off');
    const lbl = labelFor(m);
    if (lbl) key.append(el('span', { class: 'key-label' }, lbl));
    key.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (disabled || (opts.allowed && !opts.allowed.has(m))) return;
      unlock();
      key.classList.add('pressed');
      if (sound) playNote(m, { dur: 0.9 });
      const r = key.getBoundingClientRect();
      floatNote(r.left + r.width / 2, r.top + r.height * (black ? 0.35 : 0.55));
      opts.onPress?.(m);
    });
    const up = () => key.classList.remove('pressed');
    key.addEventListener('pointerup', up);
    key.addEventListener('pointerleave', up);
    key.addEventListener('pointercancel', up);
    key.addEventListener('contextmenu', (e) => e.preventDefault());
    keys.set(m, key);
  }
  // White keys first in DOM so black keys stack on top.
  [...keys.values()].sort((a, b) => a.classList.contains('black') - b.classList.contains('black')).forEach((k) => root.append(k));

  return {
    el: root,
    keys,
    mark(midi, cls) {
      keys.get(midi)?.classList.add(cls);
    },
    unmark(midi, cls) {
      keys.get(midi)?.classList.remove(cls);
    },
    clear(...classes) {
      const cs = classes.length ? classes : ['hint', 'correct', 'wrong', 'selected', 'flash'];
      for (const k of keys.values()) k.classList.remove(...cs);
    },
    setDisabled(v) {
      disabled = v;
      root.classList.toggle('disabled', v);
    },
    /** Briefly light up a key (e.g. when the app plays it). */
    flash(midi, ms = 400) {
      const k = keys.get(midi);
      if (!k) return;
      k.classList.add('flash');
      setTimeout(() => k.classList.remove('flash'), ms);
    },
  };
}
