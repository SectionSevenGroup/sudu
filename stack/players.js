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
  let handledMoves = 0;

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

  function advanceTurn(count = 1) {
    if (players.length < 2) return;
    activeIndex = (activeIndex + count) % players.length;
    render();
  }

  function readMoves() {
    return Number.parseInt(moveCount.textContent, 10) || 0;
  }

  function syncTurns() {
    const nextMoves = readMoves();

    if (nextMoves < handledMoves) {
      handledMoves = nextMoves;
      activeIndex = 0;
      render();
      return;
    }

    if (nextMoves > handledMoves) {
      const completedTurns = nextMoves - handledMoves;
      handledMoves = nextMoves;
      advanceTurn(completedTurns);
    }
  }

  function resetTurn() {
    activeIndex = 0;
    handledMoves = 0;
    render();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    addPlayer(input.value);
  });

  // A successful placement is the only operation that increments #move-count,
  // so this makes turn progression automatic and tied to a completed move.
  const moveObserver = new MutationObserver(syncTurns);
  moveObserver.observe(moveCount, { childList: true, characterData: true, subtree: true });

  // Small fallback for browsers that coalesce text-node mutations.
  setInterval(syncTurns, 120);

  reset?.addEventListener('click', () => requestAnimationFrame(resetTurn));

  render();
})();
