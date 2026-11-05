import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, DRAW, createRound, isLegal, play, replayRound, undo,
} from '../site/games/tic-tac-toe/game.js';
import { LINES, findLine, other } from '../site/shared/js/tictactoe.js';

const playAll = (round, ...cells) => cells.reduce(play, round);

test('shared core: eight distinct lines, each found when complete', () => {
  assert.equal(LINES.length, 8);
  assert.equal(new Set(LINES.map(String)).size, 8);
  for (const line of LINES) {
    const slots = Array(9).fill(null);
    for (const i of line) slots[i] = O;
    assert.deepEqual(findLine(slots, O), line);
    assert.equal(findLine(slots, X), null);
  }
  assert.equal(other(X), O);
  assert.equal(other(O), X);
});

test('a new round is empty and the starter moves first', () => {
  const r = createRound();
  assert.deepEqual(r.cells, Array(9).fill(null));
  assert.equal(r.turn, X);
  assert.equal(createRound(O).turn, O);
  assert.equal(createRound('nonsense').starter, X);
});

test('turns alternate starting from the starter', () => {
  const r = playAll(createRound(O), 4, 0);
  assert.equal(r.cells[4], O);
  assert.equal(r.cells[0], X);
  assert.equal(r.turn, O);
  assert.deepEqual(r.moves, [4, 0]);
});

test('occupied and out-of-range cells are illegal', () => {
  const r = play(createRound(), 4);
  assert.equal(isLegal(r, 4), false);
  assert.equal(isLegal(r, 9), false);
  assert.equal(isLegal(r, -1), false);
  assert.equal(isLegal(r, 1.5), false);
  assert.throws(() => play(r, 4));
});

test('three in a row wins and records the line', () => {
  // X: 0 1 2 across the top, O: 3 4
  const r = playAll(createRound(), 0, 3, 1, 4, 2);
  assert.equal(r.winner, X);
  assert.deepEqual(r.line, [0, 1, 2]);
});

test('no moves are allowed after a win', () => {
  const r = playAll(createRound(), 0, 3, 1, 4, 2);
  assert.equal(isLegal(r, 8), false);
  assert.throws(() => play(r, 8));
});

test('a full board with no line is a draw', () => {
  // X O X / X O O / O X X
  const r = playAll(createRound(), 0, 1, 2, 4, 3, 5, 7, 6, 8);
  assert.equal(r.winner, DRAW);
  assert.equal(r.line, null);
});

test('completing a line with the last cell is a win, not a draw', () => {
  // X O X / O X O / O X X  -> X's last move at 8 completes 0-4-8
  const r = playAll(createRound(), 0, 1, 2, 3, 4, 5, 7, 6, 8);
  assert.equal(r.winner, X);
  assert.deepEqual(r.line, [0, 4, 8]);
});

test('replay and undo rebuild the same round', () => {
  const r = playAll(createRound(O), 4, 0, 8, 2);
  assert.deepEqual(replayRound(O, r.moves), r);
  const u = undo(r);
  assert.deepEqual(u.moves, [4, 0, 8]);
  assert.equal(u.cells[2], null);
  assert.equal(u.turn, X);
});

test('undoing a winning move reopens the round', () => {
  const r = playAll(createRound(), 0, 3, 1, 4, 2);
  const u = undo(r);
  assert.equal(u.winner, null);
  assert.equal(isLegal(u, 2), true);
});

test('replay stops at the first illegal move', () => {
  const r = replayRound(X, [4, 4, 0]);
  assert.deepEqual(r.moves, [4]);
});

test('play does not mutate the round it is given', () => {
  const r = createRound();
  const snapshot = JSON.stringify(r);
  play(r, 0);
  assert.equal(JSON.stringify(r), snapshot);
});
