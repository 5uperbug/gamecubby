// SVG rendering of the board plus every board animation. Zooming works by
// animating the SVG viewBox, so marks and lines stay sharp at any zoom level.

import {
  animate, stagger, utils, motion, ms, stag, clearInline,
} from '../../shared/js/motion.js';
import {
  svgEl as el, createMark, lineThrough, drawStrokes,
} from '../../shared/js/marks.js';
import { fadeIntoClass, shake } from '../../shared/js/effects.js';
import { X, O, DRAW, POSITION_NAMES } from './game.js';

// Geometry in SVG user units.
const P = 8; // outer padding
const B = 96; // local board size
const G = 14; // gap between local boards
const C = 30; // cell size
const IN = (B - 3 * C) / 2; // local board inner padding
const SIZE = P * 2 + B * 3 + G * 2;
const ZOOM_MARGIN = 9;

const subXY = (b) => [P + (b % 3) * (B + G), P + Math.floor(b / 3) * (B + G)];
const cellXY = (c) => [IN + (c % 3) * C, IN + Math.floor(c / 3) * C];
const subCenter = (b) => subXY(b).map((v) => v + B / 2);
const cellCenter = (c) => cellXY(c).map((v) => v + C / 2);

const boardName = (b) => `${POSITION_NAMES[b].replace(/^./, (s) => s.toUpperCase())} board`;

export class BoardView {
  /**
   * @param {SVGSVGElement} svgEl
   * @param {{ onBoard: (b:number, how:string) => void, onCell: (b:number, c:number, how:string) => void }} handlers
   */
  constructor(svgEl, handlers) {
    this.svg = svgEl;
    this.handlers = handlers;
    this.vb = { x: 0, y: 0, w: SIZE };
    this.mode = 'overview';
    this.active = null;
    this.subs = [];
    this.cells = [];
    this.build();
    this.bindInput();
  }

  // ---------------------------------------------------------------- build

  build() {
    const svg = this.svg;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

    const defs = el('defs', {}, svg);
    const hatch = el('pattern', {
      id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
    }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatch-line' }, hatch);

    this.subsLayer = el('g', { class: 'subs' }, svg);
    this.macroLayer = el('g', { class: 'macro-grid', 'aria-hidden': 'true' }, svg);
    this.fxLayer = el('g', { class: 'fx', 'aria-hidden': 'true' }, svg);

    for (let b = 0; b < 9; b++) {
      const [x, y] = subXY(b);
      const sub = el('g', {
        class: 'sub', 'data-board': b, transform: `translate(${x} ${y})`,
        role: 'button', tabindex: 0, 'aria-label': boardName(b),
      }, this.subsLayer);
      const dim = el('g', { class: 'sub-dim' }, sub);
      const inner = el('g', { class: 'sub-inner' }, dim);
      el('rect', { class: 'sub-bg', width: B, height: B, rx: 7 }, inner);
      const grid = el('g', { class: 'sub-grid' }, inner);
      for (const i of [1, 2]) {
        const p = IN + i * C;
        el('line', { x1: p, y1: IN + 4, x2: p, y2: B - IN - 4 }, grid);
        el('line', { x1: IN + 4, y1: p, x2: B - IN - 4, y2: p }, grid);
      }
      const cellsLayer = el('g', { class: 'cells' }, inner);
      const cells = [];
      for (let c = 0; c < 9; c++) {
        const [cx, cy] = cellXY(c);
        const cell = el('g', {
          class: 'cell', 'data-board': b, 'data-cell': c, transform: `translate(${cx} ${cy})`,
          role: 'button', tabindex: -1,
        }, cellsLayer);
        el('rect', { class: 'cell-hit', x: 1, y: 1, width: C - 2, height: C - 2, rx: 4 }, cell);
        el('g', { class: 'slot' }, cell);
        cells.push(cell);
      }
      const result = el('g', { class: 'sub-result' }, inner);
      const ring = el('rect', { class: 'sub-ring', x: -2.5, y: -2.5, width: B + 5, height: B + 5, rx: 9 }, inner);
      el('rect', { class: 'sub-focus', x: -4, y: -4, width: B + 8, height: B + 8, rx: 10 }, inner);
      this.subs.push({ el: sub, inner, cellsLayer, result, ring });
      this.cells.push(cells);
    }

    for (const i of [1, 2]) {
      const p = P + i * B + (i - 0.5) * G;
      el('path', { d: `M${p} ${P + 2}L${p} ${SIZE - P - 2}` }, this.macroLayer);
      el('path', { d: `M${P + 2} ${p}L${SIZE - P - 2} ${p}` }, this.macroLayer);
    }
  }

  bindInput() {
    const activate = (target, how) => {
      const cell = target.closest('.cell');
      if (cell && this.mode === 'zoom') {
        this.handlers.onCell(+cell.dataset.board, +cell.dataset.cell, how);
        return;
      }
      const sub = target.closest('.sub');
      if (sub && this.mode === 'overview') this.handlers.onBoard(+sub.dataset.board, how);
    };
    this.svg.addEventListener('click', (e) => activate(e.target, 'pointer'));
    this.svg.addEventListener('keydown', (e) => {
      const focused = document.activeElement;
      if (!focused || !this.svg.contains(focused)) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(focused, 'keyboard');
        return;
      }
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
      if (delta === undefined) return;
      e.preventDefault();
      const isCell = focused.classList.contains('cell');
      const index = +(isCell ? focused.dataset.cell : focused.dataset.board);
      const col = index % 3;
      if ((delta === -1 && col === 0) || (delta === 1 && col === 2)) return;
      const next = index + delta;
      if (next < 0 || next > 8) return;
      (isCell ? this.cells[+focused.dataset.board][next] : this.subs[next].el).focus();
    });
  }

