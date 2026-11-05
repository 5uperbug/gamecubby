import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, BOARD_COUNTS, DEFAULT_BOARD_COUNT, createRound, completedLines, isLegal, isLive,
  liveBoards, mustLose, play, replayRound, undo, wouldKill,
} from '../site/games/notakto/game.js';
import { LINES } from '../site/shared/js/tictactoe.js';

/** Plays [board, cell] pairs in order. */
const playAll = (round, ...moves) => moves.reduce((r, [b, c]) => play(r, b, c), round);

const legalMoves = (round) => {
  const moves = [];
  for (let b = 0; b < round.boardCount; b++) {
    for (let c = 0; c < 9; c++) if (isLegal(round, b, c)) moves.push([b, c]);
  }
  return moves;
};

// Kills board `b` with its top row: three moves, alternating players.
const topRow = (b) => [[b, 0], [b, 1], [b, 2]];

test('a new round has the chosen number of empty, live boards', () => {
  for (const boardCount of BOARD_COUNTS) {
    const r = createRound({ boardCount });
    assert.equal(r.boardCount, boardCount);
    assert.equal(r.cells.length, boardCount);
    for (const cells of r.cells) assert.deepEqual(cells, Array(9).fill(null));
    assert.deepEqual(liveBoards(r), [...Array(boardCount).keys()]);
    assert.equal(r.winner, null);
    assert.equal(r.loser, null);
    assert.deepEqual(r.moves, []);
  }
});

test('defaults: three boards, X starts, bad options fall back', () => {
  assert.equal(DEFAULT_BOARD_COUNT, 3);
  const r = createRound();
  assert.equal(r.boardCount, 3);
  assert.equal(r.turn, X);
  assert.equal(createRound({ boardCount: 4 }).boardCount, 3);
  assert.equal(createRound({ boardCount: 0 }).boardCount, 3);
  assert.equal(createRound({ boardCount: '2' }).boardCount, 3);
  assert.equal(createRound({ starter: 'nonsense' }).starter, X);
  assert.equal(createRound({ starter: O }).turn, O);
});

test('turns alternate, and each X remembers who placed it', () => {
  const r = playAll(createRound({ starter: O }), [0, 4], [2, 0], [1, 8]);
  assert.equal(r.cells[0][4], O);
  assert.equal(r.cells[2][0], X);
  assert.equal(r.cells[1][8], O);
  assert.equal(r.turn, X);
  assert.deepEqual(r.moves, [[0, 4], [2, 0], [1, 8]]);
});

test('occupied, out-of-range and malformed moves are illegal', () => {
  const r = play(createRound({ boardCount: 2 }), 1, 4);
  assert.equal(isLegal(r, 1, 4), false, 'occupied');
  assert.equal(isLegal(r, 0, 4), true, 'same cell on another board');
  assert.equal(isLegal(r, 2, 0), false, 'no third board');
  assert.equal(isLegal(r, -1, 0), false);
  assert.equal(isLegal(r, 0, 9), false);
  assert.equal(isLegal(r, 0, -1), false);
  assert.equal(isLegal(r, 0, 1.5), false);
  assert.equal(isLegal(r, '0', 1), false);
  assert.equal(isLegal(r, 0, null), false);
  assert.throws(() => play(r, 1, 4), /Illegal move/);
  assert.throws(() => play(r, 2, 0), /Illegal move/);
});

test('three in a row kills a board, whoever placed the X’s', () => {
  // X: 0 and 2, O: 1 -> the top row is mixed but complete.
  const r = playAll(createRound(), [0, 0], [0, 1], [0, 2]);
  assert.equal(isLive(r, 0), false);
  assert.deepEqual(r.dead[0], { by: X, lines: [[0, 1, 2]] });
  assert.deepEqual(liveBoards(r), [1, 2]);
  assert.equal(r.winner, null, 'other boards are still live');
  assert.equal(r.turn, O);
});

