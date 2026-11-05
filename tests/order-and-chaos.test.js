import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, ORDER, CHAOS, P1, P2, SIDE, CELL_COUNT, RUN, LINES,
  createRound, isLegal, play, replayRound, undo, findFive, threats,
  orderPlayer, roleOf, playerFor, roundWinner, otherRole, otherPlayer, rowOf, colOf,
} from '../site/games/order-and-chaos/game.js';

/** Plays [cell, symbol] pairs in order; the roles alternate on their own. */
const playAll = (round, moves) => moves.reduce((r, [cell, symbol]) => play(r, cell, symbol), round);

/** Every five-cell stretch of every line: the places a five can appear. */
const WINDOWS = LINES.flatMap((line) => (
  Array.from({ length: line.length - RUN + 1 }, (_, i) => line.slice(i, i + RUN))
));

// A full board with no five anywhere: pairs of X and O, shifted on every row.
//   X X O O X X
//   O O X X O O   (and repeat)
const BLOCKS = Array.from({ length: CELL_COUNT }, (_, c) => (
  (rowOf(c) + Math.floor(colOf(c) / 2)) % 2 === 0 ? X : O
));

/** Small seeded PRNG (mulberry32), so random playouts are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when `cells` lie on one straight row, column or diagonal, each next to the last. */
function isStraight(cells) {
  const dr = rowOf(cells[1]) - rowOf(cells[0]);
  const dc = colOf(cells[1]) - colOf(cells[0]);
  if (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) return false;
  return cells.every((c, i) => i === 0 || (
    rowOf(c) - rowOf(cells[i - 1]) === dr && colOf(c) - colOf(cells[i - 1]) === dc
  ));
}

// --------------------------------------------------------------- the board

test('the board has 18 lines that can hold five, and 32 places a five can go', () => {
  assert.equal(SIDE, 6);
  assert.equal(CELL_COUNT, 36);
  assert.equal(LINES.length, 18);
  assert.equal(LINES.filter((l) => l.length === 6).length, 14); // 6 rows, 6 columns, 2 long diagonals
  assert.equal(LINES.filter((l) => l.length === 5).length, 4);
  for (const line of LINES) assert.ok(isStraight(line), `line ${line} is not straight`);
  assert.equal(WINDOWS.length, 32);
  assert.equal(new Set(WINDOWS.map(String)).size, 32);
});

test('the pattern used below is a full board with no five', () => {
  assert.ok(BLOCKS.every((s) => s === X || s === O));
  assert.equal(findFive(BLOCKS), null);
});

// ------------------------------------------------------------------- moves

test('a new round is empty and Order moves first', () => {
  const r = createRound();
  assert.deepEqual(r.cells, Array(36).fill(null));
  assert.equal(r.turn, ORDER);
  assert.equal(r.winner, null);
  assert.equal(r.line, null);
  assert.deepEqual(r.moves, []);
});

test('roles alternate and either role may play either symbol', () => {
  let r = createRound();
  r = play(r, 14, O); // Order plays O
  assert.equal(r.turn, CHAOS);
  r = play(r, 15, O); // Chaos plays O too
  assert.equal(r.turn, ORDER);
  r = play(r, 20, X);
  r = play(r, 21, X);
  assert.equal(r.turn, ORDER);
  assert.deepEqual([r.cells[14], r.cells[15], r.cells[20], r.cells[21]], [O, O, X, X]);
  assert.deepEqual(r.moves, [
    { cell: 14, symbol: O }, { cell: 15, symbol: O }, { cell: 20, symbol: X }, { cell: 21, symbol: X },
  ]);
});

test('any empty cell with X or O is legal', () => {
  const r = createRound();
  for (let c = 0; c < CELL_COUNT; c++) {
    assert.equal(isLegal(r, c, X), true);
    assert.equal(isLegal(r, c, O), true);
  }
});

