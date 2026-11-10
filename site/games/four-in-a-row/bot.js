// Bot adapter for Four in a Row: scores every window of four by how many
// discs each side has in it, with a nudge towards the centre column.

import {
  COLS, ROWS, CONNECT, cellAt, legalColumns, other, play,
} from './game.js';
import { outcomeOf } from '../../shared/js/bot.js';

const WINDOWS = [];
for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const end = [col + dc * (CONNECT - 1), row + dr * (CONNECT - 1)];
      if (end[0] < 0 || end[0] >= COLS || end[1] < 0 || end[1] >= ROWS) continue;
      WINDOWS.push(Array.from({ length: CONNECT }, (_, i) => cellAt(col + dc * i, row + dr * i)));
    }
  }
}

const WEIGHT = [0, 1, 6, 40]; // by discs in a window with none of the other side's
const CENTRE = Math.floor(COLS / 2);
// Centre-out, so alpha-beta sees the usually-better moves first.
const ORDER = Array.from({ length: COLS }, (_, i) => CENTRE + (i % 2 ? -1 : 1) * Math.ceil(i / 2));

export default {
  depth: 6,
  moves: (r) => {
    const legal = legalColumns(r);
    return ORDER.filter((c) => legal.includes(c));
  },
  play,
  turn: (r) => r.turn,
  outcome: (r, me) => outcomeOf(r.winner, me),
  score: (r, me) => {
    const them = other(me);
    let s = 0;
    for (const w of WINDOWS) {
      let mine = 0;
      let theirs = 0;
      for (const c of w) {
        if (r.cells[c] === me) mine += 1;
        else if (r.cells[c] === them) theirs += 1;
      }
      if (!theirs) s += WEIGHT[mine];
      else if (!mine) s -= WEIGHT[theirs];
    }
    for (let row = 0; row < ROWS; row += 1) {
      const p = r.cells[cellAt(CENTRE, row)];
      if (p) s += p === me ? 3 : -3;
    }
    return s;
  },
};
