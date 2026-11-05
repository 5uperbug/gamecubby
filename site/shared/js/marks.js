// SVG helpers for X/O games and the home page previews: element factory,
// stroke-drawn marks and win lines. Colours come from CSS (.mark-x, .line-o…).

import { animate, svg as animeSvg, ms, stag } from './motion.js';
import { X } from './tictactoe.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/** Path data for a mark drawn inside a `size` × `size` box. */
export function markPaths(player, size, inset) {
  const a = inset;
  const b = size - inset;
  if (player === X) return [`M${a} ${a}L${b} ${b}`, `M${b} ${a}L${a} ${b}`];
  const c = size / 2;
  const r = c - inset;
  return [`M${c} ${c - r}A${r} ${r} 0 1 1 ${c} ${c + r}A${r} ${r} 0 1 1 ${c} ${c - r}`];
}

export function createMark(player, size, inset, extraClass = '') {
  const g = svgEl('g', { class: `mark mark-${player.toLowerCase()} ${extraClass}`.trim() });
  for (const d of markPaths(player, size, inset)) svgEl('path', { d }, g);
  return g;
}

/** Path data for a line through three points, extended past the outer ones. */
export function lineThrough(points, extend) {
  const [[x1, y1], , [x2, y2]] = points;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  return `M${x1 - ux * extend} ${y1 - uy * extend}L${x2 + ux * extend} ${y2 + uy * extend}`;
}

/** Draws strokes on, one after another (the two arms of an X, for example). */
export function drawStrokes(paths, duration = 260) {
  if (!paths.length) return Promise.resolve();
  return animate(animeSvg.createDrawable(paths), {
    draw: ['0 0', '0 1'],
    duration: ms(duration),
    delay: stag(duration * 0.55),
    ease: 'inOutQuad',
  });
}
