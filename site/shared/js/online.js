// Online friend play, the part every game shares: the room dialog (create:
// show a code; join: type one), the connection bar under the scores, and
// rejoining after a refresh. The game keeps its own rules and state and talks
// to this through a few callbacks.
//
// The host (whoever created the room) owns the match: it flips a coin for
// sides, picks the options, and sends its whole state on every (re)connect
// and new round. The guest applies that state through the game's own
// loadMatch validation. Moves go both ways and are replayed through isLegal.

import {
  CODE_LENGTH, cleanCode, isCode, makeCode, openRoom,
} from './net.js';
import { openDialog, shake } from './effects.js';

const JOIN_TIMEOUT = 15000;
const NO_ROUTE = 'Found the room, but your two networks couldn’t connect directly. Try another network (say, mobile data), or play the bot.';

/**
 * @param {Object} o
 * @param {string} o.game              the game's slug, which also namespaces rooms
 * @param {string[]} o.marks           the two sides, e.g. ['X', 'O']
 * @param {() => any} o.begin          start a fresh online match (board cleared)
 * @param {(opponent: string) => any} o.end  leave online play for this opponent
 * @param {() => object} o.snapshot    the host's match, in the game's saved shape
 * @param {(state: object) => any} o.onSync  the guest applies the host's match
 * @param {(move: any) => any} o.onMove      the friend played `move`
 * @param {() => any} o.onChange       connection state changed: refresh the UI
 */
