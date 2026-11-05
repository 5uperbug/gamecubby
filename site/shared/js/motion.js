// The one place that imports anime.js, plus helpers that respect the
// reduced-motion setting: with it on, durations and staggers become 0.
//
// anime.js 4.5 behaviour worth knowing:
// - On SVG elements that have x, y or rotate attributes (<text>, <rect>…),
//   animating `x`/`y` changes the attribute. Use translateX/translateY to move
//   them visually.
// - utils.remove(target) stops an animation, but its promise never resolves,
//   so code awaiting an interrupted animation (a viewBoxAnimator zoom, say)
//   waits forever. Don't await something another call may cancel.
// - utils.remove(paths) does not stop a svg.createDrawable() draw, because the
//   draw targets a proxy. Keep the animation and call .complete() on it.

import { animate, stagger, utils } from '../../vendor/animejs/anime.esm.min.js';

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

/**
 * Animates a square SVG viewBox. Returns `zoomTo({ x, y, w }, duration)`;
 * a new zoom interrupts the one in flight.
 */
export function viewBoxAnimator(svg, start) {
  const vb = { ...start };
  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.w}`);
  apply();
  return (to, duration) => {
    utils.remove(vb);
    return animate(vb, {
      ...to, duration: ms(duration), ease: 'inOutQuart', onUpdate: apply, onComplete: apply,
    });
  };
}
