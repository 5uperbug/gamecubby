// The New game/match dialog as a short wizard (Opponent first, then the
// game's own options, then Start), and the player pills' names when the
// other side is the bot or an online friend.

const CHOICES = [
  ['human', 'A friend', 'Two players taking turns on this screen.'],
  ['easy', 'Bot · easy', 'Looks one move ahead, and sometimes slips.'],
  ['hard', 'Bot · hard', 'Thinks several moves ahead.'],
  ['remote', 'Online friend', 'Play on two devices with a room code. A coin flip picks who goes first.'],
];

const BOTS = ['easy', 'hard'];

/** Adds the Opponent radio group to `form`, above its buttons, and returns it. */
function addOpponentChoice(form, human) {
  const set = document.createElement('fieldset');
  set.innerHTML = `<legend>Opponent</legend>${CHOICES.map(([value, name, about], i) => `
    <label class="choice">
      <input type="radio" name="opponent" value="${value}"${i ? '' : ' checked'}>
      <span><strong>${name}</strong><small>${BOTS.includes(value) ? `You play ${human}. ${about}` : about}</small></span>
    </label>`).join('')}`;
  form.querySelector('.sheet-actions').before(set);
  return set;
}

/** Create or join, shown in step 2 when the opponent is an online friend. */
function addRoomChoice(form) {
  const set = document.createElement('fieldset');
  set.innerHTML = `<legend>Room</legend>
    <label class="choice">
      <input type="radio" name="room" value="create" checked>
      <span><strong>Create a room</strong><small>You pick the options and get a code to send your friend.</small></span>
    </label>
    <label class="choice">
      <input type="radio" name="room" value="join">
      <span><strong>Join a friend’s room</strong><small>Type the code they sent you. Their options apply.</small></span>
    </label>`;
  form.querySelector('.sheet-actions').before(set);
  return set;
}

function button(text, primary) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = primary ? 'btn primary' : 'btn';
  b.textContent = text;
  return b;
}

/**
 * Turns a New game dialog's form into a wizard. Step 1 picks the opponent;
 * step 2 holds the game's own options (if it has any) and, for an online
 * friend, the Create/Join choice. Joining hides the options: the host's apply.
 * A game with no options, against anyone but an online friend, is one step.
 * The Start button keeps value="start", so the game reads the form exactly
 * as before: form.elements.opponent.value (and .room) plus its own fields.
 */
export function setupWizard(form, human) {
  const title = form.querySelector('h2');
  const actions = form.querySelector('.sheet-actions');
  const rest = [...form.children].filter((el) => el !== title && el !== actions);
  const hasOptions = rest.some((el) => el.matches('fieldset, .toggle'));
  const opponent = addOpponentChoice(form, human);
  const room = addRoomChoice(form);
  const remote = () => form.elements.opponent.value === 'remote';
  const twoSteps = () => hasOptions || remote();

  const label = document.createElement('p');
  label.className = 'wizard-label';
  title.before(label);
  // Without options, any note goes under the opponent choice.
  const parts = hasOptions ? [[opponent], [room, ...rest]] : [[opponent, ...rest], [room]];
  const steps = parts.map((els) => {
    const step = document.createElement('div');
    step.className = 'wizard-step';
    step.append(...els);
    actions.before(step);
    return step;
  });

  const cancel = actions.querySelector('[value="cancel"]');
  const start = actions.querySelector('[value="start"]');
  const startText = start.textContent;
  const back = button('Back');
  const next = button('Next', true);
  cancel.after(back);
  start.before(next);

  let at = 0;
  const go = (n, focus = true) => {
    at = n;
    const two = twoSteps();
    const joining = remote() && form.elements.room.value === 'join';
    steps.forEach((step, i) => { step.hidden = i !== n; });
    room.hidden = !remote();
    if (hasOptions) rest.forEach((el) => { el.hidden = joining; });
    cancel.hidden = n !== 0;
    next.hidden = n !== 0 || !two;
    back.hidden = n !== 1;
    start.hidden = n === 0 && two;
    start.textContent = remote() ? (joining ? 'Next' : 'Create room') : startText;
    label.hidden = !two;
    label.textContent = `Step ${n + 1} of 2`;
    if (focus) (steps[n].querySelector('input:checked') ?? steps[n].querySelector('input, button'))?.focus();
  };
  next.addEventListener('click', () => go(1));
  back.addEventListener('click', () => go(0));
  form.addEventListener('change', (e) => {
    if (e.target.name === 'opponent' || e.target.name === 'room') go(at, false);
  });
  // Enter in a field moves on rather than hitting the first (possibly hidden) submit button.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    (at === 0 && twoSteps() ? next : start).click();
  });
  const dialog = form.closest('dialog');
  dialog.addEventListener('close', () => go(0, false));
  // A game sets the opponent radio before opening; match the buttons to it.
  new MutationObserver(() => { if (dialog.open) go(0, false); }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  go(0, false);
}

/**
 * Names the pills "You" and `name` ("Bot", "Friend") when `awaySide` is set,
 * and restores the page's names when it isn't.
 */
export function labelPlayers(awaySide, name = 'Bot') {
  for (const pill of document.querySelectorAll('.player[data-player]')) {
    const el = pill.querySelector('.player-name');
    el.dataset.name ??= el.textContent;
    if (!awaySide) el.textContent = el.dataset.name;
    else el.textContent = pill.dataset.player === awaySide ? name : 'You';
  }
}