test('a dead board takes no more moves', () => {
  const r = playAll(createRound({ boardCount: 2 }), ...topRow(0));
  for (let c = 3; c < 9; c++) assert.equal(isLegal(r, 0, c), false);
  assert.throws(() => play(r, 0, 4), /Illegal move/);
  assert.equal(isLegal(r, 1, 4), true);
});

test('diagonals and columns kill too', () => {
  const diagonal = playAll(createRound(), [1, 0], [1, 4], [1, 8]);
  assert.deepEqual(diagonal.dead[1].lines, [[0, 4, 8]]);
  const column = playAll(createRound(), [2, 2], [2, 5], [2, 8]);
  assert.deepEqual(column.dead[2].lines, [[2, 5, 8]]);
  assert.equal(column.dead[2].by, X);
});

test('one X can complete several lines at once, and all are recorded', () => {
  // 0 1 3 5 7 8 filled without a line; the centre then completes three.
  const setup = [[0, 0], [0, 1], [0, 3], [0, 5], [0, 7], [0, 8]];
  const r = playAll(createRound(), ...setup);
  assert.equal(isLive(r, 0), true);
  const k = play(r, 0, 4);
  assert.deepEqual(k.dead[0], { by: X, lines: [[3, 4, 5], [1, 4, 7], [0, 4, 8]] });
});

test('one board: completing any line loses at once', () => {
  // X 0, O 5, X 7, O 1, X 3, O 2 -> O completes the top row.
  const r = playAll(createRound({ boardCount: 1 }), [0, 0], [0, 5], [0, 7], [0, 1], [0, 3], [0, 2]);
  assert.equal(r.loser, O);
  assert.equal(r.winner, X);
  assert.deepEqual(r.dead[0], { by: O, lines: [[0, 1, 2]] });
  assert.deepEqual(liveBoards(r), []);
});

test('two boards: the first kill is safe, the last one loses', () => {
  let r = playAll(createRound({ boardCount: 2 }), ...topRow(1));
  assert.equal(r.winner, null);
  assert.deepEqual(liveBoards(r), [0]);
  // X killed board 1, so O moves next: O, X, O on board 0's middle row.
  r = playAll(r, [0, 3], [0, 4], [0, 5]);
  assert.equal(r.loser, O);
  assert.equal(r.winner, X);
  assert.deepEqual(liveBoards(r), []);
});

test('three boards: boards can die in any order, the last kill decides', () => {
  const r = playAll(createRound({ boardCount: 3, starter: O }), ...topRow(2), ...topRow(0));
  assert.equal(r.winner, null);
  assert.deepEqual(liveBoards(r), [1]);
  // Six moves so far, so O is to move again: O, X, O on board 1's diagonal.
  const end = playAll(r, [1, 2], [1, 4], [1, 6]);
  assert.equal(end.loser, O);
  assert.equal(end.winner, X);
  assert.equal(end.dead[1].by, O);
});

test('no moves are allowed once the round is over', () => {
  const r = playAll(createRound({ boardCount: 1 }), ...topRow(0));
  assert.ok(r.winner);
  assert.deepEqual(legalMoves(r), []);
  assert.throws(() => play(r, 0, 4), /Illegal move/);
});

test('wouldKill and mustLose spot doomed positions', () => {
  // Board 0: X at 0 and 1. Board 1: dead.
  const r = playAll(createRound({ boardCount: 2 }), ...topRow(1), [0, 0], [0, 1]);
  assert.equal(wouldKill(r, 0, 2), true);
  assert.equal(wouldKill(r, 0, 5), false);
  assert.equal(mustLose(r), false, 'safe squares remain');

  // 0 1 3 5 7 8 filled: the only empty squares, 2 4 6, all complete a line.
  const doomed = playAll(createRound({ boardCount: 1 }), [0, 0], [0, 1], [0, 3], [0, 5], [0, 7], [0, 8]);
  assert.equal(mustLose(doomed), true);
  assert.equal(mustLose(createRound()), false);
});

