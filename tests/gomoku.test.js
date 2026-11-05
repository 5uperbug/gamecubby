import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, DRAW, SIZE, CELLS, CENTER, DIRECTIONS, cellAt, rowOf, colOf, onBoard,
  createGame, isLegal, play, replay, undo, runThrough, runsThrough, overlines,
} from '../site/games/gomoku/game.js';

const at = cellAt;
const playAll = (game, cells) => cells.reduce((g, cell) => play(g, cell), game);
/** X, O, X, O…: alternates two move lists, starting with the first. */
const interleave = (first, second) => first.flatMap((cell, i) => (i < second.length ? [cell, second[i]] : [cell]));
const row = (r, from, to) => Array.from({ length: to - from + 1 }, (_, i) => at(r, from + i));
const col = (c, from, to) => Array.from({ length: to - from + 1 }, (_, i) => at(from + i, c));

// Scattered O moves that never line up and stay clear of the lines X builds below.
const SPARE = [at(2, 7), at(12, 7), at(7, 2), at(7, 12), at(9, 13), at(13, 9)];
// Nine O moves along row 13 with gaps, for positions that need more of them.
const SPARE_ROW = [...[0, 2, 4, 6, 8, 10, 12, 14].map((c) => at(13, c)), at(11, 1)];

/** X plays `cells` in order while O answers each move but the last with a spare move. */
const xPlays = (cells, rules = {}, spare = SPARE) => (
  playAll(createGame(rules), interleave(cells, spare.slice(0, cells.length - 1)))
);

/** Every maximal run of `player`'s marks, found by scanning the whole board. */
function allRuns(cells, player) {
  const runs = [];
  for (const [dr, dc] of DIRECTIONS) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (cells[at(r, c)] !== player) continue;
        if (onBoard(r - dr, c - dc) && cells[at(r - dr, c - dc)] === player) continue; // not a run start
        const run = [];
        for (let rr = r, cc = c; onBoard(rr, cc) && cells[at(rr, cc)] === player; rr += dr, cc += dc) {
          run.push(at(rr, cc));
        }
        runs.push(run);
      }
    }
  }
  return runs;
}

const wins = (run, exactFive) => (exactFive ? run.length === 5 : run.length >= 5);
const sameLines = (a, b) => assert.deepEqual(
  a.map((l) => l.join()).sort(),
  b.map((l) => l.join()).sort(),
);

test('a new game is an empty 15×15 board with the starter to move', () => {
  const g = createGame();
  assert.equal(SIZE, 15);
  assert.equal(CELLS, 225);
  assert.equal(CENTER, at(7, 7));
  assert.equal(g.cells.length, 225);
  assert.ok(g.cells.every((c) => c === null));
  assert.equal(g.turn, X);
  assert.equal(g.starter, X);
  assert.equal(g.winner, null);
  assert.deepEqual(g.lines, []);
  assert.deepEqual(g.moves, []);
  assert.deepEqual(g.rules, { exactFive: false });
  assert.equal(createGame({}, O).turn, O);
  assert.equal(createGame({}, 'nonsense').starter, X);
  assert.deepEqual(createGame(null).rules, { exactFive: false });
  assert.deepEqual(createGame({ exactFive: true }).rules, { exactFive: true });
});

test('cell indexes map to rows and columns', () => {
  assert.equal(at(0, 0), 0);
  assert.equal(at(0, 14), 14);
  assert.equal(at(1, 0), 15);
  assert.equal(at(14, 14), 224);
  assert.equal(rowOf(at(9, 4)), 9);
  assert.equal(colOf(at(9, 4)), 4);
  assert.equal(onBoard(0, 15), false);
  assert.equal(onBoard(-1, 3), false);
  assert.equal(onBoard(14, 14), true);
});

test('turns alternate starting from the starter', () => {
  const g = playAll(createGame({}, O), [CENTER, 0, 1]);
  assert.equal(g.cells[CENTER], O);
  assert.equal(g.cells[0], X);
  assert.equal(g.cells[1], O);
  assert.equal(g.turn, X);
  assert.deepEqual(g.moves, [CENTER, 0, 1]);
});

test('any empty cell is legal, including corners and edges', () => {
  const g = createGame();
  for (const cell of [0, 14, 210, 224, at(0, 7), at(7, 0), CENTER]) assert.equal(isLegal(g, cell), true);
});

