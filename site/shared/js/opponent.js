// The "Opponent" choice in a game's New game/match dialog, and the player
// pills' names when one side is the bot.

const CHOICES = [
  ['human', 'A friend', 'Two players taking turns on this screen.'],
  ['easy', 'Bot · easy', 'Looks one move ahead, and sometimes slips.'],
  ['hard', 'Bot · hard', 'Thinks several moves ahead.'],
];

/** Adds the Opponent radio group to `form`, above its buttons. Read it as form.elements.opponent.value. */
export function addOpponentChoice(form, human) {
  const set = document.createElement('fieldset');
  set.innerHTML = `<legend>Opponent</legend>${CHOICES.map(([value, name, about], i) => `
    <label class="choice">
      <input type="radio" name="opponent" value="${value}"${i ? '' : ' checked'}>
      <span><strong>${name}</strong><small>${i ? `You play ${human}. ${about}` : about}</small></span>
    </label>`).join('')}`;
  form.querySelector('.sheet-actions').before(set);
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