test('occupied cells, bad cells and bad symbols are illegal', () => {
  const r = play(createRound(), 7, X);
  assert.equal(isLegal(r, 7, X), false);
  assert.equal(isLegal(r, 7, O), false, 'a filled cell cannot be overwritten with the other symbol');
  for (const cell of [-1, 36, 1.5, NaN, '3', null, undefined]) {
    assert.equal(isLegal(r, cell, X), false, `cell ${String(cell)}`);
  }
  for (const symbol of ['Z', 'x', 'o', '', null, undefined, 1]) {
    assert.equal(isLegal(r, 8, symbol), false, `symbol ${String(symbol)}`);
  }
  assert.throws(() => play(r, 7, O), /Illegal move/);
  assert.throws(() => play(r, 8, 'Z'), /Illegal move/);
  assert.throws(() => play(r, 36, X), /Illegal move/);
});

// -------------------------------------------------------------- Order wins

test('five in a row wins for Order in every place and direction, with X and with O', () => {
  for (const symbol of [X, O]) {
    for (const window of WINDOWS) {
      // Fill the middle cell last, so the five is completed from inside.
      const order = [window[0], window[1], window[3], window[4], window[2]];
      let r = createRound();
      for (const [i, cell] of order.entries()) {
        assert.equal(r.winner, null, `no winner before move ${i + 1} of ${window}`);
        r = play(r, cell, symbol);
      }
      assert.equal(r.winner, ORDER, `${symbol} on ${window}`);
      assert.deepEqual(r.line, window);
    }
  }
});

test('each direction is covered: across, down and both diagonals', () => {
  const cases = [
    [[0, 1, 2, 3, 4], X], // across
    [[1, 7, 13, 19, 25], O], // down
    [[1, 8, 15, 22, 29], X], // down-right
    [[11, 16, 21, 26, 31], O], // down-left
  ];
  for (const [cells, symbol] of cases) {
    const r = playAll(createRound(), cells.map((c) => [c, symbol]));
    assert.equal(r.winner, ORDER);
    assert.deepEqual(r.line, cells);
    assert.ok(isStraight(r.line));
  }
});

test('a mixed line of five does not count', () => {
  // X X O X X O across the top, O X X X X down the last column.
  const r = playAll(createRound(), [
    [0, X], [1, X], [2, O], [3, X], [4, X], [5, O],
    [11, X], [17, X], [23, X], [29, X],
  ]);
  assert.equal(r.winner, null);
  assert.equal(r.line, null);
  assert.equal(findFive(r.cells), null);
  // Four of each along the main diagonal, alternating, is still nothing.
  const d = playAll(createRound(), [[0, X], [7, O], [14, X], [21, O], [28, X], [35, O]]);
  assert.equal(d.winner, null);
});

test('six in a row counts for Order (house rule), and the whole six is the line', () => {
  // X X _ X X X, then the gap.
  const r = playAll(createRound(), [[0, X], [1, X], [3, X], [4, X], [5, X], [2, X]]);
  assert.equal(r.winner, ORDER);
  assert.deepEqual(r.line, [0, 1, 2, 3, 4, 5]);
  // The same on the long diagonal with O.
  const d = playAll(createRound(), [[0, O], [7, O], [21, O], [28, O], [35, O], [14, O]]);
  assert.equal(d.winner, ORDER);
  assert.deepEqual(d.line, [0, 7, 14, 21, 28, 35]);
});

test('a five completed on Chaos’s turn still wins for Order', () => {
  // Order and Chaos both play X across the top; Chaos’s third X makes five.
  const r = playAll(createRound(), [[0, X], [1, X], [2, X], [3, X], [30, O], [4, X]]);
  assert.equal(r.moves.length, 6); // the sixth move is Chaos’s
  assert.equal(r.winner, ORDER);
  assert.deepEqual(r.line, [0, 1, 2, 3, 4]);
});