test('occupied, out-of-range and non-integer cells are illegal', () => {
  const g = play(createGame(), CENTER);
  for (const cell of [CENTER, -1, 225, 1.5, NaN, '3', null, undefined]) {
    assert.equal(isLegal(g, cell), false, `cell ${cell}`);
    assert.throws(() => play(g, cell));
  }
});

test('five across wins, including along the top and bottom edges', () => {
  for (const line of [row(0, 0, 4), row(0, 10, 14), row(14, 5, 9), row(6, 3, 7)]) {
    const g = xPlays(line);
    assert.equal(g.winner, X);
    assert.deepEqual(g.lines, [line]);
  }
});

test('five down wins, including along the left and right edges', () => {
  for (const line of [col(0, 0, 4), col(14, 10, 14), col(5, 1, 5)]) {
    const g = xPlays(line);
    assert.equal(g.winner, X);
    assert.deepEqual(g.lines, [line]);
  }
});

test('five on a down-right diagonal wins, into either corner', () => {
  const topLeft = [0, 1, 2, 3, 4].map((i) => at(i, i));
  const bottomRight = [10, 11, 12, 13, 14].map((i) => at(i, i));
  const middle = [0, 1, 2, 3, 4].map((i) => at(3 + i, 5 + i));
  for (const line of [topLeft, bottomRight, middle]) {
    const g = xPlays(line);
    assert.equal(g.winner, X);
    assert.deepEqual(g.lines, [line]);
  }
});

test('five on a down-left diagonal wins, into either corner', () => {
  const topRight = [0, 1, 2, 3, 4].map((i) => at(i, 14 - i));
  const bottomLeft = [10, 11, 12, 13, 14].map((i) => at(i, 14 - i));
  for (const line of [topRight, bottomLeft]) {
    const g = xPlays(line);
    assert.equal(g.winner, X);
    assert.deepEqual(g.lines, [line]);
  }
});

test('O wins too, and the line is listed end to end when the gap is filled last', () => {
  // X starts on spare cells; O fills (5,6) last.
  const oCells = [at(5, 4), at(5, 5), at(5, 7), at(5, 8), at(5, 6)];
  const g = playAll(createGame(), interleave(SPARE.slice(0, 5), oCells));
  assert.equal(g.winner, O);
  assert.deepEqual(g.lines, [row(5, 4, 8)]);
});

test('four in a row does not win', () => {
  const g = xPlays(row(7, 3, 6));
  assert.equal(g.winner, null);
  assert.deepEqual(g.lines, []);
  assert.equal(g.turn, O);
});

test('a line broken by the opponent does not count', () => {
  // X X O X X X along row 7.
  const xs = [at(7, 3), at(7, 4), at(7, 6), at(7, 7), at(7, 8)];
  const os = [at(7, 5), ...SPARE];
  const g = playAll(createGame(), interleave(xs, os));
  assert.equal(g.winner, null);
  assert.equal(runThrough(g.cells, at(7, 8), [0, 1]).length, 3);
});

test('freestyle: six in a row wins and the line covers all six', () => {
  const g = xPlays([at(5, 1), at(5, 2), at(5, 3), at(5, 5), at(5, 6), at(5, 4)]);
  assert.equal(g.winner, X);
  assert.deepEqual(g.lines, [row(5, 1, 6)]);
});

test('exactly five: six in a row does not win and play goes on', () => {
  const g = xPlays([at(5, 1), at(5, 2), at(5, 3), at(5, 5), at(5, 6), at(5, 4)], { exactFive: true });
  assert.equal(g.winner, null);
  assert.deepEqual(g.lines, []);
  assert.equal(g.turn, O);
  assert.deepEqual(overlines(g), [row(5, 1, 6)]);
  assert.equal(isLegal(g, at(0, 0)), true);
  // A later five elsewhere still wins.
  const later = playAll(g, interleave([0, 2, 4, 6, 8].map((c) => at(0, c)), row(9, 1, 5)));
  assert.equal(later.winner, X);
  assert.deepEqual(later.lines, [row(9, 1, 5)]);
});

test('exactly five: a five still wins and a seven-long overline does not', () => {
  const five = xPlays(row(4, 2, 6), { exactFive: true });
  assert.equal(five.winner, X);
  assert.deepEqual(five.lines, [row(4, 2, 6)]);

  // X X X _ X X X, then the gap: seven in a row.
  const seven = xPlays([at(4, 2), at(4, 3), at(4, 4), at(4, 6), at(4, 7), at(4, 8), at(4, 5)], { exactFive: true }, SPARE_ROW);
  assert.equal(seven.winner, null);
  assert.deepEqual(overlines(seven), [row(4, 2, 8)]);
});

