// Background music player for sudu.studio.
// A small speaker toggle (#audioToggle) sits next to the dark-mode dot in the
// header. Off by default; the choice persists across pages (localStorage), and
// the playing position carries across page loads within a visit
// (sessionStorage). Add tracks to TRACKS to extend the playlist.
(function () {
  if (window.__suduAudioWired) return;
  window.__suduAudioWired = true;
  var KEY = 'sudu-audio';
  var POS = 'sudu-audio-pos';
  var TRACKS = ['audio/mf-rothschild-432.mp3'];
  var VOLUME = 0.6;
  var player = null;
  var idx = 0;

  function prefOn() { try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } }
  function setPref(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} }
  function savedPos() { try { return JSON.parse(sessionStorage.getItem(POS) || 'null'); } catch (e) { return null; } }

  function paint() {
    var on = prefOn();
    document.querySelectorAll('#audioToggle').forEach(function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.opacity = on ? '1' : '0.35';
    });
  }

  function ensure() {
    if (player) return player;
    var s = savedPos();
    if (s && s.i >= 0 && s.i < TRACKS.length) idx = s.i;
    player = new Audio(TRACKS[idx]);
    player.volume = VOLUME;
    player.addEventListener('ended', function () {
      idx = (idx + 1) % TRACKS.length;
      player.src = TRACKS[idx];
      player.play().catch(function () {});
    });
    return player;
  }

  function start() {
    var p = ensure();
    var s = savedPos();
    if (s && s.i === idx && s.t > 0) {
      p.addEventListener('loadedmetadata', function () {
        try { p.currentTime = s.t; } catch (e) {}
      }, { once: true });
    }
    return p.play();
  }

  function stop() { if (player) player.pause(); }

  setInterval(function () {
    if (player && !player.paused) {
      try { sessionStorage.setItem(POS, JSON.stringify({ i: idx, t: player.currentTime })); } catch (e) {}
    }
  }, 1000);

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#audioToggle');
    if (!b) return;
    if (prefOn()) { setPref(false); stop(); }
    else { setPref(true); start().catch(function () {}); }
    paint();
  });

  // Music was on when the visitor navigated here: resume. If the browser
  // blocks playback without a gesture, resume on the first interaction.
  function resumeOnce() {
    document.removeEventListener('pointerdown', resumeOnce);
    document.removeEventListener('keydown', resumeOnce);
    if (prefOn()) start().catch(function () {});
  }

  window.addEventListener('DOMContentLoaded', function () {
    paint();
    [400, 1200, 3000].forEach(function (t) { setTimeout(paint, t); });
    if (prefOn()) {
      start().catch(function () {
        document.addEventListener('pointerdown', resumeOnce);
        document.addEventListener('keydown', resumeOnce);
      });
    }
  });
})();
