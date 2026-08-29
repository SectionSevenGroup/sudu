// Background music player for sudu.studio.
// A small equalizer toggle (#audioToggle) sits next to the dark-mode dot in
// the header. Off by default; the choice persists across pages
// (localStorage), and the playing position carries across page loads within a
// visit (sessionStorage). The icon reflects the ACTUAL playback state: dim and
// still when silent, full-strength and gently moving while playing. If the
// browser blocks auto-resume on a new page, the icon stays quiet and playback
// resumes on the first interaction. Add tracks to TRACKS to extend the
// playlist.
(function () {
  if (window.__suduAudioWired) return;
  window.__suduAudioWired = true;
  var KEY = 'sudu-audio';
  var POS = 'sudu-audio-pos';
  var TRACKS = ['audio/mf-rothschild-432.mp3'];
  var VOLUME = 0.6;
  var player = null;
  var idx = 0;

  var css = document.createElement('style');
  css.textContent = '#audioToggle svg rect{transform-box:fill-box;transform-origin:center;transform:scaleY(0.35);transition:transform .35s ease;}' +
    // fallback motion when the live analyser is unavailable
    '#audioToggle[data-playing="true"]:not([data-viz="true"]) svg rect{animation:suduEq 1.15s ease-in-out infinite;}' +
    '#audioToggle[data-playing="true"]:not([data-viz="true"]) svg rect:nth-child(2){animation-duration:0.9s;animation-delay:-0.3s;}' +
    '#audioToggle[data-playing="true"]:not([data-viz="true"]) svg rect:nth-child(3){animation-duration:1.3s;animation-delay:-0.6s;}' +
    '@keyframes suduEq{0%,100%{transform:scaleY(0.3);}50%{transform:scaleY(1);}}' +
    '#audioToggle{position:relative;}#audioToggle::after{content:"";position:absolute;inset:-12px;}';
  document.head.appendChild(css);

  // ---- live visualizer: the bars follow the actual audio ----
  var actx = null, analyser = null, srcNode = null, vizRAF = 0;
  var vizData = null, levels = [0.35, 0.35, 0.35];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setupViz() {
    if (analyser || reduceMotion) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      srcNode = actx.createMediaElementSource(player);
      var an = actx.createAnalyser();
      an.fftSize = 128;
      an.smoothingTimeConstant = 0.7;
      srcNode.connect(an);
      an.connect(actx.destination);
      analyser = an;
      vizData = new Uint8Array(an.frequencyBinCount);
    } catch (e) {
      // never leave the element routed into a dead graph (that would mute it)
      if (srcNode && actx) { try { srcNode.connect(actx.destination); } catch (e2) {} }
      analyser = null;
    }
  }

  function band(from, to) {
    var sum = 0;
    for (var i = from; i < to; i++) sum += vizData[i];
    return sum / ((to - from) * 255);
  }

  function vizFrame() {
    vizRAF = requestAnimationFrame(vizFrame);
    analyser.getByteFrequencyData(vizData);
    // low / mid / high bands, eased toward their targets for smooth motion
    var bands = [band(1, 8), band(8, 24), band(24, 60)];
    var rects = document.querySelectorAll('#audioToggle svg rect');
    for (var i = 0; i < rects.length; i++) {
      var target = Math.min(1, 0.22 + Math.pow(bands[i % 3], 1.35) * 1.15);
      levels[i % 3] += (target - levels[i % 3]) * 0.3;
      rects[i].style.transition = 'none';
      rects[i].style.transform = 'scaleY(' + levels[i % 3].toFixed(3) + ')';
    }
  }

  function vizStart() {
    setupViz();
    if (!analyser) return;
    if (actx.state === 'suspended') actx.resume().catch(function () {});
    document.querySelectorAll('#audioToggle').forEach(function (b) { b.setAttribute('data-viz', 'true'); });
    cancelAnimationFrame(vizRAF);
    vizRAF = requestAnimationFrame(vizFrame);
  }

  function vizStop() {
    cancelAnimationFrame(vizRAF);
    vizRAF = 0;
    document.querySelectorAll('#audioToggle svg rect').forEach(function (r) {
      r.style.transition = '';
      r.style.transform = '';
    });
  }

  function prefOn() { try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } }
  function setPref(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} }
  function savedPos() { try { return JSON.parse(sessionStorage.getItem(POS) || 'null'); } catch (e) { return null; } }
  function isPlaying() { return !!(player && !player.paused && !player.ended); }

  function paint() {
    var playing = isPlaying();
    document.querySelectorAll('#audioToggle').forEach(function (b) {
      b.setAttribute('aria-pressed', playing ? 'true' : 'false');
      b.setAttribute('data-playing', playing ? 'true' : 'false');
      b.style.opacity = playing ? '1' : '0.35';
    });
  }

  function ensure() {
    if (player) return player;
    var s = savedPos();
    if (s && s.i >= 0 && s.i < TRACKS.length) idx = s.i;
    player = new Audio(TRACKS[idx]);
    player.volume = VOLUME;
    player.addEventListener('play', function () { paint(); vizStart(); });
    player.addEventListener('pause', function () { paint(); vizStop(); });
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
    if (p.currentTime === 0 && s && s.i === idx && s.t > 0) {
      if (p.readyState >= 1) { try { p.currentTime = s.t; } catch (e) {} }
      else p.addEventListener('loadedmetadata', function () {
        try { p.currentTime = s.t; } catch (e) {}
      }, { once: true });
    }
    return p.play();
  }

  function stop() { if (player) player.pause(); }

  setInterval(function () {
    if (isPlaying()) {
      try { sessionStorage.setItem(POS, JSON.stringify({ i: idx, t: player.currentTime })); } catch (e) {}
    }
  }, 1000);

  // The toggle acts on the real state: silent (for any reason) -> start,
  // playing -> stop. Clicking a stalled "on" state restarts instead of
  // flipping the stored preference the wrong way.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#audioToggle');
    if (!b) return;
    if (isPlaying()) { setPref(false); stop(); }
    else { setPref(true); start().catch(function () {}); }
    paint();
  });

  // Music was on when the visitor navigated here: resume. If the browser
  // blocks playback without a gesture, resume on the first interaction.
  function resumeOnce(e) {
    if (e && e.target && e.target.closest && e.target.closest('#audioToggle')) return;
    document.removeEventListener('pointerdown', resumeOnce);
    document.removeEventListener('keydown', resumeOnce);
    if (prefOn() && !isPlaying()) start().catch(function () {});
  }

  function onPageReady() {
    paint();
    [400, 1200, 3000].forEach(function (t) { setTimeout(paint, t); });
    if (prefOn() && !isPlaying()) {
      start().catch(function () {
        paint();
        document.addEventListener('pointerdown', resumeOnce);
        document.addEventListener('keydown', resumeOnce);
      });
    }
  }

  window.addEventListener('DOMContentLoaded', onPageReady);
  // Turbo page swaps: the player object survives and keeps playing;
  // just repaint the fresh button (and resume if something stopped it).
  document.addEventListener('turbo:load', onPageReady);
})();
