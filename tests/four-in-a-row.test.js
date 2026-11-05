import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, DRAW, COLS, ROWS, CONNECT, cellAt, colOf, rowOf, createRound, landingRow, isLegal,
  legalColumns, linesThrough, lineKind, play, replayRound, undo, lastCell,
} from '../site/games/four-in-a-row/game.js';

const playAll = (round, ...cols) => cols.reduce(play, round);

/** Cell by column and height above the bottom, which reads more naturally here. */
const at = (col, height) => cellAt(col, ROWS - 1 - height);

/** Independent brute-force check: does `player` have CONNECT in a row anywhere? */
function hasLine(cells, player) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        let n = 0;
        while (n < CONNECT) {
          const c = col + dc * n;
          const r = row + dr * n;
          if (c < 0 || c >= COLS || r < 0 || r >= ROWS || cells[r * COLS + c] !== player) break;
          n += 1;
        }
        if (n === CONNECT) return true;
      }
    }
  }
  return false;
}

/** No disc floats: everything below a disc is filled. */
function assertGravity(cells) {
  for (let col = 0; col < COLS; col++) {
    for (let row = 1; row < ROWS; row++) {
      if (cells[cellAt(col, row - 1)] !== null) {
        assert.notEqual(cells[cellAt(col, row)], null, `floating disc in column ${col}`);
      }
    }
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Fills the board with nobody getting four in a row. Rows alternate, and
// columns run in pairs. Top to bottom:
//   X O X O X O X
//   O X O X O X O
//   O X O X O X O
//   X O X O X O X
//   X O X O X O X
//   O X O X O X O
const DRAW_MOVES = [
  1, 0, 0, 1, 0, 0, 3, 0, 0, 1, 1, 2, 1, 1, 2, 3, 2, 2, 5, 2, 2,
  3, 3, 4, 3, 3, 4, 5, 4, 5, 5, 4, 5, 6, 6, 4, 6, 6, 4, 6, 6, 5,
];

// A full-length game in which the 42nd disc (O, column 2) makes four across.
const LAST_DISC_WINS = [
  2, 5, 3, 3, 4, 3, 6, 1, 1, 5, 5, 2, 3, 5, 1, 3, 6, 5, 0, 1, 6,
  3, 5, 2, 4, 4, 0, 6, 4, 4, 1, 0, 4, 1, 0, 2, 6, 6, 0, 0, 2, 2,
];

test('cell helpers agree with each other', () => {
  assert.equal(COLS, 7);
  assert.equal(ROWS, 6);
  for (let cell = 0; cell < COLS * ROWS; cell++) {
    assert.equal(cellAt(colOf(cell), rowOf(cell)), cell);
  }
  assert.equal(at(0, 0), 35, 'bottom-left');
  assert.equal(at(6, 5), 6, 'top-right');
});

test('a new round is empty and the starter moves first', () => {
  const r = createRound();
  assert.deepEqual(r.cells, Array(42).fill(null));
  assert.equal(r.turn, X);
  assert.equal(r.winner, null);
  assert.deepEqual(r.lines, []);
  assert.deepEqual(r.moves, []);
  assert.equal(createRound(O).turn, O);
  assert.equal(createRound(O).starter, O);
  assert.equal(createRound('nonsense').starter, X);
  assert.deepEqual(legalColumns(r), [0, 1, 2, 3, 4, 5, 6]);
});

test('a disc falls to the lowest empty cell of its column', () => {
  const r = createRound();
  assert.equal(landingRow(r, 3), ROWS - 1);
  const one = play(r, 3);
  assert.equal(one.cells[at(3, 0)], X);
  assert.equal(landingRow(one, 3), ROWS - 2);
  const two = play(one, 3);
  assert.equal(two.cells[at(3, 1)], O);
  assert.equal(two.cells.filter(Boolean).length, 2);
});

test('turns alternate from the starter and moves record columns', () => {
  const r = playAll(createRound(O), 0, 6, 0);
  assert.equal(r.cells[at(0, 0)], O);
  assert.equal(r.cells[at(6, 0)], X);
  assert.equal(r.cells[at(0, 1)], O);
  assert.equal(r.turn, X);
  assert.deepEqual(r.moves, [0, 6, 0]);
});

test('a full column cannot be played', () => {
  const r = playAll(createRound(), 2, 2, 2, 2, 2, 2);
  assert.equal(r.winner, null, 'alternating discs make no line');
  assert.equal(landingRow(r, 2), -1);
  assert.equal(isLegal(r, 2), false);
  assert.throws(() => play(r, 2), /Illegal move/);
  assert.deepEqual(legalColumns(r), [0, 1, 3, 4, 5, 6]);
});

test('columns off the board or not integers are illegal', () => {
  const r = createRound();
  for (const col of [-1, 7, 1.5, NaN, '3', null, undefined]) {
    assert.equal(isLegal(r, col), false, `column ${String(col)}`);
    assert.equal(landingRow(r, col), -1);
    assert.throws(() => play(r, col));
  }
});

test('four across wins and records the line end to end', () => {
  // X along the bottom from column 1 to 4, O stacking on top.
  const r = playAll(createRound(), 1, 1, 2, 2, 3, 3, 4);
  assert.equal(r.winner, X);
  assert.deepEqual(r.lines, [[at(1, 0), at(2, 0), at(3, 0), at(4, 0)]]);
  assert.equal(lineKind(r.lines[0]), 'across');
});

test('four down wins', () => {
  const r = playAll(createRound(), 6, 5, 6, 5, 6, 5, 6);
  assert.equal(r.winner, X);
  assert.deepEqual(r.lines, [[at(6, 3), at(6, 2), at(6, 1), at(6, 0)]]);
  assert.equal(lineKind(r.lines[0]), 'down');
});

test('four on a rising diagonal wins', () => {
  const r = playAll(createRound(), 0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3);
  assert.equal(r.winner, X);
  assert.deepEqual(r.lines, [[at(0, 0), at(1, 1), at(2, 2), at(3, 3)]]);
  assert.equal(lineKind(r.lines[0]), 'diagonal');
});

test('four on a falling diagonal wins, even when the last disc is mid-line', () => {
  // The winning disc lands at (1,2), between (0,3) and (2,1).
  const r = playAll(createRound(), 3, 2, 2, 0, 0, 0, 0, 1, 6, 1, 1);
  assert.equal(r.winner, X);
  assert.deepEqual(r.lines, [[at(0, 3), at(1, 2), at(2, 1), at(3, 0)]]);
  assert.equal(lineKind(r.lines[0]), 'diagonal');
});

test('a line can end in the top-right corner', () => {
  const r = playAll(createRound(), 6, 6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 3, 3, 0, 3, 0, 4, 1, 5, 1, 6);
  assert.equal(r.winner, O);
  assert.deepEqual(r.lines, [[at(3, 2), at(4, 3), at(5, 4), at(6, 5)]]);
});

test('three in a row is not a win', () => {
  const r = playAll(createRound(), 4, 4, 5, 5, 6);
  assert.equal(r.winner, null);
  assert.equal(r.lines.length, 0);
});

test('lines do not wrap from one row to the next', () => {
  // X ends up at the right end of row 1 and the left end of row 0: four cells
  // in a row in the flat array, but not on the board.
  const r = playAll(createRound(), 0, 5, 1, 6, 5, 3, 6);
  assert.deepEqual([33, 34, 35, 36].map((c) => r.cells[c]), [X, X, X, X]);
  assert.equal(r.winner, null);
  assert.equal(hasLine(r.cells, X), false);
});

test('an opponent disc breaks a line', () => {
  // Bottom row: X X O X X.
  const r = playAll(createRound(), 0, 2, 1, 2, 3, 2, 4);
  assert.equal(r.cells[at(2, 0)], O);
  assert.equal(r.winner, null);
});

test('filling a gap can make five in a row, and the line covers all five', () => {
  const r = playAll(createRound(), 0, 0, 1, 1, 3, 3, 4, 4, 2);
  assert.equal(r.winner, X);
  assert.deepEqual(r.lines, [[at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)]]);
});

test('one disc can complete two lines at once', () => {
  // X has three across and three up a diagonal, both waiting on (0,0).
  const r = playAll(createRound(), 1, 6, 2, 2, 3, 3, 1, 3, 2, 6, 3, 5, 0);
  assert.equal(r.winner, X);
  assert.deepEqual(r.lines, [
    [at(0, 0), at(1, 0), at(2, 0), at(3, 0)],
    [at(0, 0), at(1, 1), at(2, 2), at(3, 3)],
  ]);
  assert.deepEqual(r.lines.map(lineKind), ['across', 'diagonal']);
});

test('linesThrough only reports lines through the given cell', () => {
  const cells = Array(COLS * ROWS).fill(null);
  for (const c of [at(0, 0), at(1, 0), at(2, 0), at(3, 0)]) cells[c] = O;
  assert.equal(linesThrough(cells, at(2, 0), O).length, 1);
  assert.deepEqual(linesThrough(cells, at(2, 0), X), []);
  cells[at(5, 0)] = O;
  assert.deepEqual(linesThrough(cells, at(5, 0), O), []);
});

test('no moves are allowed after a win', () => {
  const r = playAll(createRound(), 1, 1, 2, 2, 3, 3, 4);
  assert.equal(isLegal(r, 0), false);
  assert.deepEqual(legalColumns(r), []);
  assert.throws(() => play(r, 0));
});

test('a full board with no line is a draw', () => {
  const r = replayRound(X, DRAW_MOVES);
  assert.equal(r.moves.length, 42);
  assert.equal(r.winner, DRAW);
  assert.deepEqual(r.lines, []);
  assert.equal(hasLine(r.cells, X), false);
  assert.equal(hasLine(r.cells, O), false);
  assert.deepEqual(legalColumns(r), []);
  const almost = replayRound(X, DRAW_MOVES.slice(0, -1));
  assert.equal(almost.winner, null);
  assert.deepEqual(legalColumns(almost), [DRAW_MOVES.at(-1)]);
});

test('a line made with the last empty cell is a win, not a draw', () => {
  const r = replayRound(X, LAST_DISC_WINS);
  assert.equal(r.moves.length, 42);
  assert.ok(!r.cells.includes(null));
  assert.equal(r.winner, O);
  assert.deepEqual(r.lines, [[at(0, 5), at(1, 5), at(2, 5), at(3, 5)]]);
  assert.equal(replayRound(X, LAST_DISC_WINS.slice(0, -1)).winner, null);
});

test('replay and undo rebuild the same round', () => {
  const r = playAll(createRound(O), 3, 3, 4, 2, 2, 5);
  assert.deepEqual(replayRound(O, r.moves), r);
  const u = undo(r);
  assert.deepEqual(u.moves, [3, 3, 4, 2, 2]);
  assert.equal(u.cells[at(5, 0)], null);
  assert.equal(u.turn, X);
  assert.deepEqual(u, playAll(createRound(O), 3, 3, 4, 2, 2));
  assert.deepEqual(undo(createRound(O)), createRound(O), 'undo on an empty round changes nothing');
});

test('undoing a winning move reopens the round', () => {
  const r = playAll(createRound(), 1, 1, 2, 2, 3, 3, 4);
  const u = undo(r);
  assert.equal(u.winner, null);
  assert.deepEqual(u.lines, []);
  assert.equal(u.turn, X);
  assert.equal(isLegal(u, 4), true);
});

test('undoing the last move of a draw reopens that column', () => {
  const u = undo(replayRound(X, DRAW_MOVES));
  assert.equal(u.winner, null);
  assert.deepEqual(legalColumns(u), [DRAW_MOVES.at(-1)]);
});

test('replay stops at the first illegal move', () => {
  assert.deepEqual(replayRound(X, [0, 0, 0, 0, 0, 0, 0, 1]).moves, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(replayRound(X, [3, 9, 3]).moves, [3]);
  assert.deepEqual(replayRound(X, [2, 'x', 2]).moves, [2]);
  // Nothing is played after a win.
  assert.deepEqual(replayRound(X, [1, 1, 2, 2, 3, 3, 4, 5]).moves, [1, 1, 2, 2, 3, 3, 4]);
});

test('play and undo do not mutate the round they are given', () => {
  const r = deepFreeze(playAll(createRound(), 3, 3));
  const snapshot = JSON.stringify(r);
  const next = play(r, 4);
  undo(r);
  assert.equal(JSON.stringify(r), snapshot);
  assert.notEqual(next.cells, r.cells);
  assert.notEqual(next.moves, r.moves);
});

test('lastCell follows the newest disc', () => {
  assert.equal(lastCell(createRound()), null);
  const r = playAll(createRound(), 5, 0, 5);
  assert.equal(lastCell(r), at(5, 1));
  assert.equal(lastCell(undo(r)), at(0, 0));
  const full = playAll(createRound(), 2, 2, 2, 2, 2, 2);
  assert.equal(lastCell(full), at(2, 5), 'the top disc of a full column');
});

test('random games always end legally', () => {
  for (let g = 0; g < 400; g++) {
    let r = createRound(g % 2 ? O : X);
    while (!r.winner) {
      const cols = legalColumns(r);
      assert.ok(cols.length > 0, 'a live round always has a move');
      const prev = r;
      const mover = prev.turn;
      const col = cols[Math.floor(Math.random() * cols.length)];
      r = play(prev, col);

      assertGravity(r.cells);
      assert.equal(colOf(lastCell(r)), col);
      assert.equal(r.cells[lastCell(r)], mover);
      const own = r.cells.filter((c) => c === r.starter).length;
      const theirs = r.cells.filter((c) => c !== null && c !== r.starter).length;
      assert.ok(own - theirs === 0 || own - theirs === 1, 'discs alternate');

      // The result agrees with a brute-force scan of the whole board.
      assert.ok(!hasLine(prev.cells, X) && !hasLine(prev.cells, O), 'nobody had won before');
      assert.equal(r.winner === mover, hasLine(r.cells, mover));
      assert.equal(hasLine(r.cells, r.turn), false, 'only the mover can complete a line');
      if (r.winner === DRAW) assert.ok(!r.cells.includes(null));
      for (const line of r.lines) {
        assert.ok(line.length >= CONNECT);
        assert.ok(line.includes(lastCell(r)), 'every line runs through the newest disc');
        assert.ok(line.every((c) => r.cells[c] === mover));
      }
      assert.ok(r.moves.length <= COLS * ROWS);
    }
    assert.ok([X, O, DRAW].includes(r.winner));
    assert.deepEqual(replayRound(r.starter, r.moves), r);
  }
});
