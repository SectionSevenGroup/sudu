(() => {
  const intro = document.querySelector('#stack-intro');
  const help = document.querySelector('#stack-help');
  const stage = document.querySelector('#stack-stage');
  const cues = Array.from(document.querySelectorAll('[data-stack-cue]'));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!intro || !stage || cues.length !== 3) return;

  const phaseMs = reducedMotion ? 900 : 1650;
  let timers = [];
  let playing = false;
  let initialPlayed = false;

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function showCue(index) {
    cues.forEach((cue, cueIndex) => cue.classList.toggle('is-active', cueIndex === index));
  }

  function closeIntro() {
    if (!playing) return;
    clearTimers();
    playing = false;
    cues.forEach(cue => cue.classList.remove('is-active'));
    intro.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('stack-intro-open');
    stage.removeAttribute('inert');
    stage.focus({ preventScroll: true });
  }

  function openIntro() {
    clearTimers();
    playing = true;
    intro.setAttribute('aria-hidden', 'false');
    document.body.classList.add('stack-intro-open');
    stage.setAttribute('inert', '');
    showCue(0);

    timers.push(setTimeout(() => showCue(1), phaseMs));
    timers.push(setTimeout(() => showCue(2), phaseMs * 2));
    timers.push(setTimeout(closeIntro, phaseMs * 3));
  }

  function playInitialWhenReady() {
    if (initialPlayed) return;
    if (stage.querySelector('canvas')) {
      initialPlayed = true;
      requestAnimationFrame(() => requestAnimationFrame(openIntro));
      return;
    }

    const observer = new MutationObserver(() => {
      if (!stage.querySelector('canvas')) return;
      observer.disconnect();
      if (initialPlayed) return;
      initialPlayed = true;
      requestAnimationFrame(() => requestAnimationFrame(openIntro));
    });
    observer.observe(stage, { childList: true });
  }

  help?.addEventListener('click', () => {
    if (playing) closeIntro();
    requestAnimationFrame(openIntro);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && playing) closeIntro();
  });

  playInitialWhenReady();
})();
