// A computer opponent for any game whose rules are pure functions. No DOM.
//
// Each game supplies an adapter:
//   moves(s)        legal moves, in whatever shape adapter.play takes
//   play(s, m)      the state after move m
//   turn(s)         who moves next
//   outcome(s, me)  null while the game is on, else 1 (me won), 0 (draw), -1 (me lost)
//   score(s, me)    a guess at how good a live position is for me (bigger is better)
//   depth           how far Hard looks ahead, in moves
//
// Minimax rather than negamax: in some games the same side moves twice in a
// row (a completed box, an opponent who must pass, a mill's removal).

export const OPPONENTS = ['human', 'easy', 'hard'];
export const isBot = (opponent) => opponent === 'easy' || opponent === 'hard';

/** adapter.outcome for games with a `winner` field that is null, a player, or a draw marker. */
export const outcomeOf = (winner, me, draw = 'D') => {
  if (!winner) return null;
  if (winner === draw) return 0;
  return winner === me ? 1 : -1;
};

const WIN = 1e6;
const EASY_BLUNDER = 0.3;

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function search(adapter, s, me, depth, ply, alpha, beta) {
  const result = adapter.outcome(s, me);
  // Sooner wins and later losses score better.
  if (result !== null) return result === 0 ? 0 : result * (WIN - ply);
  if (depth === 0) return adapter.score(s, me);
  const moves = adapter.moves(s);
  if (!moves.length) return adapter.score(s, me);
  const mine = adapter.turn(s) === me;
  let best = mine ? -Infinity : Infinity;
  for (const m of moves) {
    const v = search(adapter, adapter.play(s, m), me, depth - 1, ply + 1, alpha, beta);
    if (mine) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Picks a move for `me`, or null when there is none.
 * ponytail: fixed depth, no time budget; add iterative deepening if Hard is slow on a phone.
 */
export function pickMove(state, adapter, me, level = 'hard', rng = Math.random) {
  const moves = shuffle(adapter.moves(state), rng);
  if (!moves.length) return null;
  if (level === 'easy' && rng() < EASY_BLUNDER) return moves[0];
  const depth = level === 'easy' ? 1 : adapter.depth;
  let best = moves[0];
  let alpha = -Infinity;
  for (const m of moves) {
    const v = search(adapter, adapter.play(state, m), me, depth - 1, 1, alpha, Infinity);
    if (v > alpha) {
      alpha = v;
      best = m;
    }
  }
  return best;
}

/** A short pause so the bot's move doesn't land the instant yours does. */
export const think = (ms = 450) => new Promise((resolve) => { setTimeout(resolve, ms); });
