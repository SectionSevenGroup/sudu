(() => {
  const stage = document.querySelector('#stack-stage');
  const nameInput = document.querySelector('#stack-player-input');
  if (!stage) return;

  const mobileViewport = matchMedia('(max-width: 760px)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  if (!mobileViewport.matches && !coarsePointer.matches) return;

  document.documentElement.classList.add('stack-mobile');

  const touches = new Map();
  let pinching = false;
  let lastPinchDistance = 0;
  let cameraPrimed = false;
  let cancellingStackPointer = false;

  function canvas() {
    return stage.querySelector('canvas');
  }

  function touchDistance() {
    const points = Array.from(touches.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function cancelStackPointer(pointerId, point) {
    const target = canvas();
    if (!target || typeof PointerEvent !== 'function') return;
    cancellingStackPointer = true;
    target.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX: point.x,
      clientY: point.y
    }));
    cancellingStackPointer = false;
  }

  function zoomByPixels(delta) {
    const target = canvas();
    if (!target || typeof WheelEvent !== 'function') return;
    target.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: delta
    }));
  }

  function primeMobileCamera() {
    if (cameraPrimed || !mobileViewport.matches || !canvas()) return;
    cameraPrimed = true;
    // Bring the portrait tower one deliberate step closer than desktop while
    // retaining the same lens and physical perspective.
    requestAnimationFrame(() => zoomByPixels(-92));
  }

  function watchForCanvas() {
    if (canvas()) {
      primeMobileCamera();
      return;
    }
    const observer = new MutationObserver(() => {
      if (!canvas()) return;
      observer.disconnect();
      primeMobileCamera();
    });
    observer.observe(stage, { childList: true });
  }

  stage.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (touches.size === 2) {
      pinching = true;
      lastPinchDistance = touchDistance();
      // The first finger may already own a block or orbit gesture. Cancel that
      // hand cleanly before the two-finger camera gesture takes over.
      for (const [pointerId, point] of touches) cancelStackPointer(pointerId, point);
      event.preventDefault();
      event.stopPropagation();
    } else if (pinching) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true, passive: false });

  stage.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinching || touches.size < 2) return;

    event.preventDefault();
    event.stopPropagation();

    const distance = touchDistance();
    if (!distance || !lastPinchDistance) {
      lastPinchDistance = distance;
      return;
    }

    // Fingers apart = zoom in. Fingers together = zoom out. Feed the existing
    // camera path so desktop wheel and mobile pinch share exactly one zoom law.
    const delta = (lastPinchDistance - distance) * 1.35;
    lastPinchDistance = distance;
    if (Math.abs(delta) > .15) zoomByPixels(delta);
  }, { capture: true, passive: false });

  function finishTouch(event) {
    if (event.pointerType !== 'touch' || cancellingStackPointer) return;
    const wasPinching = pinching;
    touches.delete(event.pointerId);
    if (touches.size < 2) {
      pinching = false;
      lastPinchDistance = 0;
    }
    if (wasPinching) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  stage.addEventListener('pointerup', finishTouch, { capture: true, passive: false });
  stage.addEventListener('pointercancel', finishTouch, { capture: true, passive: false });

  nameInput?.addEventListener('focus', () => document.body.classList.add('stack-name-entry'));
  nameInput?.addEventListener('blur', () => document.body.classList.remove('stack-name-entry'));

  addEventListener('orientationchange', () => {
    document.body.classList.remove('stack-name-entry');
  }, { passive: true });

  watchForCanvas();
})();
