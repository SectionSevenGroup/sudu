(() => {
  const form = document.querySelector('#stack-player-form');
  const input = document.querySelector('#stack-player-input');
  const list = document.querySelector('#stack-player-list');
  const moveCount = document.querySelector('#move-count');
  const reset = document.querySelector('#again');
  const stage = document.querySelector('#stack-stage');
  const result = document.querySelector('#stack-result');
  const resultName = document.querySelector('#stack-result-name');
  const resultState = document.querySelector('#stack-result-state');

  if (!form || !input || !list || !moveCount || !stage) return;

  const MAX_PLAYERS = 4;
  const players = [];
  let activeIndex = 0;
  let handledMoves = 0;
  let lastSuccessfulIndex = null;
  let previousSuccessfulIndex = null;
  let turnOwnerIndex = null;
  let turnInProgress = false;
  let winnerIndex = null;
  let loserIndex = null;
  let gameOver = false;
  let resetting = false;

  function render() {
    list.replaceChildren();

    players.forEach((name, index) => {
      const item = document.createElement('li');
      item.className = 'stack-player';
      item.textContent = name;
      item.classList.toggle('is-active', !gameOver && index === activeIndex);
      item.classList.toggle('is-winner', gameOver && index === winnerIndex);
      item.classList.toggle('is-loser', gameOver && index === loserIndex);
      list.append(item);
    });

    form.classList.toggle('is-full', players.length >= MAX_PLAYERS);
    form.classList.toggle('is-locked', gameOver);
    input.disabled = gameOver || players.length >= MAX_PLAYERS;
    form.querySelector('button')?.toggleAttribute('disabled', gameOver || players.length >= MAX_PLAYERS);
  }

  function addPlayer(name) {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    if (!cleaned || players.length >= MAX_PLAYERS || gameOver) return;
    players.push(cleaned);
    if (players.length === 1) activeIndex = 0;
    input.value = '';
    render();
    if (players.length < MAX_PLAYERS) input.focus({ preventScroll: true });
  }

  function scoreLabel(count) {
    return `${count} ${count === 1 ? 'move' : 'moves'}`;
  }

  function completeSuccessfulTurn() {
    if (!players.length || gameOver) return;

    const mover = turnOwnerIndex ?? activeIndex;
    previousSuccessfulIndex = lastSuccessfulIndex;
    lastSuccessfulIndex = mover;
    activeIndex = players.length > 1 ? (mover + 1) % players.length : mover;
    turnOwnerIndex = null;
    turnInProgress = false;
    render();
  }

  function syncScoreAndTurns() {
    const raw = moveCount.textContent.trim();

    // The score is part of the game record. Collapse may never erase it.
    if (!raw) {
      if (handledMoves > 0 && !resetting) moveCount.textContent = scoreLabel(handledMoves);
      return;
    }

    const nextMoves = Number.parseInt(raw, 10) || 0;

    if (nextMoves < handledMoves) {
      if (resetting) handledMoves = nextMoves;
      else moveCount.textContent = scoreLabel(handledMoves);
      return;
    }

    if (nextMoves > handledMoves) {
      const completedTurns = nextMoves - handledMoves;
      handledMoves = nextMoves;
      for (let i = 0; i < completedTurns; i++) completeSuccessfulTurn();
    }
  }

  function markTurnStart() {
    if (gameOver || !players.length || turnInProgress) return;
    turnOwnerIndex = activeIndex;
    turnInProgress = true;
  }

  function showResult() {
    if (!result || !resultName || !resultState) return;

    if (winnerIndex != null && players[winnerIndex]) {
      resultName.textContent = players[winnerIndex];
      resultState.textContent = 'wins';
    } else if (players.length === 1) {
      resultName.textContent = players[0];
      resultState.textContent = 'tower down';
    } else {
      resultName.textContent = '';
      resultState.textContent = 'game over';
    }

    result.hidden = false;
  }

  function endGame() {
    if (gameOver) return;
    syncScoreAndTurns();
    gameOver = true;

    if (players.length) {
      // If someone has actually begun the next turn, that player caused the
      // collapse. Otherwise the tower failed while the previous placement was
      // settling, so the last successful mover caused it.
      if (turnInProgress && turnOwnerIndex != null) {
        loserIndex = turnOwnerIndex;
        winnerIndex = lastSuccessfulIndex;
      } else {
        loserIndex = lastSuccessfulIndex ?? activeIndex;
        winnerIndex = previousSuccessfulIndex;
      }

      // First-turn collapse has no previous successful move. Keep a singular
      // winner for multiplayer by using the previous player in the turn order.
      if (players.length > 1 && winnerIndex == null && loserIndex != null) {
        winnerIndex = (loserIndex - 1 + players.length) % players.length;
      }

      if (winnerIndex === loserIndex) winnerIndex = null;
    }

    turnInProgress = false;
    turnOwnerIndex = null;
    document.body.classList.add('stack-game-over');
    showResult();
    render();
  }

  function resetGameState() {
    resetting = true;
    gameOver = false;
    activeIndex = 0;
    handledMoves = 0;
    lastSuccessfulIndex = null;
    previousSuccessfulIndex = null;
    turnOwnerIndex = null;
    turnInProgress = false;
    winnerIndex = null;
    loserIndex = null;
    document.body.classList.remove('stack-game-over');
    if (result) result.hidden = true;
    render();
    window.setTimeout(() => {
      resetting = false;
      syncScoreAndTurns();
    }, 180);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    addPlayer(input.value);
  });

  // Bubble phase runs after stack.js has decided whether the pointer actually
  // grabbed a block and applied .is-dragging, so orbiting never starts a turn.
  stage.addEventListener('pointerdown', () => {
    requestAnimationFrame(() => {
      if (stage.classList.contains('is-dragging')) markTurnStart();
    });
  });

  const moveObserver = new MutationObserver(syncScoreAndTurns);
  moveObserver.observe(moveCount, { childList: true, characterData: true, subtree: true });

  window.addEventListener('stack:collapse', endGame);
  reset?.addEventListener('click', resetGameState);

  render();
})();
