(() => {
  const intro = document.querySelector('#stack-intro');
  const start = document.querySelector('#stack-start');
  const help = document.querySelector('#stack-help');
  const stage = document.querySelector('#stack-stage');

  if (!intro || !start || !stage) return;

  function openIntro() {
    document.body.classList.add('stack-intro-open');
    intro.classList.add('is-open');
    intro.setAttribute('aria-hidden', 'false');
    stage.setAttribute('inert', '');
    requestAnimationFrame(() => start.focus({ preventScroll: true }));
  }

  function closeIntro() {
    intro.classList.remove('is-open');
    intro.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('stack-intro-open');
    stage.removeAttribute('inert');
    stage.focus({ preventScroll: true });
  }

  start.addEventListener('click', closeIntro);
  help?.addEventListener('click', openIntro);

  intro.addEventListener('pointerdown', event => {
    if (event.target === intro) event.preventDefault();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && intro.classList.contains('is-open')) closeIntro();
  });

  openIntro();
})();
