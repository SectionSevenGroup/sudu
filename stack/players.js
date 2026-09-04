(() => {
  const form = document.querySelector('#stack-player-form');
  const input = document.querySelector('#stack-player-input');
  const list = document.querySelector('#stack-player-list');
  const moveCount = document.querySelector('#move-count');
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

  function render() {
    list.replaceChildren();

    players.forEach((name, index) => {
      const item = document.createElement('li');
      item.className = 'stack-player';
      item.textContent = name;
      item.classList.toggle('is-active', !gameOver && index === activeIndex);
      if (!gameOver && index === activeIndex) item.setAttribute('aria-current', 'true');
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

  function handlePlacement(event) {
    if (gameOver) return;
    const nextMoves = event.detail.moves;
    if (!Number.isInteger(nextMoves) || nextMoves <= handledMoves) return;
    handledMoves = nextMoves;
    completeSuccessfulTurn();
  }

  function markTurnStart() {
    if (gameOver || !players.length || turnInProgress) return;
    turnOwnerIndex = activeIndex;
    turnInProgress = true;
  }

  function showResult() {
    if (!result || !resultName || !resultState) return;

    if (!players.length) {
      result.hidden = true;
      return;
    }

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
    gameOver = true;

    if (players.length) {
      if (turnInProgress && turnOwnerIndex != null) {
        // The player physically manipulating the tower when sustained failure
        // was confirmed loses. The last completed player wins.
        loserIndex = turnOwnerIndex;
        winnerIndex = lastSuccessfulIndex;
      } else {
        // If the collapse is confirmed during settling after a completed move,
        // that last mover loses and the successful player before them wins.
        loserIndex = lastSuccessfulIndex ?? activeIndex;
        winnerIndex = previousSuccessfulIndex;
      }

      if (players.length > 1 && winnerIndex == null && loserIndex != null) {
        winnerIndex = (loserIndex - 1 + players.length) % players.length;
      }

      if (winnerIndex === loserIndex) winnerIndex = null;
    }

    if (handledMoves > 0) moveCount.textContent = scoreLabel(handledMoves);

    turnInProgress = false;
    turnOwnerIndex = null;
    document.body.classList.add('stack-game-over');
    showResult();
    render();
  }

  function resetGameState() {
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
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    addPlayer(input.value);
  });

  window.addEventListener('stack:turnstart', markTurnStart);
  window.addEventListener('stack:placed', handlePlacement);
  window.addEventListener('stack:gamecollapse', endGame);
  window.addEventListener('stack:reset', resetGameState);

  render();
})();
