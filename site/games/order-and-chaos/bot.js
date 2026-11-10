// Bot adapter for Order and Chaos. Sides are roles: Order wants five of one
// symbol in a row, Chaos wants every window of five spoiled. A window still
// holding only one symbol is worth more to Order the fuller it is.

import {
  ORDER, RUN, SYMBOLS, LINES, play,
} from './game.js';

const WINDOWS = LINES.flatMap((line) => Array.from({ length: line.length - RUN + 1 }, (_, i) => line.slice(i, i + RUN)));
const WEIGHT = [1, 2, 6, 25, 120];

/** How close Order is to five, over every window not yet spoiled. */
function orderValue(cells) {
  let v = 0;
  for (const w of WINDOWS) {
    let xs = 0;
    let os = 0;
    for (const c of w) {
      if (cells[c] === 'X') xs += 1;
      else if (cells[c] === 'O') os += 1;
    }
    if (!(xs && os)) v += WEIGHT[Math.max(xs, os)];
  }
  return v;
}

/** Empty cells inside a window that is still alive, else every empty cell. */
function moves(r) {
  if (r.winner) return [];
  const empty = r.cells.flatMap((s, c) => (s === null ? [c] : []));
  const live = new Set();
  for (const w of WINDOWS) {
    const syms = new Set(w.map((c) => r.cells[c]).filter(Boolean));
    if (syms.size < 2) w.forEach((c) => r.cells[c] === null && live.add(c));
  }
  const cells = live.size ? empty.filter((c) => live.has(c)) : empty;
  return cells.flatMap((cell) => SYMBOLS.map((symbol) => ({ cell, symbol })));
}

export default {
  depth: (r) => {
    const n = r.cells.filter((s) => s === null).length;
    if (n <= 6) return n;
    return n <= 14 ? 3 : 2;
  },
  moves,
  play: (r, { cell, symbol }) => play(r, cell, symbol),
  turn: (r) => r.turn,
  outcome: (r, me) => {
    if (!r.winner) return null;
    return r.winner === me ? 1 : -1;
  },
  score: (r, me) => (me === ORDER ? 1 : -1) * orderValue(r.cells),
};