test('exactly five: a five in one direction wins even if the move also makes six in another', () => {
  // The last X at (7,7) makes six across (7,4)-(7,9) and five down (3,7)-(7,7).
  const xs = [at(7, 4), at(7, 5), at(7, 6), at(7, 8), at(7, 9), at(3, 7), at(4, 7), at(5, 7), at(6, 7), at(7, 7)];
  const exact = xPlays(xs, { exactFive: true }, SPARE_ROW);
  assert.equal(exact.winner, X);
  assert.deepEqual(exact.lines, [col(7, 3, 7)]);
  const free = xPlays(xs, {}, SPARE_ROW);
  assert.equal(free.winner, X);
  assert.deepEqual(free.lines, [row(7, 4, 9), col(7, 3, 7)]);
});

test('a move that makes two fives at once reports both lines', () => {
  const xs = [at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(3, 7), at(4, 7), at(5, 7), at(6, 7), at(7, 7)];
  for (const exactFive of [false, true]) {
    const g = xPlays(xs, { exactFive }, SPARE_ROW);
    assert.equal(g.winner, X);
    assert.deepEqual(g.lines, [row(7, 3, 7), col(7, 3, 7)]);
  }
});

test('no moves are allowed after a win', () => {
  const g = xPlays(row(0, 0, 4));
  assert.equal(isLegal(g, CENTER), false);
  assert.throws(() => play(g, CENTER));
});

/** A full board with no five: rows of X X O O, each row shifted by two. */
const DRAW_PATTERN = Array.from({ length: CELLS }, (_, i) => ((colOf(i) + 2 * rowOf(i)) % 4 < 2 ? X : O));
const cellsOf = (pattern, player) => pattern.flatMap((p, i) => (p === player ? [i] : []));

test('a full board with no five is a draw', () => {
  const xs = cellsOf(DRAW_PATTERN, X);
  const os = cellsOf(DRAW_PATTERN, O);
  assert.equal(xs.length, 113);
  assert.equal(os.length, 112);
  for (const p of [X, O]) assert.ok(allRuns(DRAW_PATTERN, p).every((run) => run.length <= 2));
  for (const exactFive of [false, true]) {
    const g = playAll(createGame({ exactFive }), interleave(xs, os));
    assert.equal(g.winner, DRAW);
    assert.deepEqual(g.lines, []);
    assert.equal(g.moves.length, CELLS);
    assert.ok(g.cells.every((c) => c !== null));
    assert.equal(isLegal(g, 0), false);
  }
});

test('filling the last cell with a five is a win, not a draw', () => {
  // The draw pattern with row 0 changed to X X _ X X O…, rebalanced at (7,2).
  const last = at(0, 2);
  const pattern = DRAW_PATTERN.slice();
  pattern[at(0, 3)] = X;
  pattern[at(0, 5)] = O;
  pattern[at(7, 2)] = O;
  pattern[last] = null;
  for (const p of [X, O]) assert.ok(allRuns(pattern, p).every((run) => run.length < 5), `no five for ${p} yet`);
  const xs = cellsOf(pattern, X);
  const os = cellsOf(pattern, O);
  assert.equal(xs.length, 112);
  assert.equal(os.length, 112);
  for (const exactFive of [false, true]) {
    const g = playAll(createGame({ exactFive }), [...interleave(xs, os), last]);
    assert.equal(g.moves.length, CELLS);
    assert.equal(g.winner, X);
    assert.deepEqual(g.lines, [row(0, 0, 4)]);
  }
});

test('runs are read in all four directions and stop at edges and other marks', () => {
  const g = playAll(createGame(), [at(0, 0), at(0, 2), at(0, 1), at(1, 1)]);
  assert.deepEqual(runThrough(g.cells, at(0, 0), [0, 1]), [at(0, 0), at(0, 1)]);
  assert.deepEqual(runThrough(g.cells, at(0, 2), [1, -1]), [at(0, 2), at(1, 1)]);
  assert.deepEqual(runThrough(g.cells, at(5, 5), [0, 1]), []);
  assert.deepEqual(runsThrough(g.cells, at(0, 0)).map((r) => r.length), [2, 1, 1, 1]);
  assert.deepEqual(overlines(createGame()), []);
});

