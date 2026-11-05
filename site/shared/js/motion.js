// The one place that imports anime.js, plus helpers that respect the
// reduced-motion setting: with it on, durations and staggers become 0.

import { stagger } from '../../vendor/animejs/anime.esm.min.js';

export { animate, stagger, svg, utils } from '../../vendor/animejs/anime.esm.min.js';

const query = window.matchMedia('(prefers-reduced-motion: reduce)');
export const motion = { reduced: query.matches };
query.addEventListener?.('change', (e) => { motion.reduced = e.matches; });

/** Duration helper: animations become instant when reduced motion is on. */
export const ms = (value) => (motion.reduced ? 0 : value);

/** Stagger helper: no delays when reduced motion is on. */
export const stag = (value, options) => (motion.reduced ? 0 : stagger(value, options));

export const wait = (t) => new Promise((resolve) => setTimeout(resolve, ms(t)));

/** Removes inline styles that animations leave behind, handing control back to CSS. */
export function clearInline(targets, ...props) {
  for (const t of targets) for (const p of props) t.style.removeProperty(p);
}
