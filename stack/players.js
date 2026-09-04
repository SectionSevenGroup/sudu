(() => {
  const form = document.querySelector('#stack-player-form');
  const input = document.querySelector('#stack-player-input');
  const list = document.querySelector('#stack-player-list');
  const moveCount = document.querySelector('#move-count');
  const reset = document.querySelector('#again');

  if (!form || !input || !list || !moveCount) return;

  const MAX_PLAYERS = 4;
  const players = [];
  let activeIndex = 0;
  let lastMoves = 0;

  function render() {
    list.replaceChildren();

    players.forEach((name, index) => {
      const item = document.createElement('li');
      item.className = 'stack-player';
      item.textContent = name;
      item.classList.toggle('is-active', index === activeIndex);
      list.append(item);
    });

    form.classList.toggle('is-full', players.length >= MAX_PLAYERS);
  }

  function addPlayer(name) {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    if (!cleaned || players.length >= MAX_PLAYERS) return;
    players.push(cleaned);
    if (players.length === 1) activeIndex = 0;
    input.value = '';
    render();
    if (players.length < MAX_PLAYERS) input.focus({ preventScroll: true });
  }

  function advanceTurn() {
    if (players.length < 2) return;
    activeIndex = (activeIndex + 1) % players.length;
    render();
  }

  function resetTurn() {
    activeIndex = 0;
    lastMoves = 0;
    render();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    addPlayer(input.value);
  });

  const moveObserver = new MutationObserver(() => {
    const nextMoves = Number.parseInt(moveCount.textContent, 10) || 0;

    if (nextMoves === 0) {
      lastMoves = 0;
      return;
    }

    if (nextMoves > lastMoves) {
      for (let move = lastMoves; move < nextMoves; move++) advanceTurn();
    }
    lastMoves = nextMoves;
  });

  moveObserver.observe(moveCount, { childList: true, characterData: true, subtree: true });
  reset?.addEventListener('click', () => requestAnimationFrame(resetTurn));

  render();
})();
