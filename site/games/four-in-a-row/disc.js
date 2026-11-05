// Discs, shared by the board and the home page preview: how they look and how
// they fall. Red (X) discs carry a small cross and Blue (O) discs an inner
// ring, so the two can be told apart without relying on colour. Colours come
// from CSS.

import { ms } from '../../shared/js/motion.js';
import { svgEl } from '../../shared/js/marks.js';
import { X } from './game.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** A disc of radius `r` centred on (0, 0). */
export function createDisc(player, r, extraClass = '') {
  const g = svgEl('g', { class: `disc disc-${player.toLowerCase()} ${extraClass}`.trim() });
  svgEl('circle', { class: 'disc-body', r }, g);
  const cue = { class: 'disc-cue', 'stroke-width': round2(r * 0.15) };
  if (player === X) {
    const s = round2(r * 0.27);
    svgEl('path', { ...cue, d: `M${-s} ${-s}L${s} ${s}M${s} ${-s}L${-s} ${s}` }, g);
  } else {
    svgEl('circle', { ...cue, r: round2(r * 0.38) }, g);
  }
  return g;
}

/**
 * `y` keyframes for a disc that falls `distance` units onto its place: it
 * speeds up like a dropped object, then bounces a little. Time and bounce
 * scale with the number of rows (`row` units each) it falls.
 */
export function fallKeyframes(distance, row) {
  const rows = distance / row;
  const bounce = Math.min(0.16, 0.04 + 0.02 * rows) * row;
  return [
    { from: -distance, to: 0, duration: ms(Math.round(40 + 140 * Math.sqrt(rows))), ease: 'inQuad' },
    { to: -bounce, duration: ms(90), ease: 'outQuad' },
    { to: 0, duration: ms(90), ease: 'inQuad' },
  ];
}
