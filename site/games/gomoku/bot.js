// Bot adapter for Gomoku. Scores every window of five by how many marks one
// side has in it. Only cells near existing marks are tried, ranked by how much
// they build or block, and only the best few are searched.
// ponytail: windows of five ignore the exactly-five overline rule when scoring
// (the rules still decide who wins); count runs of six if Hard misjudges it.

import {
  SIZE, CELLS, CENTER, FIVE, cellAt, rowOf, colOf, play,
} from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

const WINDOWS = [];
const THROUGH = Array.from({ length: CELLS }, () => []); // windows each cell is in
for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const er = r + dr * (FIVE - 1);
      const ec = c + dc * (FIVE - 1);
      if (er < 0 || er >= SIZE || ec < 0 || ec >= SIZE) continue;
      const w = Array.from({ length: FIVE }, (_, i) => cellAt(r + dr * i, c + dc * i));
      w.forEach((cell) => THROUGH[cell].push(WINDOWS.length));
      WINDOWS.push(w);
    }
  }
}

const WEIGHT = [0, 1, 8, 60, 500, 0];
const KEEP = 12; // candidate moves searched at each step

/** [mine, theirs] in a window. */
function count(cells, w, me) {
  let mine = 0;
  let theirs = 0;
  for (const c of w) {
    if (cells[c] === me) mine += 1;
    else if (cells[c] !== null) theirs += 1;
  }
  return [mine, theirs];
}

/** How much a mark in `cell` would build for `p` plus block for the other side. */
function urgency(cells, cell, p) {
  let v = 0;
  for (const i of THROUGH[cell]) {
    const [mine, theirs] = count(cells, WINDOWS[i], p);
    if (!theirs) v += WEIGHT[mine + 1];
    if (!mine) v += WEIGHT[theirs + 1] * 0.9;
  }
  return v;
}

function moves(g) {
  if (g.winner) return [];
  if (!g.moves.length) return [CENTER];
  const near = new Set();
  for (const m of g.moves) {
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const r = rowOf(m) + dr;
        const c = colOf(m) + dc;
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && g.cells[cellAt(r, c)] === null) near.add(cellAt(r, c));
      }
    }
  }
  return [...near]
    .map((cell) => [cell, urgency(g.cells, cell, g.turn)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, KEEP)
    .map(([cell]) => cell);
}

export default {
  depth: 3,
  moves,
  play,
  turn: (g) => g.turn,
  outcome: (g, me) => outcomeOf(g.winner, me),
  score: (g, me) => {
    let s = 0;
    for (const w of WINDOWS) {
      const [mine, theirs] = count(g.cells, w, me);
      if (!theirs) s += WEIGHT[mine];
      else if (!mine) s -= WEIGHT[theirs];
    }
    return s;
  },
};
