// 3×3 tic-tac-toe basics shared by every X/O game. No DOM access, so rules
// built on top of this can be tested with `node --test`.
//
// Cells are indexed 0..8, row-major:
//   0 1 2
//   3 4 5
//   6 7 8

export const X = 'X';
export const O = 'O';
/** Result marker for a full board with no winner. */
export const DRAW = 'D';

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6], // diagonals
];

export const POSITION_NAMES = [
  'top-left', 'top', 'top-right',
  'left', 'centre', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

export const other = (player) => (player === X ? O : X);

/** Returns the line (if any) that `player` has completed in a 9-slot array. */
export function findLine(slots, player) {
  return LINES.find((line) => line.every((i) => slots[i] === player)) || null;
}

export const isFull = (slots) => slots.every((s) => s !== null);