  // ------------------------------------------------------------- sync state

  /** Makes the board match `state` exactly, without animating. */
  sync(state) {
    utils.remove(this.svg.querySelectorAll('*'));
    this.fxLayer.replaceChildren();
    for (let b = 0; b < 9; b++) {
      const sub = this.subs[b];
      const outcome = state.boards[b];
      sub.el.classList.remove('won-x', 'won-o', 'drawn', 'won');
      if (outcome === X || outcome === O) sub.el.classList.add('won', `won-${outcome.toLowerCase()}`);
      if (outcome === DRAW) sub.el.classList.add('drawn');
      clearInline([sub.el, sub.inner, sub.cellsLayer, sub.ring], 'opacity', 'transform');
      sub.result.replaceChildren();
      if (outcome === X || outcome === O) {
        const line = state.boardLines[b];
        el('path', { class: `win-line line-${outcome.toLowerCase()}`, d: lineThrough(line.map(cellCenter), 8) }, sub.result);
        sub.result.appendChild(createMark(outcome, B, 16, 'big-mark'));
      }
      for (let c = 0; c < 9; c++) this.setCellMark(b, c, state.cells[b][c]);
    }
    this.setLast(state.history.at(-1));
    if (state.winLine) this.addGameLine(state.winLine, state.winner);
  }

  setCellMark(b, c, player) {
    const cell = this.cells[b][c];
    const slot = cell.querySelector('.slot');
    cell.classList.remove('pending');
    if ((cell.dataset.mark || null) !== player || slot.querySelector('.pending')) {
      slot.replaceChildren();
      if (player) slot.appendChild(createMark(player, C, 8));
    }
    if (player) cell.dataset.mark = player; else delete cell.dataset.mark;
    cell.classList.toggle('filled', Boolean(player));
    this.labelCell(b, c, player);
  }

  labelCell(b, c, player) {
    const what = player ? `taken by ${player}` : 'empty';
    this.cells[b][c].setAttribute('aria-label', `${POSITION_NAMES[c]} cell, ${what}`);
  }

  setLast(move) {
    this.svg.querySelectorAll('.cell.last').forEach((n) => n.classList.remove('last'));
    if (move) this.cells[move.board][move.cell].classList.add('last');
  }

