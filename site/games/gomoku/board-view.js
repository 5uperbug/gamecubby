// SVG rendering of the 15×15 board plus its animations. Zooming animates the
// SVG viewBox, so marks and lines stay sharp at any zoom level.

import {
  animate, svg as animeSvg, utils, motion, ms, stag, clearInline, viewBoxAnimator,
} from '../../shared/js/motion.js';
import {
  svgEl as el, createMark, lineThrough, drawStrokes,
} from '../../shared/js/marks.js';
import { fadeIntoClass, shake } from '../../shared/js/effects.js';
import {
  DRAW, SIZE, CELLS, CENTER, rowOf, colOf, cellAt, onBoard,
} from './game.js';

// Geometry in SVG user units.
const C = 20; // cell
const P = 8; // padding around the grid
const VIEW = SIZE * C + P * 2; // the whole board
const WINDOW = 7; // cells across the zoomed view
const MARGIN = 6; // how much of the next cells peeks in around the zoomed view
const INSET = 4.6; // mark inset within its cell
const HOME = { x: 0, y: 0, w: VIEW };
// Dots that help find your way around a big grid, like the star points on a go board.
const GUIDES = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].map(([r, c]) => cellAt(r, c));
const KEY_STEPS = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
};

const cellXY = (i) => [P + colOf(i) * C, P + rowOf(i) * C];
const cellCenter = (i) => cellXY(i).map((v) => v + C / 2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class BoardView {
  /**
   * @param {SVGSVGElement} svg
   * @param {{ onCell: (cell: number, how: 'pointer'|'keyboard') => void }} handlers
   */
  constructor(svg, { onCell }) {
    this.svg = svg;
    this.onCell = onCell;
    this.zoomed = false;
    this.moving = false; // a zoom the app is waiting on is under way
    this.window = null; // top-left cell { r0, c0 } of the zoomed view
    this.pending = null; // { cell, mark, drawing }
    this.cursor = CENTER; // the one cell in the tab order
    this.build();
    this.bindInput();
  }

  // ---------------------------------------------------------------- build

  build() {
    const svg = this.svg;
    svg.replaceChildren();
    this.zoomTo = viewBoxAnimator(svg, HOME);
    this.cellsLayer = el('g', { class: 'cells' }, svg);
    this.gridLayer = el('g', { class: 'grid', 'aria-hidden': 'true' }, svg);
    this.fxLayer = el('g', { class: 'fx', 'aria-hidden': 'true' }, svg);

    this.cells = Array.from({ length: CELLS }, (_, i) => {
      const [x, y] = cellXY(i);
      const cell = el('g', {
        class: 'cell', 'data-cell': i, transform: `translate(${x} ${y})`, role: 'button', tabindex: -1,
      }, this.cellsLayer);
      el('rect', {
        class: 'cell-hit', x: 1.2, y: 1.2, width: C - 2.4, height: C - 2.4, rx: 3.5,
      }, cell);
      if (GUIDES.includes(i)) el('circle', { class: 'guide', cx: C / 2, cy: C / 2, r: 1.5 }, cell);
      el('g', { class: 'slot' }, cell);
      return cell;
    });
    this.cells[this.cursor].setAttribute('tabindex', 0);

    // Lines alternate down and across, so a stagger from the centre starts mid-board.
    const end = P + SIZE * C;
    for (let i = 1; i < SIZE; i++) {
      const p = P + i * C;
      el('path', { d: `M${p} ${P}V${end}` }, this.gridLayer);
      el('path', { d: `M${P} ${p}H${end}` }, this.gridLayer);
    }
    el('path', { class: 'frame', d: `M${P} ${P}H${end}V${end}H${P}Z` }, this.gridLayer);
  }

  bindInput() {
    this.svg.addEventListener('click', (e) => {
      // A click from assistive tech lands on the cell itself; a tap may land between cells.
      const node = e.target.closest?.('.cell');
      const cell = node ? +node.dataset.cell : this.cellAtPoint(e.clientX, e.clientY);
      if (cell !== null) this.onCell(cell, e.detail === 0 ? 'keyboard' : 'pointer');
    });
    // On the HTML parent: Chrome makes an <svg> with a focus listener a Tab stop of its own.
    this.svg.parentElement.addEventListener('focusin', (e) => {
      const node = e.target.closest?.('.cell');
      if (node && this.svg.contains(node)) this.setCursor(+node.dataset.cell);
    });
    this.svg.addEventListener('keydown', (e) => {
      const node = e.target.closest?.('.cell');
      if (!node) return;
      const cell = +node.dataset.cell;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) this.onCell(cell, 'keyboard');
        return;
      }
      const step = KEY_STEPS[e.key];
      if (!step) return;
      e.preventDefault();
      const r = rowOf(cell) + step[0];
      const c = colOf(cell) + step[1];
      if (onBoard(r, c) && !this.moving) this.focusCell(cellAt(r, c));
    });
  }

  /** The cell under a point on screen. A tap just outside the grid counts for the nearest cell. */
  cellAtPoint(clientX, clientY) {
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    const { x, y } = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return cellAt(
      clamp(Math.floor((y - P) / C), 0, SIZE - 1),
      clamp(Math.floor((x - P) / C), 0, SIZE - 1),
    );
  }

  /** On-screen size of one cell, in CSS pixels, with the whole board in view. */
  cellPx() {
    return (this.svg.getBoundingClientRect().width * C) / VIEW;
  }

  // --------------------------------------------------------- cursor, focus

  setCursor(cell) {
    if (cell === this.cursor) return;
    this.cells[this.cursor].setAttribute('tabindex', -1);
    this.cursor = cell;
    this.cells[cell].setAttribute('tabindex', 0);
  }

  focusCell(cell) {
    this.setCursor(cell);
    this.keepVisible(cell);
    this.cells[cell].focus({ preventScroll: true });
  }

  /** Puts keyboard focus back on the board, at the cursor. */
  focus() {
    this.focusCell(this.cursor);
  }

  hasFocus() {
    return this.svg.contains(document.activeElement);
  }

  // ------------------------------------------------------------- sync state

  /** Makes the board match `game` exactly, without animating. */
  sync(game) {
    this.clearPending();
    utils.remove(this.svg.querySelectorAll('.mark, .guide, .fx > *'));
    this.fxLayer.replaceChildren();
    this.svg.classList.remove('over', 'drawn');
    this.cells.forEach((cell, i) => {
      cell.classList.remove('win', 'last');
      clearInline([cell.querySelector('.slot')], 'transform');
      this.setMark(i, game.cells[i]);
    });
    this.setLast(game.moves.at(-1));
    if (game.winner) this.svg.classList.add('over');
    if (game.winner === DRAW) this.svg.classList.add('drawn');
    for (const line of game.lines) {
      this.addWinLine(line, game.winner);
      for (const i of line) this.cells[i].classList.add('win');
    }
  }

  setMark(i, player) {
    const cell = this.cells[i];
    if ((cell.dataset.mark || null) !== player) {
      const slot = cell.querySelector('.slot');
      slot.replaceChildren();
      if (player) slot.appendChild(createMark(player, C, INSET));
    }
    if (player) cell.dataset.mark = player;
    else delete cell.dataset.mark;
    cell.classList.toggle('filled', Boolean(player));
    this.label(i);
  }

  setLast(cell) {
    const old = this.cellsLayer.querySelector('.cell.last');
    if (old) {
      old.classList.remove('last');
      this.label(+old.dataset.cell);
    }
    if (cell === undefined || cell === null) return;
    this.cells[cell].classList.add('last');
    this.label(cell);
  }

  label(i) {
    const cell = this.cells[i];
    const { mark, pending } = cell.dataset;
    let what = 'empty';
    if (mark) what = cell.classList.contains('last') ? `${mark}, last move` : mark;
    else if (pending) what = `${pending}, not confirmed`;
    cell.setAttribute('aria-label', `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}: ${what}`);
  }

  /**
   * What a tap does next: 'place' a mark, 'zoom' in, or nothing (''). While
   * `busy`, assistive tech is told to wait for the board to settle.
   */
  setInput(tap, busy) {
    this.svg.dataset.tap = tap;
    this.svg.setAttribute('aria-busy', String(busy));
  }

  // ----------------------------------------------------------------- zoom

  /** Top-left cell of the zoomed view that best centres `cell`, kept on the board. */
  windowAround(cell) {
    const half = (WINDOW - 1) / 2;
    return {
      r0: clamp(rowOf(cell) - half, 0, SIZE - WINDOW),
      c0: clamp(colOf(cell) - half, 0, SIZE - WINDOW),
    };
  }

  viewOf({ r0, c0 }) {
    return { x: P + c0 * C - MARGIN, y: P + r0 * C - MARGIN, w: WINDOW * C + MARGIN * 2 };
  }

  async zoomIn(cell) {
    this.zoomed = true;
    this.window = this.windowAround(cell);
    this.svg.classList.add('zoomed');
    this.moving = true;
    await this.zoomTo(this.viewOf(this.window), 650);
    this.moving = false;
  }

  async zoomOut() {
    if (!this.zoomed) return;
    this.zoomed = false;
    this.window = null;
    this.svg.classList.remove('zoomed');
    this.moving = true;
    await this.zoomTo(HOME, 600);
    this.moving = false;
  }

  /** Pans the zoomed view just far enough to show `cell` whole. */
  keepVisible(cell) {
    if (!this.zoomed || this.moving) return;
    // The window [start, start + WINDOW - 1] must contain v.
    const fit = (v, start) => clamp(start, v - WINDOW + 1, v);
    const next = { r0: fit(rowOf(cell), this.window.r0), c0: fit(colOf(cell), this.window.c0) };
    if (next.r0 === this.window.r0 && next.c0 === this.window.c0) return;
    this.window = next;
    this.zoomTo(this.viewOf(next), 380);
  }

  // ---------------------------------------------------------- move preview

  showPending(cell, player) {
    this.clearPending();
    const node = this.cells[cell];
    const mark = createMark(player, C, INSET, 'pending');
    node.querySelector('.slot').appendChild(mark);
    node.classList.add('pending');
    node.dataset.pending = player;
    this.label(cell);
    const drawing = drawStrokes([...mark.querySelectorAll('path')], 200);
    this.pending = { cell, mark, drawing };
    animate(mark, { scale: [0.6, 1], duration: ms(380), ease: 'outBack(2)' });
    if (!motion.reduced) {
      animate(mark, {
        opacity: [0.9, 0.45], duration: 750, delay: 380, ease: 'inOutSine', loop: true, alternate: true,
      });
    }
  }

  clearPending() {
    if (!this.pending) return;
    const { cell, mark } = this.pending;
    utils.remove(mark);
    mark.remove();
    this.pending = null;
    this.cells[cell].classList.remove('pending');
    delete this.cells[cell].dataset.pending;
    this.label(cell);
  }

  shakeCell(cell) {
    return shake(this.cells[cell].querySelector('.slot'), 3);
  }

  // ------------------------------------------------------------ move commit

  /** Turns the pending mark into a real one, with a pop. */
  async commit(cell, player) {
    const node = this.cells[cell];
    let mark = this.pending?.cell === cell ? this.pending.mark : null;
    if (mark) {
      // A quick second tap can confirm before the mark has finished drawing.
      this.pending.drawing.complete?.();
      utils.remove(mark);
      mark.classList.remove('pending');
      clearInline([mark], 'opacity', 'transform');
      this.pending = null;
    } else {
      this.clearPending();
      mark = createMark(player, C, INSET);
      node.querySelector('.slot').replaceChildren(mark);
      drawStrokes([...mark.querySelectorAll('path')], 200);
    }
    node.classList.remove('pending');
    delete node.dataset.pending;
    node.dataset.mark = player;
    node.classList.add('filled');
    this.setLast(cell);
    await animate(mark, {
      scale: [1.45, 1], opacity: [0.6, 1], duration: ms(520), ease: 'outElastic(1, .55)',
    });
    clearInline([mark], 'opacity', 'transform');
  }

  // --------------------------------------------------------------- results

  addWinLine(line, player) {
    const ends = [cellCenter(line[0]), cellCenter(line.at(-1))];
    return el('path', { class: `win-line line-${player.toLowerCase()}`, d: lineThrough(ends, 6) }, this.fxLayer);
  }

  async playWin(lines, player) {
    const winners = [...new Set(lines.flat())];
    winners.forEach((i) => this.cells[i].classList.add('win'));
    const marks = winners.map((i) => this.cells[i].querySelector('.mark'));
    const others = [...this.cellsLayer.querySelectorAll('.cell:not(.win) .mark')];
    const paths = lines.map((line) => this.addWinLine(line, player));
    await Promise.all([
      drawStrokes(paths, 480),
      fadeIntoClass(this.svg, 'over', others, 450),
    ]);
    await animate(marks, {
      scale: [1, 1.3, 1], duration: ms(520), delay: stag(70), ease: 'inOutQuad',
    });
    clearInline(marks, 'transform');
  }

  async playDraw() {
    const marks = [...this.cellsLayer.querySelectorAll('.mark')];
    await Promise.all([
      animate(marks, {
        rotate: [0, -12, 9, -4, 0], duration: ms(650), delay: stag(14, { grid: [SIZE, SIZE], from: 'center' }),
        ease: 'inOutSine',
      }),
      fadeIntoClass(this.svg, 'over drawn', marks, 450),
    ]);
    clearInline(marks, 'transform');
  }

  // ------------------------------------------------------- intro and reset

  /** Draws the grid on from the middle, then brings in any marks already played. */
  async intro() {
    const lines = [...this.gridLayer.children];
    const marks = [...this.cellsLayer.querySelectorAll('.mark')];
    const guides = [...this.cellsLayer.querySelectorAll('.guide')];
    const wins = [...this.fxLayer.children];
    for (const n of wins) n.style.opacity = '0';
    await Promise.all([
      animate(animeSvg.createDrawable(lines), {
        draw: ['0 0', '0 1'], duration: ms(560), delay: stag(16, { from: 'center' }), ease: 'inOutQuad',
      }),
      animate(guides, {
        opacity: { from: 0 }, scale: { from: 0 }, duration: ms(420), delay: ms(380), ease: 'outBack(2.4)',
      }),
      marks.length && animate(marks, {
        opacity: { from: 0 }, scale: { from: 0.4 }, duration: ms(420),
        delay: stag(6, { from: 'random', start: ms(300) }), ease: 'outBack(1.8)',
      }),
    ]);
    clearInline([...marks, ...guides], 'opacity', 'transform');
    if (!wins.length) return;
    const drawing = drawStrokes(wins, 420);
    clearInline(wins, 'opacity');
    await drawing;
  }

  /** Wipes the marks away in a diagonal sweep, like an eraser across the page. */
  async sweep() {
    const marks = [...this.cellsLayer.querySelectorAll('.mark')];
    const lines = [...this.fxLayer.children];
    if (motion.reduced || (!marks.length && !lines.length)) return;
    utils.remove([...marks, ...lines]);
    const diagonal = (mark) => {
      const i = +mark.closest('.cell').dataset.cell;
      return rowOf(i) + colOf(i);
    };
    await Promise.all([
      lines.length && animate(lines, { opacity: 0, duration: 220, ease: 'outQuad' }),
      marks.length && animate(marks, {
        opacity: 0, scale: 0.2, rotate: -40, duration: 320, delay: (mark) => diagonal(mark) * 20, ease: 'inBack(1.4)',
      }),
    ]);
  }

  /** Animates the last move away before an undo re-syncs the board. */
  async takeBack(cell) {
    const marks = [...this.cells[cell].querySelectorAll('.mark')];
    const lines = [...this.fxLayer.children];
    if (motion.reduced || (!marks.length && !lines.length)) return;
    utils.remove([...marks, ...lines]);
    await Promise.all([
      marks.length && animate(marks, { opacity: 0, scale: 0.4, duration: 260, ease: 'inBack(1.5)' }),
      lines.length && animate(lines, { opacity: 0, duration: 220, ease: 'outQuad' }),
    ]);
  }
}
