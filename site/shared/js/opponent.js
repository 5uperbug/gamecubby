// The New game/match dialog as a short wizard (Opponent first, then the
// game's own options, then Start), and the player pills' names when one side
// is the bot.

const CHOICES = [
  ['human', 'A friend', 'Two players taking turns on this screen.'],
  ['easy', 'Bot · easy', 'Looks one move ahead, and sometimes slips.'],
  ['hard', 'Bot · hard', 'Thinks several moves ahead.'],
];

/** Adds the Opponent radio group to `form`, above its buttons, and returns it. */
function addOpponentChoice(form, human) {
  const set = document.createElement('fieldset');
  set.innerHTML = `<legend>Opponent</legend>${CHOICES.map(([value, name, about], i) => `
    <label class="choice">
      <input type="radio" name="opponent" value="${value}"${i ? '' : ' checked'}>
      <span><strong>${name}</strong><small>${i ? `You play ${human}. ${about}` : about}</small></span>
    </label>`).join('')}`;
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
 * step 2 holds everything the form already had (the game's options and notes).
 * A game with no options of its own gets a single step: Opponent, then Start.
 * The Start button keeps value="start", so the game reads the form exactly
 * as before: form.elements.opponent.value plus its own fields.
 */
export function setupWizard(form, human) {
  const title = form.querySelector('h2');
  const actions = form.querySelector('.sheet-actions');
  const rest = [...form.children].filter((el) => el !== title && el !== actions);
  const opponent = addOpponentChoice(form, human);

  if (!rest.some((el) => el.matches('fieldset, .toggle'))) {
    actions.before(...rest); // one step: any note goes under the choice
    return;
  }

  const label = document.createElement('p');
  label.className = 'wizard-label';
  title.before(label);
  const steps = [opponent, rest].map((parts) => {
    const step = document.createElement('div');
    step.className = 'wizard-step';
    step.append(...[parts].flat());
    actions.before(step);
    return step;
  });

  const cancel = actions.querySelector('[value="cancel"]');
  const start = actions.querySelector('[value="start"]');
  const back = button('Back');
  const next = button('Next', true);
  cancel.after(back);
  start.before(next);

  let at = 0;
  const go = (n, focus = true) => {
    at = n;
    steps.forEach((step, i) => { step.hidden = i !== n; });
    cancel.hidden = n !== 0;
    next.hidden = n !== 0;
    back.hidden = n !== 1;
    start.hidden = n !== 1;
    label.textContent = `Step ${n + 1} of 2`;
    if (focus) (steps[n].querySelector('input:checked') ?? steps[n].querySelector('input, button'))?.focus();
  };
  next.addEventListener('click', () => go(1));
  back.addEventListener('click', () => go(0));
  // Enter in a field moves on rather than hitting the first (possibly hidden) submit button.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    (at === 0 ? next : start).click();
  });
  form.closest('dialog').addEventListener('close', () => go(0, false));
  go(0, false);
}

/** Names the pills "You" and "Bot" when `botSide` is set, and restores the page's names when it isn't. */
export function labelPlayers(botSide) {
  for (const pill of document.querySelectorAll('.player[data-player]')) {
    const name = pill.querySelector('.player-name');
    name.dataset.name ??= name.textContent;
    if (!botSide) name.textContent = name.dataset.name;
    else name.textContent = pill.dataset.player === botSide ? 'Bot' : 'You';
  }
}