test('no moves are allowed once the round is over', () => {
  const r = playAll(createRound(), [[0, O], [6, O], [12, O], [18, O], [24, O]]);
  assert.equal(r.winner, ORDER);
  assert.equal(isLegal(r, 35, X), false);
  assert.throws(() => play(r, 35, X));
});

// -------------------------------------------------------------- Chaos wins

test('a full board with no five is a win for Chaos', () => {
  let r = createRound();
  for (let c = 0; c < CELL_COUNT; c++) {
    assert.equal(r.winner, null);
    r = play(r, c, BLOCKS[c]);
  }
  assert.equal(r.winner, CHAOS);
  assert.equal(r.line, null);
  assert.equal(r.moves.length, 36);
  assert.equal(isLegal(r, 0, X), false);
});

test('a five made with the very last cell wins for Order, not Chaos', () => {
  // Bottom row becomes O X X X X _ ; the rest is the five-free block pattern.
  const cells = BLOCKS.slice();
  [cells[30], cells[31], cells[32], cells[33], cells[34]] = [O, X, X, X, X];
  const moves = [];
  for (let c = 0; c < 35; c++) moves.push([c, cells[c]]);
  const before = playAll(createRound(), moves);
  assert.equal(before.winner, null);
  assert.equal(before.turn, CHAOS); // move 36 always belongs to Chaos

  const withX = play(before, 35, X);
  assert.equal(withX.winner, ORDER);
  assert.deepEqual(withX.line, [31, 32, 33, 34, 35]);

  const withO = play(before, 35, O);
  assert.equal(withO.winner, CHAOS);
  assert.equal(withO.line, null);
});

// ---------------------------------------------------------- players, roles

test('Player 1 is Order in odd rounds and Player 2 in even rounds', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(orderPlayer), [P1, P2, P1, P2, P1, P2]);
  assert.equal(roleOf(P1, 1), ORDER);
  assert.equal(roleOf(P2, 1), CHAOS);
  assert.equal(roleOf(P1, 2), CHAOS);
  assert.equal(roleOf(P2, 2), ORDER);
  for (let n = 1; n <= 8; n++) {
    assert.notEqual(roleOf(P1, n), roleOf(P2, n), 'the two players never share a role');
    assert.notEqual(roleOf(P1, n), roleOf(P1, n + 1), 'roles swap every round');
    for (const role of [ORDER, CHAOS]) assert.equal(roleOf(playerFor(role, n), n), role);
  }
  assert.equal(otherRole(ORDER), CHAOS);
  assert.equal(otherRole(CHAOS), ORDER);
  assert.equal(otherPlayer(P1), P2);
  assert.equal(otherPlayer(P2), P1);
});

test('the round’s winner is whichever player held the winning role', () => {
  const orderWin = playAll(createRound(), [[0, X], [1, X], [2, X], [3, X], [4, X]]);
  let chaosWin = createRound();
  for (let c = 0; c < CELL_COUNT; c++) chaosWin = play(chaosWin, c, BLOCKS[c]);

  assert.equal(roundWinner(createRound(), 1), null);
  assert.equal(roundWinner(orderWin, 1), P1);
  assert.equal(roundWinner(orderWin, 2), P2);
  assert.equal(roundWinner(chaosWin, 1), P2);
  assert.equal(roundWinner(chaosWin, 2), P1);
});

test('scores across a match: a point for whoever won, in either role', () => {
  const orderWin = playAll(createRound(), [[5, O], [10, O], [15, O], [20, O], [25, O]]);
  let chaosWin = createRound();
  for (let c = 0; c < CELL_COUNT; c++) chaosWin = play(chaosWin, c, BLOCKS[c]);

  const scores = { [P1]: 0, [P2]: 0 };
  const results = [orderWin, orderWin, chaosWin, chaosWin, orderWin];
  results.forEach((round, i) => { scores[roundWinner(round, i + 1)] += 1; });
  // Round 1: P1 as Order. 2: P2 as Order. 3: P2 as Chaos. 4: P1 as Chaos. 5: P1 as Order.
  assert.deepEqual(scores, { [P1]: 3, [P2]: 2 });
});