  /** Updates the accessible names of the local boards. */
  labelBoards(state, playable) {
    for (let b = 0; b < 9; b++) {
      const outcome = state.boards[b];
      const parts = [boardName(b)];
      if (outcome === X || outcome === O) parts.push(`won by ${outcome}`);
      if (outcome === DRAW) parts.push('drawn');
      parts.push(playable.includes(b) ? 'available' : 'not available');
      this.subs[b].el.setAttribute('aria-label', parts.join(', '));
    }
  }

  // ------------------------------------------------------------ highlights

  /** Rings the boards the current player may choose and keeps them breathing. */
  highlight(boards, player, { animateIn = true } = {}) {
    const rings = this.subs.map((s) => s.ring);
    utils.remove(rings);
    clearInline(rings, 'opacity', 'transform');
    this.svg.dataset.turn = player ? player.toLowerCase() : '';
    this.subs.forEach((s, b) => s.el.classList.toggle('playable', boards.includes(b)));
    this.svg.classList.toggle('has-playable', boards.length > 0);
    const lit = boards.map((b) => this.subs[b].ring);
    const token = (this.highlightToken = {});
    if (!lit.length) return Promise.resolve();
    const intro = animateIn
      ? animate(lit, {
        opacity: [0, 1], scale: [1.12, 1], duration: ms(420),
        delay: stag(45, { from: 'center' }), ease: 'outBack(1.6)',
      })
      : Promise.resolve();
    if (!motion.reduced) {
      Promise.resolve(intro).then(() => {
        if (this.highlightToken !== token) return;
        animate(lit, { opacity: [1, 0.45], duration: 1100, ease: 'inOutSine', loop: true, alternate: true });
      });
    }
    return intro;
  }

  clearHighlight() {
    this.highlightToken = null;
    const rings = this.subs.map((s) => s.ring);
    utils.remove(rings);
    clearInline(rings, 'opacity', 'transform');
    this.subs.forEach((s) => s.el.classList.remove('playable'));
    this.svg.classList.remove('has-playable');
  }

  // ----------------------------------------------------------------- zoom

