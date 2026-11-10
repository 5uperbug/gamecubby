// Hex board drawing, shared by the game and the home page preview: where
// cells sit, their outlines, the coloured edges and the stones. Red (X)
// stones carry a cross and Blue (O) stones a ring, so colour is never the
// only cue. Colours come from CSS.

import { svgEl, createMark } from '../../shared/js/marks.js';
import { rowOf, colOf, cellAt } from './game.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** Corner k of a pointy-top hexagon, clockwise from the top: 0 top, 1 upper right … 5 upper left. */
function cornerOf([x, y], r, k) {
  const a = (Math.PI / 3) * k - Math.PI / 2;
  return [round2(x + r * Math.cos(a)), round2(y + r * Math.sin(a))];
}

export const hexagon = (centre, r) => [0, 1, 2, 3, 4, 5].map((k) => cornerOf(centre, r, k)).join(' ');

/**
 * Geometry for a `size` × `size` board of hexagons with corner radius `r`.
 * Each row is shifted half a cell right of the one above.
 */
export function layout(size, r) {
  const w = Math.sqrt(3) * r;
  const centre = (cell) => {
    const row = rowOf(size, cell);
    return [round2((colOf(size, cell) + row / 2) * w), round2(row * 1.5 * r)];
  };
  const corner = (cell, k) => cornerOf(centre(cell), r, k);
  const last = size - 1;
  const along = (fn) => Array.from({ length: size }, (_, i) => fn(i));
  const trace = (cells, ks, end) => {
    const pts = cells.flatMap((cell) => ks.map((k) => corner(cell, k)));
    if (end) pts.push(end);
    return `M${pts.join('L')}`;
  };
  // The zig-zag outline of each side, as path data.
  const edges = {
    top: trace(along((c) => cellAt(size, 0, c)), [5, 0], corner(last, 1)),
    bottom: trace(along((c) => cellAt(size, last, c)), [4, 3], corner(size * size - 1, 2)),
    left: trace(along((row) => cellAt(size, row, 0)), [5, 4]),
    right: trace(along((row) => cellAt(size, row, last)), [1, 2]),
  };
  const box = {
    x: -w / 2, y: -r, width: (size + last / 2) * w, height: (1.5 * last + 2) * r,
  };
  return { centre, edges, box };
}

/** A stone for `player`: a hexagon of radius `r` centred on (0, 0) with a cross or ring cut in. */
export function createStone(player, r) {
  const g = svgEl('g', { class: `stone stone-${player.toLowerCase()}` });
  svgEl('polygon', { class: 'stone-body', points: hexagon([0, 0], r) }, g);
  const size = round2(r * 1.1);
  const cue = createMark(player, size, round2(size * 0.24), 'stone-cue');
  cue.setAttribute('transform', `translate(${-size / 2} ${-size / 2})`);
  for (const path of cue.children) path.setAttribute('stroke-width', round2(r * 0.16));
  g.appendChild(cue);
  return g;
}
