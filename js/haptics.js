// Subtle haptic feedback for touch interactions.
//
// Android only in practice: iOS Safari has never shipped the Vibration API, so
// tick() returns at the first guard there and nothing else about the page
// changes. Nothing on the site may depend on a tick actually firing.

var lastTick = 0;

// A held arrow or a run of fast swipes can drive an interaction faster than
// separate buzzes read as separate, so at most one tick per 120ms.
var MIN_GAP_MS = 120;

export function tick(ms = 10) {
  if (!('vibrate' in navigator)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // localStorage throws rather than returning null when site data is blocked,
  // and this must never throw into the interaction handler that called it.
  try {
    if (localStorage.getItem('sudu-haptics') === 'off') return;
  } catch (e) {}
  var now = Date.now();
  if (now - lastTick < MIN_GAP_MS) return;
  lastTick = now;
  navigator.vibrate(ms);
}

// The page components are plain scripts rather than modules, so they reach
// tick() through the window instead of importing it.
window.suduHaptics = { tick: tick };
