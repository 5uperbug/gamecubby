// Online play between two browsers: room codes, the message shapes, and a
// WebRTC data channel through Trystero (signaling over public Nostr relays,
// then peer to peer). No DOM, so the pure parts run under `node --test`.
//
// Messages:
//   { t: 'move', m }                   a move, in whatever shape the game's play() takes
//   { t: 'sync', hostMark, state }     the host's whole match (the game's saved shape)

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
export const CODE_LENGTH = 4;

export function makeCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

/** What someone typed, as a code: upper-cased, spaces and dashes gone. */
export const cleanCode = (text) => String(text ?? '').toUpperCase().replace(/[\s-]/g, '');

export const isCode = (code) => code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));

/** A message from the other browser, or null if it isn't one we send. Legality is the game's job. */
export function parseMessage(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.t === 'move' && data.m !== undefined) return { t: 'move', m: data.m };
  if (data.t === 'sync' && typeof data.hostMark === 'string' && data.state && typeof data.state === 'object') {
    return { t: 'sync', hostMark: data.hostMark, state: data.state };
  }
  return null;
}

/**
 * Joins room `code` for `game`. `onPeer(true|false)` fires when the other
 * player connects or drops; `onMessage(msg)` gets their parsed messages.
 * ponytail: the latest peer to join is "the friend"; a third browser with the
 * code would take over the seat. Fine among friends; add a seat check if not.
 */
export async function openRoom(game, code, { onMessage, onPeer, onError }) {
  const { joinRoom } = await import('../../vendor/trystero/trystero.min.js');
  // The code doubles as the password, so the relays only see encrypted SDP.
  const room = joinRoom({ appId: 'gamecubby', password: code }, `${game}:${code}`, {
    onJoinError: () => onError?.(),
  });
  const channel = room.makeAction('msg');
  let partner = null;
  room.onPeerJoin = (id) => {
    partner = id;
    onPeer(true);
  };
  room.onPeerLeave = (id) => {
    if (id !== partner) return;
    partner = null;
    onPeer(false);
  };
  channel.onMessage = (data, { peerId }) => {
    const msg = peerId === partner && parseMessage(data);
    if (msg) onMessage(msg);
  };
  return {
    send: (msg) => partner && channel.send(msg, { target: partner }).catch(() => {}),
    leave: () => room.leave(),
  };
}
