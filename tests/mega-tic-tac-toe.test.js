import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  X, O, DRAW, createGame, applyMove, playableBoards, isLegalMove,
  replay, undo, isGlobalWinStillPossible, boardsWon,
} from '../site/games/mega-tic-tac-toe/game.js';

const play = (state, ...moves) => {
  for (const [b, c] of moves) state = applyMove(state, b, c).state;
  return state;
};

/** Builds a state directly so tests don't depend on long move sequences. */
const withBoards = (rules, setup) => {
  const s = createGame(rules);
  setup(s);
  return s;
};

test('first move can go anywhere', () => {
  const s = createGame();
  assert.deepEqual(playableBoards(s), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(s.turn, X);
});

test('the cell played sends the opponent to the matching board', () => {
  const s = play(createGame(), [4, 2]);
  assert.equal(s.turn, O);
  assert.equal(s.target, 2);
  assert.deepEqual(playableBoards(s), [2]);
  assert.equal(isLegalMove(s, 3, 0), false);
  assert.equal(isLegalMove(s, 2, 0), true);
});

test('cannot play an occupied cell', () => {
  const s = play(createGame(), [4, 4]);
  assert.equal(isLegalMove(s, 4, 4), false);
  assert.throws(() => applyMove(s, 4, 4));
});

test('winning a local board records the winner and the line', () => {
  const s = withBoards({}, (st) => {
    st.cells[0] = [X, X, null, O, O, null, null, null, null];
  });
  const { state, events } = applyMove(s, 0, 2);
  assert.equal(events.boardWon, true);
  assert.deepEqual(events.boardLine, [0, 1, 2]);
  assert.equal(state.boards[0], X);
  assert.deepEqual(state.boardLines[0], [0, 1, 2]);
  assert.equal(boardsWon(state, X), 1);
  assert.equal(state.target, 2);
});

test('classic rules: sent to a won board means free choice', () => {
  const s = withBoards({}, (st) => {
    st.boards[2] = X;
    st.cells[2] = [X, X, X, null, null, null, null, null, null];
    st.target = 2;
    st.turn = O;
  });
  const boards = playableBoards(s);
  assert.equal(boards.includes(2), false);
  assert.equal(boards.length, 8);
});

test('open-boards variant: must still play in a won board with empty cells', () => {
  const s = withBoards({ openBoards: true }, (st) => {
    st.boards[2] = X;
    st.cells[2] = [X, X, X, null, null, null, null, null, null];
    st.target = 2;
    st.turn = O;
  });
  assert.deepEqual(playableBoards(s), [2]);
  const { state, events } = applyMove(s, 2, 3);
  assert.equal(state.boards[2], X, 'winner of a decided board never changes');
  assert.equal(events.boardWon, false);
});

test('open-boards variant: won boards are offered on a free choice', () => {
  const s = withBoards({ openBoards: true }, (st) => {
    st.boards[2] = X;
    st.cells[2] = [X, X, X, null, null, null, null, null, null];
  });
  assert.equal(playableBoards(s).includes(2), true);
});

test('open-boards variant: a full board is never playable', () => {
  const full = [X, O, X, X, O, O, O, X, X];
  const s = withBoards({ openBoards: true }, (st) => {
    st.cells[5] = full.slice();
    st.boards[5] = DRAW;
    st.target = 5;
  });
  assert.equal(playableBoards(s).includes(5), false);
  assert.equal(playableBoards(s).length, 8);
});

test('filling a board without a line marks it drawn', () => {
  const s = withBoards({}, (st) => {
    st.cells[0] = [X, O, X, X, O, O, O, X, null];
    st.turn = X;
  });
  const { state, events } = applyMove(s, 0, 8);
  assert.equal(events.boardDrawn, true);
  assert.equal(state.boards[0], DRAW);
});

test('three local boards in a row wins the game', () => {
  const s = withBoards({}, (st) => {
    st.boards[0] = X;
    st.boards[1] = X;
    st.cells[2] = [X, X, null, O, O, null, null, null, null];
    st.turn = X;
  });
  const { state, events } = applyMove(s, 2, 2);
  assert.equal(events.gameWon, true);
  assert.deepEqual(events.gameLine, [0, 1, 2]);
  assert.equal(state.winner, X);
  assert.deepEqual(playableBoards(state), []);
});

test('game is drawn once no line on the big board can be completed', () => {
  // Only row 6-7-8 (O, O, ?) is still winnable. X taking board 8 kills it.
  const s = withBoards({}, (st) => {
    st.boards = [O, X, X, X, X, O, O, O, null];
    st.cells[8] = [X, X, null, O, O, null, null, null, null];
  });
  assert.equal(isGlobalWinStillPossible(s), true);
  const { state, events } = applyMove(s, 8, 2);
  assert.equal(events.boardWon, true);
  assert.equal(events.gameDrawn, true);
  assert.equal(state.winner, DRAW);
  assert.deepEqual(playableBoards(state), []);
});

test('replay and undo rebuild the same position', () => {
  const moves = [[4, 4], [4, 0], [0, 4], [4, 8], [8, 4]];
  const s = play(createGame({ openBoards: true }), ...moves);
  const r = replay(s.rules, s.history);
  assert.deepEqual(r, s);
  const u = undo(s);
  assert.equal(u.history.length, 4);
  assert.equal(u.turn, X);
  assert.equal(u.cells[8][4], null);
  assert.equal(u.rules.openBoards, true);
});

test('replay stops at the first illegal move', () => {
  const r = replay({}, [{ board: 4, cell: 4 }, { board: 0, cell: 0 }]);
  assert.equal(r.history.length, 1);
});

test('applyMove does not mutate the input state', () => {
  const s = createGame();
  const snapshot = JSON.stringify(s);
  applyMove(s, 0, 0);
  assert.equal(JSON.stringify(s), snapshot);
});

test('random games always terminate with a legal result', () => {
  for (const openBoards of [false, true]) {
    for (let g = 0; g < 300; g++) {
      let s = createGame({ openBoards });
      let guard = 0;
      while (!s.winner) {
        const boards = playableBoards(s);
        assert.ok(boards.length > 0, 'a live game always has a move');
        const b = boards[Math.floor(Math.random() * boards.length)];
        const cells = s.cells[b].map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
        const c = cells[Math.floor(Math.random() * cells.length)];
        s = applyMove(s, b, c).state;
        assert.ok(++guard <= 81);
      }
      assert.ok([X, O, DRAW].includes(s.winner));
    }
  }
});