test('the player to move follows the role to move', () => {
  let r = createRound();
  const seen = [];
  for (const cell of [0, 1, 2, 3]) {
    seen.push(playerFor(r.turn, 2));
    r = play(r, cell, O);
  }
  assert.deepEqual(seen, [P2, P1, P2, P1]); // in round 2, Player 2 is Order and starts
});

// ------------------------------------------------------------ undo, replay

test('replay rebuilds the same round, and undo takes back the last move', () => {
  const r = playAll(createRound(), [[14, X], [15, O], [20, X], [8, O]]);
  assert.deepEqual(replayRound(r.moves), r);
  const u = undo(r);
  assert.deepEqual(u.moves, r.moves.slice(0, 3));
  assert.equal(u.cells[8], null);
  assert.equal(u.turn, CHAOS);
  assert.deepEqual(undo(undo(undo(u))), createRound());
  assert.deepEqual(undo(createRound()), createRound());
});

test('undoing the winning move reopens the round', () => {
  const r = playAll(createRound(), [[0, X], [7, X], [14, X], [21, X], [28, X]]);
  assert.equal(r.winner, ORDER);
  const u = undo(r);
  assert.equal(u.winner, null);
  assert.equal(u.line, null);
  assert.equal(isLegal(u, 28, O), true);

  let full = createRound();
  for (let c = 0; c < CELL_COUNT; c++) full = play(full, c, BLOCKS[c]);
  const reopened = undo(full);
  assert.equal(reopened.winner, null);
  assert.equal(reopened.cells[35], null);
});

test('replay stops at the first malformed or illegal move', () => {
  assert.equal(replayRound([{ cell: 4, symbol: X }, { cell: 4, symbol: O }, { cell: 5, symbol: X }]).moves.length, 1);
  assert.equal(replayRound([{ cell: 4, symbol: X }, null, { cell: 5, symbol: X }]).moves.length, 1);
  assert.equal(replayRound([{ cell: 4, symbol: 'x' }]).moves.length, 0);
  assert.equal(replayRound([{ cell: '4', symbol: X }]).moves.length, 0);
  assert.equal(replayRound([[4, X]]).moves.length, 0);
  assert.deepEqual(replayRound('nonsense'), createRound());
  assert.deepEqual(replayRound(), createRound());
  // Moves after the round is over are dropped.
  const won = [0, 1, 2, 3, 4, 5].map((cell) => ({ cell, symbol: X }));
  assert.equal(replayRound([...won.slice(0, 5), { cell: 30, symbol: O }]).moves.length, 5);
});

test('play never changes the round it is given', () => {
  const freeze = (r) => Object.freeze({ ...r, cells: Object.freeze(r.cells.slice()), moves: Object.freeze(r.moves.slice()) });
  const r = freeze(playAll(createRound(), [[0, X], [1, X], [2, X], [3, X]]));
  const snapshot = JSON.stringify(r);
  const next = play(r, 4, X);
  assert.equal(JSON.stringify(r), snapshot);
  assert.notEqual(next.cells, r.cells);
  assert.notEqual(next.moves, r.moves);
  assert.equal(next.winner, ORDER);
  undo(next);
  assert.equal(next.moves.length, 5);
});

// ---------------------------------------------------------------- threats