  setViewBox() {
    const { x, y, w } = this.vb;
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${w}`);
  }

  setTabStops() {
    this.subs.forEach((s) => s.el.setAttribute('tabindex', this.mode === 'overview' ? 0 : -1));
    this.cells.forEach((row, b) => row.forEach((cell) => {
      cell.setAttribute('tabindex', this.mode === 'zoom' && b === this.active ? 0 : -1);
    }));
  }

  async zoomIn(b) {
    this.clearHighlight();
    this.mode = 'zoom';
    this.active = b;
    this.svg.classList.add('zoomed');
    this.subs.forEach((s, i) => s.el.classList.toggle('active', i === b));
    this.setTabStops();
    const [x, y] = subXY(b);
    const others = this.subs.filter((_, i) => i !== b).map((s) => s.el);
    utils.remove(this.vb);
    await Promise.all([
      animate(this.vb, {
        x: x - ZOOM_MARGIN, y: y - ZOOM_MARGIN, w: B + ZOOM_MARGIN * 2,
        duration: ms(700), ease: 'inOutQuart', onUpdate: () => this.setViewBox(),
      }),
      animate(others, { opacity: 0.14, duration: ms(500), ease: 'outQuad' }),
      animate(this.macroLayer, { opacity: 0, duration: ms(400), ease: 'outQuad' }),
    ]);
    this.setViewBox();
  }

  async zoomOut() {
    if (this.mode === 'overview') return;
    const wasActive = this.active;
    this.mode = 'overview';
    this.active = null;
    this.setTabStops();
    utils.remove(this.vb);
    await Promise.all([
      animate(this.vb, {
        x: 0, y: 0, w: SIZE, duration: ms(650), ease: 'inOutQuart', onUpdate: () => this.setViewBox(),
      }),
      animate(this.subs.map((s) => s.el), { opacity: 1, duration: ms(500), delay: ms(150), ease: 'outQuad' }),
      animate(this.macroLayer, { opacity: 1, duration: ms(500), delay: ms(150), ease: 'outQuad' }),
    ]);
    this.setViewBox();
    clearInline([...this.subs.map((s) => s.el), this.macroLayer], 'opacity');
    this.svg.classList.remove('zoomed');
    this.subs.forEach((s) => s.el.classList.remove('active'));
    return wasActive;
  }

  focusBoard(b) { this.subs[b]?.el.focus(); }

  focusCell(b, c) { this.cells[b]?.[c]?.focus(); }

  // ---------------------------------------------------------- move preview

  showPending(b, c, player) {
    this.clearPending();
    const cell = this.cells[b][c];
    const mark = createMark(player, C, 8, 'pending');
    cell.querySelector('.slot').appendChild(mark);
    cell.classList.add('pending');
    this.pending = { b, c, mark };
    drawStrokes([...mark.querySelectorAll('path')], 200);
    animate(mark, { scale: [0.6, 1], duration: ms(380), ease: 'outBack(2)' });
    if (!motion.reduced) {
      animate(mark, {
        opacity: [0.85, 0.4], duration: 750, delay: 380, ease: 'inOutSine', loop: true, alternate: true,
      });
    }
  }

  clearPending() {
    if (!this.pending) return;
    const { b, c, mark } = this.pending;
    utils.remove([mark, ...mark.querySelectorAll('path')]);
    mark.remove();
    this.cells[b][c].classList.remove('pending');
    this.pending = null;
  }

  shake(b) { return shake(this.subs[b].inner, 4); }

  shakeCell(b, c) { return shake(this.cells[b][c].querySelector('.slot'), 4); }

  // ------------------------------------------------------------ move commit

  /** Turns the pending mark into a real one and plays local-board outcomes. */
  async commit(events) {
    const { board: b, cell: c, player } = events;
    const cell = this.cells[b][c];
    let mark = this.pending && this.pending.b === b && this.pending.c === c ? this.pending.mark : null;
    if (mark) {
      utils.remove([mark, ...mark.querySelectorAll('path')]);
      this.pending = null;
      mark.classList.remove('pending');
      clearInline([mark], 'opacity');
    } else {
      this.clearPending();
      cell.querySelector('.slot').replaceChildren();
      mark = createMark(player, C, 8);
      cell.querySelector('.slot').appendChild(mark);
      drawStrokes([...mark.querySelectorAll('path')], 200);
    }
    cell.classList.remove('pending');
    cell.dataset.mark = player;
    cell.classList.add('filled');
    this.labelCell(b, c, player);
    this.setLast(events);

    await animate(mark, { scale: [1.45, 1], opacity: [0.6, 1], duration: ms(520), ease: 'outElastic(1, .55)' });
    clearInline([mark], 'opacity', 'transform');

    if (events.boardWon) await this.playBoardWin(b, player, events.boardLine);
    else if (events.boardDrawn) await this.playBoardDraw(b);
  }

  async playBoardWin(b, player, line) {
    const sub = this.subs[b];
    const p = player.toLowerCase();
    const lineEl = el('path', { class: `win-line line-${p}`, d: lineThrough(line.map(cellCenter), 8) }, sub.result);
    await drawStrokes([lineEl], 320);
    const big = createMark(player, B, 16, 'big-mark');
    big.style.opacity = '0';
    sub.result.appendChild(big);
    await Promise.all([
      fadeIntoClass(sub.el, `won won-${p}`, [sub.cellsLayer, lineEl], 450),
      (async () => {
        big.style.opacity = '';
        await drawStrokes([...big.querySelectorAll('path')], 380);
      })(),
      animate(sub.inner, { scale: [1, 1.05, 1], duration: ms(600), ease: 'inOutQuad' }),
    ]);
    clearInline([sub.inner, big], 'transform', 'opacity');
  }

  async playBoardDraw(b) {
    const sub = this.subs[b];
    await Promise.all([
      fadeIntoClass(sub.el, 'drawn', [sub.cellsLayer], 450),
      animate(sub.inner, { scale: [1, 0.94, 1], duration: ms(500), ease: 'inOutQuad' }),
    ]);
    clearInline([sub.inner], 'transform');
  }

  // ------------------------------------------------- after-move transitions

  /**
   * Shows where the next player is sent: a frame flies from the cell just
   * played to the matching board (or to the whole board on a free choice).
   */
  async sendTo(fromBoard, fromCell, toBoards, player) {
    if (motion.reduced) return;
    const [sx, sy] = subXY(fromBoard);
    const [cx, cy] = cellXY(fromCell);
    const r = { x: sx + cx + 2, y: sy + cy + 2, w: C - 4, h: C - 4 };
    let to;
    if (toBoards.length === 1) {
      const [tx, ty] = subXY(toBoards[0]);
      to = { x: tx - 2.5, y: ty - 2.5, w: B + 5, h: B + 5 };
    } else {
      to = { x: P - 4, y: P - 4, w: SIZE - 2 * P + 8, h: SIZE - 2 * P + 8 };
    }
    const rect = el('rect', { class: `fly fly-${player.toLowerCase()}`, rx: 6 }, this.fxLayer);
    const set = () => {
      rect.setAttribute('x', r.x);
      rect.setAttribute('y', r.y);
      rect.setAttribute('width', r.w);
      rect.setAttribute('height', r.h);
    };
    set();
    await animate(r, { ...to, duration: 560, ease: 'inOutCubic', onUpdate: set });
    await animate(rect, { opacity: 0, duration: 260, ease: 'outQuad' });
    rect.remove();
  }

  addGameLine(line, player) {
    const p = player.toLowerCase();
    return el('path', { class: `game-line line-${p}`, d: lineThrough(line.map(subCenter), 30) }, this.fxLayer);
  }

  async playGameWin(line, player) {
    const path = this.addGameLine(line, player);
    await drawStrokes([path], 650);
    const inners = line.map((b) => this.subs[b].inner);
    await animate(inners, {
      scale: [1, 1.08, 1], duration: ms(650), delay: stag(110), ease: 'inOutQuad',
      onComplete: () => clearInline(inners, 'transform'),
    });
  }

  async playGameDraw() {
    const inners = this.subs.map((s) => s.inner);
    await animate(inners, {
      opacity: [1, 0.55, 1], scale: [1, 0.96, 1], duration: ms(700),
      delay: stag(50, { grid: [3, 3], from: 'center' }), ease: 'inOutQuad',
      onComplete: () => clearInline(inners, 'transform', 'opacity'),
    });
  }

  // --------------------------------------------------------- intro / reset

  async intro() {
    const inners = this.subs.map((s) => s.inner);
    const lines = [...this.macroLayer.querySelectorAll('path')];
    await Promise.all([
      animate(inners, {
        opacity: [0, 1], scale: [0.6, 1], duration: ms(650),
        delay: stag(70, { grid: [3, 3], from: 'center' }), ease: 'outBack(1.4)',
        onComplete: () => clearInline(inners, 'transform', 'opacity'),
      }),
      drawStrokes(lines, 380),
    ]);
  }

  /** Sweeps every mark off the board. */
  async clearAway() {
    const marks = [...this.svg.querySelectorAll('.cell .mark, .sub-result > *, .fx > *')];
    if (!marks.length || motion.reduced) return;
    utils.remove(marks);
    await animate(marks, {
      opacity: 0, scale: 0.3, duration: 300, delay: stagger(4, { from: 'random' }), ease: 'inQuad',
    });
  }

  /** Animates the marks removed by an undo before the board re-syncs. */
  async takeBack(move, boardChanged) {
    const nodes = [...this.cells[move.board][move.cell].querySelectorAll('.mark')];
    if (boardChanged) nodes.push(...this.subs[move.board].result.children);
    nodes.push(...this.fxLayer.children);
    if (!nodes.length || motion.reduced) return;
    await animate(nodes, { opacity: 0, scale: 0.4, duration: 260, ease: 'inBack(1.5)' });
  }
}