test('replay and undo rebuild the same game', () => {
  const g = playAll(createGame({ exactFive: true }, O), [CENTER, 0, at(6, 6), at(8, 8), at(5, 5)]);
  assert.deepEqual(replay(g.rules, g.starter, g.moves), g);
  const u = undo(g);
  assert.deepEqual(u.moves, [CENTER, 0, at(6, 6), at(8, 8)]);
  assert.equal(u.cells[at(5, 5)], null);
  assert.equal(u.turn, O);
  assert.equal(u.starter, O);
  assert.deepEqual(u.rules, { exactFive: true });
  assert.deepEqual(undo(createGame({}, O)), createGame({}, O));
});

test('undoing the winning move reopens the game', () => {
  const g = xPlays(row(0, 0, 4));
  const u = undo(g);
  assert.equal(u.winner, null);
  assert.deepEqual(u.lines, []);
  assert.equal(u.turn, X);
  assert.equal(isLegal(u, at(0, 4)), true);
  assert.deepEqual(play(u, at(0, 4)), g);
});

test('replay stops at the first illegal move', () => {
  assert.deepEqual(replay({}, X, [CENTER, CENTER, 0]).moves, [CENTER]);
  assert.deepEqual(replay({}, X, [0, 'x', 1]).moves, [0]);
  assert.deepEqual(replay({}, X, [0, 300]).moves, [0]);
  // Nothing is played after a win.
  const won = xPlays(row(0, 0, 4));
  assert.deepEqual(replay({}, X, [...won.moves, CENTER]).moves, won.moves);
});

test('play does not mutate the game it is given', () => {
  const g = playAll(createGame(), [CENTER, 0]);
  const snapshot = JSON.stringify(g);
  const next = play(g, 1);
  assert.equal(JSON.stringify(g), snapshot);
  assert.notEqual(next.cells, g.cells);
  assert.notEqual(next.moves, g.moves);
  assert.notEqual(createGame().cells, createGame().cells);
});

test('random games always end legally and agree with a full board scan', () => {
  // A small seeded generator keeps failures reproducible.
  let seed = 20261105;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const neighbours = (cell) => DIRECTIONS.flatMap(([dr, dc]) => [1, -1].map((s) => [rowOf(cell) + dr * s, colOf(cell) + dc * s]))
    .filter(([r, c]) => onBoard(r, c)).map(([r, c]) => at(r, c));
  const seen = { X: 0, O: 0, D: 0, overline: 0 };

  for (const exactFive of [false, true]) {
    for (const starter of [X, O]) {
      for (let n = 0; n < 50; n++) {
        let g = createGame({ exactFive }, starter);
        while (!g.winner) {
          const empty = g.cells.flatMap((v, i) => (v === null ? [i] : []));
          assert.ok(empty.length > 0, 'a live game always has an empty cell');
          // Mostly play next to existing marks, so lines (and overlines) form.
          const near = [...new Set(g.moves.flatMap(neighbours))].filter((c) => g.cells[c] === null);
          const pool = near.length && random() < 0.85 ? near : empty;
          const cell = pool[Math.floor(random() * pool.length)];
          const mover = g.turn;
          const next = play(g, cell);

          assert.equal(next.turn, mover === X ? O : X);
          assert.equal(next.moves.length, g.moves.length + 1);
          const scanned = allRuns(next.cells, mover).filter((run) => wins(run, exactFive));
          if (scanned.length) {
            assert.equal(next.winner, mover);
            sameLines(next.lines, scanned);
            for (const line of next.lines) {
              assert.ok(line.includes(cell));
              assert.ok(line.every((c) => next.cells[c] === mover));
            }
          } else {
            assert.notEqual(next.winner, mover);
            assert.deepEqual(next.lines, []);
            assert.equal(next.winner === DRAW, next.moves.length === CELLS);
            if (overlines(next).length) seen.overline += 1;
          }
          assert.ok(allRuns(next.cells, mover === X ? O : X).every((run) => !wins(run, exactFive)));
          g = next;
        }
        assert.ok([X, O, DRAW].includes(g.winner));
        assert.equal(isLegal(g, g.cells.indexOf(null)), false);
        assert.deepEqual(replay(g.rules, g.starter, g.moves), g);
        seen[g.winner] += 1;
      }
    }
  }
  assert.ok(seen.X > 0 && seen.O > 0, 'both players win some games');
  assert.ok(seen.overline > 0, 'the exactly-five rule saw overlines that did not win');
});