export function createOnline({
  game, marks, begin, end, snapshot, onSync, onMove, onChange,
}) {
  const key = `gamecubby:${game}:online`;
  const s = {
    room: null, code: '', host: false, mine: null, connected: false, synced: false, everJoined: false,
  };
  let joinTimer = 0;

  const remember = () => {
    try { sessionStorage.setItem(key, JSON.stringify({ code: s.code, host: s.host, mine: s.mine })); } catch { /* private mode */ }
  };
  const forget = () => {
    try { sessionStorage.removeItem(key); } catch { /* private mode */ }
  };
  const recall = () => {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
  };

  // ------------------------------------------------------------ dialog

  const dlg = document.createElement('dialog');
  dlg.className = 'sheet room-sheet';
  dlg.setAttribute('aria-labelledby', `${game}-room-title`);
  dlg.innerHTML = `
    <form method="dialog">
      <h2 id="${game}-room-title">Play online</h2>
      <div class="room-create">
        <p class="sheet-text">Send this code to your friend. They choose <strong>Online friend → Join a friend’s room</strong>.</p>
        <p class="room-code"></p>
        <div class="room-links">
          <button type="button" class="btn" data-act="copy">Copy</button>
          <button type="button" class="btn" data-act="share">Share</button>
        </div>
      </div>
      <label class="room-join">
        <span class="sheet-text">Room code from your friend</span>
        <input name="code" class="room-input" autocomplete="off" autocapitalize="characters" spellcheck="false"
          inputmode="text" maxlength="${CODE_LENGTH + 2}" placeholder="K7Q2">
      </label>
      <p class="room-status" aria-live="polite"></p>
      <div class="sheet-actions">
        <button class="btn" value="cancel">Cancel</button>
        <button type="button" class="btn primary" data-act="join">Join</button>
      </div>
    </form>`;
  document.body.append(dlg);
  const $d = (sel) => dlg.querySelector(sel);
  const input = $d('.room-input');
  const joinBtn = $d('[data-act="join"]');
  const shareBtn = $d('[data-act="share"]');
  shareBtn.hidden = !navigator.share;

  const setStatus = (text, busy = false, error = false) => {
    const node = $d('.room-status');
    node.textContent = text;
    node.classList.toggle('busy', busy);
    node.classList.toggle('error', error);
  };

  const gameName = () => document.querySelector('.page-title-text')?.textContent.trim() ?? 'Game Cubby';
  const link = () => `${location.origin}${location.pathname}#join=${s.code}`;
  const invite = () => `Join me in ${gameName()} on Game Cubby. Room code: ${s.code}\n${link()}`;

  $d('[data-act="copy"]').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(invite());
      e.target.textContent = 'Copied';
      setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
    } catch {
      shake(e.target);
    }
  });
  shareBtn.addEventListener('click', () => {
    navigator.share({ title: gameName(), text: invite() }).catch(() => {});
  });

  function showCreate() {
    $d('.room-create').hidden = false;
    $d('.room-join').hidden = true;
    joinBtn.hidden = true;
    const code = $d('.room-code');
    code.textContent = s.code;
    code.setAttribute('aria-label', `Room code ${[...s.code].join(' ')}`);
    setStatus('Waiting for your friend to join…', true);
  }

  function showJoin(code = '') {
    $d('.room-create').hidden = true;
    $d('.room-join').hidden = false;
    joinBtn.hidden = false;
    joinBtn.disabled = false;
    input.disabled = false;
    input.value = code;
    setStatus('');
  }

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    joinBtn.click();
  });
  joinBtn.addEventListener('click', () => {
    const code = cleanCode(input.value);
    if (!isCode(code)) {
      setStatus(`A room code is ${CODE_LENGTH} letters and digits.`, false, true);
      shake(input);
      input.focus();
      return;
    }
    join(code);
  });

  const show = () => {
    dlg.returnValue = ''; // Escape keeps the last value otherwise
    openDialog(dlg);
  };

  // Closing the dialog before the friend is here means giving up on the room.
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'joined' || dlg.returnValue === 'left' || ready()) return;
    leave();
    end('human');
  });

  // ---------------------------------------------------------------- bar

  const bar = document.createElement('div');
  bar.className = 'online-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <span class="online-dot" aria-hidden="true"></span>
    <span class="online-text"></span>
    <button type="button" class="link-btn" data-act="bot">Play the bot</button>
    <button type="button" class="link-btn" data-act="leave">Leave</button>`;
  document.querySelector('#hint')?.before(bar);
  bar.querySelector('[data-act="bot"]').addEventListener('click', () => { leave(); end('easy'); });
  bar.querySelector('[data-act="leave"]').addEventListener('click', () => { leave(); end('human'); });

  function paintBar() {
    bar.hidden = !s.room;
    if (!s.room) return;
    const up = s.connected && ready();
    bar.classList.toggle('up', up);
    bar.querySelector('.online-text').textContent = up ? `Online · room ${s.code}` : `Room ${s.code} · ${s.everJoined ? 'reconnecting…' : 'waiting…'}`;
    bar.querySelector('[data-act="bot"]').hidden = up || !s.everJoined;
  }

  // ------------------------------------------------------------ connection

  const ready = () => s.connected && (s.host || s.synced);

  function changed() {
    paintBar();
    onChange();
  }

  function sendSync() {
    if (s.host && s.connected) {
      s.room.send({ t: 'sync', hostMark: s.mine, state: snapshot() });
    }
  }

  async function connect() {
    const placeholder = s.room;
    const room = await openRoom(game, s.code, {
      onPeer(up) {
        s.connected = up;
        if (up) {
          s.everJoined = true;
          sendSync();
          if (s.host && dlg.open) dlg.close('joined');
        }
        changed();
      },
      onMessage(msg) {
        if (msg.t === 'move') {
          if (ready()) onMove(msg.m);
          return;
        }
        if (s.host || !marks.includes(msg.hostMark)) return;
        s.mine = marks.find((m) => m !== msg.hostMark);
        s.synced = true;
        clearTimeout(joinTimer);
        remember();
        if (dlg.open) dlg.close('joined');
        Promise.resolve(onSync(msg.state)).then(changed);
      },
      // The friend was found, but no direct route between the two networks
      // (strict NAT, no TURN relay).
      onError() {
        if (!s.host && !s.synced) fail(NO_ROUTE);
        else if (s.host && !s.everJoined) setStatus(NO_ROUTE, false, true);
      },
    });
    // Left (or started another room) while the relays were loading.
    if (s.room === placeholder) s.room = room;
    else room.leave();
  }

  function fail(why = 'No room with that code. Check it, and that your friend still has the room open.') {
    clearTimeout(joinTimer);
    s.room?.leave();
    Object.assign(s, { room: null, connected: false });
    if (!dlg.open) show();
    showJoin(s.code);
    setStatus(why, false, true);
    shake(input);
    changed();
  }

  async function join(code) {
    Object.assign(s, {
      code, host: false, mine: null, connected: false, synced: false, everJoined: false,
    });
    input.disabled = true;
    joinBtn.disabled = true;
    setStatus('Connecting…', true);
    s.room = { send() {}, leave() {} }; // placeholder until the relays answer
    await begin();
    clearTimeout(joinTimer);
    joinTimer = setTimeout(() => { if (!s.synced) fail(); }, JOIN_TIMEOUT);
    try {
      await connect();
    } catch {
      fail('Couldn’t reach the matchmaking relays. Check your connection and try again.');
    }
  }

  async function create() {
    Object.assign(s, {
      code: makeCode(), host: true, mine: marks[Math.random() < 0.5 ? 0 : 1], connected: false, synced: false, everJoined: false,
    });
    s.room = { send() {}, leave() {} };
    remember();
    await begin();
    showCreate();
    show();
    changed();
    try {
      await connect();
    } catch {
      setStatus('Couldn’t reach the matchmaking relays. Check your connection and try again.', false, true);
    }
  }

  function leave() {
    clearTimeout(joinTimer);
    s.room?.leave();
    Object.assign(s, {
      room: null, code: '', host: false, mine: null, connected: false, synced: false, everJoined: false,
    });
    forget();
    if (dlg.open) dlg.close('left');
    paintBar();
  }

  return {
    get active() { return Boolean(s.room); },
    get ready() { return ready(); },
    get host() { return s.host; },
    get mine() { return s.mine; },
    get theirs() { return s.mine && marks.find((m) => m !== s.mine); },

    /** From the wizard: 'create' a room, or open the dialog to 'join' one. */
    start(mode) {
      leave();
      if (mode === 'create') return create();
      showJoin();
      show();
      input.focus();
      return undefined;
    },

    /**
     * On page load: rejoin the room this tab was in before a refresh, or
     * follow a #join=CODE link. Returns true if it took over the start.
     * `rejoinable` is whether the saved match is still an online one.
     */
    resume(rejoinable) {
      const hash = /^#join=([^&]+)/.exec(location.hash);
      if (hash) {
        history.replaceState(null, '', location.pathname + location.search);
        showJoin(cleanCode(decodeURIComponent(hash[1])));
        show();
        // After the page's boot has claimed the board, so begin() waits its turn.
        setTimeout(() => joinBtn.click());
        return true;
      }
      const saved = recall();
      if (!rejoinable || !saved || !isCode(String(saved.code)) || (saved.host && !marks.includes(saved.mine))) return false;
      Object.assign(s, {
        code: saved.code, host: Boolean(saved.host), mine: saved.host ? saved.mine : null, connected: false, synced: false, everJoined: true,
      });
      s.room = { send() {}, leave() {} };
      changed();
      connect().catch(() => {});
      return true;
    },

    /** Tells the friend about a move this side just made. */
    send(move) {
      if (ready()) s.room.send({ t: 'move', m: move });
    },

    /** Host only: sends the whole match, e.g. after starting a new round. */
    sync: sendSync,

    leave,

    /** Text for the hint line while the game can't be played, else null. */
    hint() {
      if (!s.room) return 'Not in a room. Start a new match to play online again.';
      if (!s.everJoined) return s.host ? `Room ${s.code}: waiting for your friend to join…` : 'Connecting to the room…';
      if (!s.connected) return 'Your friend disconnected. Waiting for them to come back…';
      if (!ready()) return 'Getting the board from your friend…';
      return null;
    },
  };
}
