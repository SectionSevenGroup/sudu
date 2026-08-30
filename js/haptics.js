// Subtle haptic feedback for touch interactions.
//
// Android only in practice: iOS Safari has never shipped the Vibration API, so
// tick() returns at the first guard there and nothing else about the page
// changes. Nothing on the site may depend on a tick actually firing.

var lastTick = 0;

// A control tapped in quick succession can be driven faster than separate
// buzzes read as separate, so at most one tick per 120ms.
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
// tick() through the window instead of importing it. contact.html calls it
// directly on submit, which is the one interaction not delegated below.
window.suduHaptics = { tick: tick };

// One delegated listener rather than per-control binding, so the controls the
// DC runtime rebuilds on every Turbo visit stay covered without rebinding.
// Most specific match wins and returns, so a single tap never ticks twice.
var TARGETS = [
  ['#trackNext', 8],                       // next track
  ['#dmSwatches button', 8],               // theme picker
  ['#audioToggle', 10],                    // music on / off
];

if (!window.__suduHapticsWired) {
  window.__suduHapticsWired = true;
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    for (var i = 0; i < TARGETS.length; i++) {
      if (e.target.closest(TARGETS[i][0])) { tick(TARGETS[i][1]); return; }
    }
  });
}
