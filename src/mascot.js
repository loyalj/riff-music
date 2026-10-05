// Riff the rhino: an animated SVG mascot.
// Moods: idle | happy | sad | cheer | think. One-shot reactions: jump, droop, bop, wave.
import { el } from './util.js';

const SVG = `
<svg viewBox="0 0 200 200" class="rhino-svg" aria-hidden="true">
  <ellipse class="rh-shadow" cx="100" cy="193" rx="52" ry="6"/>
  <g class="rh-root">
    <g class="rh-body">
      <rect class="rh-foot" x="58" y="168" width="30" height="24" rx="12"/>
      <rect class="rh-foot" x="112" y="168" width="30" height="24" rx="12"/>
      <g class="rh-arm rh-arm-l"><rect x="32" y="128" width="24" height="40" rx="12"/></g>
      <g class="rh-arm rh-arm-r"><rect x="144" y="128" width="24" height="40" rx="12"/></g>
      <ellipse class="rh-skin" cx="100" cy="150" rx="56" ry="40"/>
      <ellipse class="rh-belly" cx="100" cy="158" rx="34" ry="25"/>
    </g>
    <g class="rh-head">
      <g class="rh-ear rh-ear-l"><ellipse class="rh-skin" cx="54" cy="44" rx="14" ry="20" transform="rotate(-28 54 44)"/><ellipse class="rh-ear-in" cx="55" cy="46" rx="7" ry="12" transform="rotate(-28 55 46)"/></g>
      <g class="rh-ear rh-ear-r"><ellipse class="rh-skin" cx="146" cy="44" rx="14" ry="20" transform="rotate(28 146 44)"/><ellipse class="rh-ear-in" cx="145" cy="46" rx="7" ry="12" transform="rotate(28 145 46)"/></g>
      <ellipse class="rh-skin" cx="100" cy="88" rx="62" ry="54"/>
      <path class="rh-band" d="M40 86 C 38 20, 162 20, 160 86" fill="none"/>
      <rect class="rh-cup" x="26" y="68" width="24" height="42" rx="11"/>
      <rect class="rh-cup" x="150" y="68" width="24" height="42" rx="11"/>
      <rect class="rh-cup-hi" x="31" y="74" width="6" height="18" rx="3"/>
      <rect class="rh-cup-hi" x="155" y="74" width="6" height="18" rx="3"/>
      <ellipse class="rh-cheek" cx="62" cy="106" rx="10" ry="6"/>
      <ellipse class="rh-cheek" cx="138" cy="106" rx="10" ry="6"/>
      <ellipse class="rh-snout" cx="100" cy="116" rx="40" ry="25"/>
      <path class="rh-horn" d="M84 100 C 88 80, 94 62, 101 50 C 106 64, 113 82, 116 100 Z"/>
      <path class="rh-horn-hi" d="M95 92 C 97 78, 99 68, 101 60"/>
      <ellipse class="rh-nostril" cx="89" cy="114" rx="3.2" ry="4.2"/>
      <ellipse class="rh-nostril" cx="111" cy="114" rx="3.2" ry="4.2"/>
      <path class="rh-mouth m-smile" d="M88 127 Q100 137 112 127"/>
      <path class="rh-mouth-open m-open" d="M86 125 Q100 146 114 125 Z"/>
      <path class="rh-mouth m-frown" d="M89 132 Q100 124 111 132"/>
      <ellipse class="rh-mouth-o m-o" cx="100" cy="130" rx="5" ry="6"/>
      <g class="rh-eyes">
        <g class="rh-eye-n">
          <ellipse class="rh-eye-w" cx="72" cy="80" rx="12" ry="14"/>
          <ellipse class="rh-eye-w" cx="128" cy="80" rx="12" ry="14"/>
          <g class="rh-pupils">
            <circle class="rh-pupil" cx="74" cy="82" r="7"/>
            <circle class="rh-pupil" cx="126" cy="82" r="7"/>
            <circle class="rh-glint" cx="77" cy="78" r="2.6"/>
            <circle class="rh-glint" cx="129" cy="78" r="2.6"/>
          </g>
        </g>
        <path class="rh-eye-happy" d="M61 84 Q72 70 83 84 M117 84 Q128 70 139 84"/>
      </g>
      <path class="rh-brow" d="M60 66 L82 59 M140 66 L118 59"/>
    </g>
  </g>
  <g class="rh-notes">
    <text class="rh-note n1" x="160" y="40">♪</text>
    <text class="rh-note n2" x="24" y="56">♫</text>
  </g>
</svg>`;

/**
 * createRhino({ size, mood, say })
 * returns { el, mood(m), react(kind), say(text|null), bop() }
 */
export function createRhino({ size = 120, mood = 'idle', say = null, cls = '' } = {}) {
  const wrap = el('div', { class: `rhino mood-${mood} ${cls}`, style: { '--size': `${size}px` } });
  const fig = el('div', { class: 'rhino-fig', html: SVG });
  const bubble = el('div', { class: 'rhino-bubble' });
  wrap.append(fig, bubble);
  let reactTimer = null;

  const api = {
    el: wrap,
    mood(m) {
      wrap.className = wrap.className.replace(/mood-\S+/, `mood-${m}`);
      return api;
    },
    /** One-shot animation: jump | droop | bop | wave | spin */
    react(kind) {
      wrap.classList.remove('r-jump', 'r-droop', 'r-bop', 'r-wave', 'r-spin');
      void wrap.offsetWidth;
      wrap.classList.add(`r-${kind}`);
      clearTimeout(reactTimer);
      reactTimer = setTimeout(() => wrap.classList.remove(`r-${kind}`), 900);
      return api;
    },
    bop() {
      fig.classList.remove('bop');
      void fig.offsetWidth;
      fig.classList.add('bop');
      return api;
    },
    say(text) {
      bubble.textContent = text || '';
      wrap.classList.toggle('talking', !!text);
      if (text) {
        bubble.classList.remove('pop');
        void bubble.offsetWidth;
        bubble.classList.add('pop');
      }
      return api;
    },
  };
  if (say) api.say(say);
  // Pupils follow taps around the screen a little: cheap and charming.
  return api;
}

export const CHEERS = ['Nice!', 'You rock! 🤘', 'Great ear!', 'Nailed it!', 'Sweet!', 'On point!', 'Groovy!', 'Yes!'];
export const COMFORT = ['Almost!', 'No worries!', 'Keep going!', 'We\'ll get it!', 'Shake it off!'];
export const GREETINGS = [
  'Ready to jam?',
  'Let\'s make some noise!',
  'A few minutes a day adds up!',
  'Your ears are getting sharper!',
  'Time to practice! 🎵',
];