test('threats lists the empty cells where one symbol would make five', () => {
  const cellsOf = (pairs) => {
    const cells = Array(CELL_COUNT).fill(null);
    for (const [c, s] of pairs) cells[c] = s;
    return cells;
  };
  assert.deepEqual(threats(createRound().cells), []);
  // X X X X _ _
  assert.deepEqual(threats(cellsOf([[0, X], [1, X], [2, X], [3, X]])), [{ cell: 4, symbols: [X] }]);
  // _ X X X X _ : either end
  assert.deepEqual(threats(cellsOf([[1, O], [2, O], [3, O], [4, O]])), [
    { cell: 0, symbols: [O] }, { cell: 5, symbols: [O] },
  ]);
  // X X _ X X : the gap
  assert.deepEqual(threats(cellsOf([[0, X], [1, X], [3, X], [4, X]])), [{ cell: 2, symbols: [X] }]);
  // Mixed or too short: nothing
  assert.deepEqual(threats(cellsOf([[0, X], [1, X], [2, O], [3, X]])), []);
  assert.deepEqual(threats(cellsOf([[0, X], [1, X], [2, X]])), []);
  // Cell 4 finishes an X row and an O column; the column is also open at the bottom.
  const both = cellsOf([[0, X], [1, X], [2, X], [3, X], [10, O], [16, O], [22, O], [28, O]]);
  assert.deepEqual(threats(both), [{ cell: 4, symbols: [X, O] }, { cell: 34, symbols: [O] }]);
});

test('every threat is a real winning move, and every winning move is a threat', () => {
  const random = rng(7);
  for (let game = 0; game < 60; game++) {
    let r = createRound();
    while (!r.winner) {
      const listed = new Map(threats(r.cells).map((t) => [t.cell, t.symbols]));
      for (let c = 0; c < CELL_COUNT; c++) {
        if (r.cells[c] !== null) continue;
        for (const s of [X, O]) {
          const wins = play(r, c, s).winner === ORDER;
          assert.equal(Boolean(listed.get(c)?.includes(s)), wins, `cell ${c}, ${s}`);
        }
      }
      const empty = r.cells.flatMap((s, c) => (s === null ? [c] : []));
      r = play(r, empty[Math.floor(random() * empty.length)], random() < 0.5 ? X : O);
    }
  }
});

// ------------------------------------------------------ random playouts

test('random playouts always end legally', () => {
  const random = rng(2026);
  let orderWins = 0;
  let chaosWins = 0;
  for (let game = 0; game < 400; game++) {
    let r = createRound();
    const roles = [];
    while (!r.winner) {
      assert.equal(findFive(r.cells), null, 'no five while the round is in play');
      assert.ok(r.cells.some((s) => s === null), 'never full while the round is in play');
      const empty = r.cells.flatMap((s, c) => (s === null ? [c] : []));
      const cell = empty[Math.floor(random() * empty.length)];
      const symbol = random() < 0.5 ? X : O;
      assert.ok(isLegal(r, cell, symbol));
      roles.push(r.turn);
      const next = play(r, cell, symbol);
      assert.equal(next.moves.length, r.moves.length + 1);
      assert.equal(next.cells.filter(Boolean).length, r.cells.filter(Boolean).length + 1);
      r = next;
    }
    assert.ok(r.moves.length <= CELL_COUNT);
    assert.deepEqual(roles, roles.map((_, i) => (i % 2 === 0 ? ORDER : CHAOS)));
    if (r.winner === ORDER) {
      orderWins += 1;
      const { line } = r;
      assert.ok(line.length >= RUN && line.length <= SIDE);
      assert.ok(isStraight(line));
      assert.ok(line.every((c) => r.cells[c] === r.cells[line[0]]));
      assert.ok(line.includes(r.moves.at(-1).cell), 'the five goes through the last move');
    } else {
      chaosWins += 1;
      assert.equal(r.winner, CHAOS);
      assert.ok(r.cells.every((s) => s === X || s === O));
      assert.equal(findFive(r.cells), null);
      assert.equal(r.line, null);
      assert.equal(r.moves.length, CELL_COUNT);
    }
    assert.deepEqual(replayRound(r.moves), r);
    let back = r;
    while (back.moves.length) back = undo(back);
    assert.deepEqual(back, createRound());
  }
  // Random play should produce both endings.
  assert.ok(orderWins > 0 && chaosWins > 0, `order ${orderWins}, chaos ${chaosWins}`);
});