test('replay rebuilds the same round, and undo steps back one move', () => {
  const r = playAll(createRound({ boardCount: 3, starter: O }), [0, 4], [1, 0], [2, 8], [1, 4]);
  assert.deepEqual(replayRound({ boardCount: 3, starter: O }, r.moves), r);
  const u = undo(r);
  assert.deepEqual(u.moves, [[0, 4], [1, 0], [2, 8]]);
  assert.equal(u.cells[1][4], null);
  assert.equal(u.turn, X);
  assert.deepEqual(undo(createRound()), createRound());
});

test('undoing a kill brings the board back to life', () => {
  const r = playAll(createRound({ boardCount: 2 }), ...topRow(0));
  assert.equal(isLive(r, 0), false);
  const u = undo(r);
  assert.equal(isLive(u, 0), true);
  assert.equal(u.dead[0], null);
  assert.equal(isLegal(u, 0, 2), true);
  assert.deepEqual(liveBoards(u), [0, 1]);
});

test('undoing the losing move reopens the round', () => {
  const r = playAll(createRound({ boardCount: 1 }), ...topRow(0));
  assert.equal(r.loser, X);
  const u = undo(r);
  assert.equal(u.winner, null);
  assert.equal(u.loser, null);
  assert.equal(u.turn, X);
  assert.equal(isLegal(u, 0, 2), true);
});

test('replay stops at the first illegal or malformed move', () => {
  const opts = { boardCount: 2 };
  assert.deepEqual(replayRound(opts, [[0, 4], [0, 4], [1, 0]]).moves, [[0, 4]]);
  assert.deepEqual(replayRound(opts, [[0, 4], [5, 0], [1, 0]]).moves, [[0, 4]]);
  assert.deepEqual(replayRound(opts, [[0, 4], 7, [1, 0]]).moves, [[0, 4]]);
  assert.deepEqual(replayRound(opts, [[0, 4], null]).moves, [[0, 4]]);
  // Moves on a board after it died are rejected too.
  assert.deepEqual(replayRound(opts, [...topRow(0), [0, 4]]).moves, topRow(0));
});

test('play does not mutate the round it is given', () => {
  const r = playAll(createRound({ boardCount: 2 }), [0, 0], [0, 1]);
  const snapshot = JSON.stringify(r);
  play(r, 0, 2);
  play(r, 1, 4);
  assert.equal(JSON.stringify(r), snapshot);
});

test('recorded lines are copies, so changing them cannot break the rules', () => {
  const lines = JSON.stringify(LINES);
  const r = playAll(createRound(), ...topRow(0));
  r.dead[0].lines[0][0] = 99;
  completedLines(Array(9).fill(X))[0].push(5);
  assert.equal(JSON.stringify(LINES), lines);
});

test('random rounds always end with exactly one loser', () => {
  for (const boardCount of BOARD_COUNTS) {
    for (let game = 0; game < 300; game++) {
      const starter = game % 2 ? O : X;
      let r = createRound({ boardCount, starter });
      let last = null;
      while (!r.winner) {
        const moves = legalMoves(r);
        assert.ok(moves.length > 0, 'a live round always has a legal move');
        const [b, c] = moves[Math.floor(Math.random() * moves.length)];
        last = r.turn;
        r = play(r, b, c);
      }
      assert.equal(r.loser, last, 'the player who killed the last board loses');
      assert.equal(r.winner, last === X ? O : X);
      assert.deepEqual(liveBoards(r), []);
      r.dead.forEach((death, b) => {
        assert.ok(death.lines.length >= 1);
        for (const line of death.lines) assert.ok(line.every((i) => r.cells[b][i] !== null));
      });
      // A board holds at most six X's without a line, so it dies by its seventh.
      assert.ok(r.moves.length >= 3 * boardCount && r.moves.length <= 7 * boardCount);
      // Moves alternate from the starter, and replay gives the same round.
      r.moves.forEach(([b, c], i) => assert.equal(r.cells[b][c], i % 2 ? (starter === X ? O : X) : starter));
      assert.deepEqual(replayRound({ boardCount, starter }, r.moves), r);
    }
  }
});
