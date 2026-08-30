// Background music player for sudu.studio.
// A small equalizer toggle (#audioToggle) sits next to the dark-mode dot in
// the header; the current track title (#trackSwitch) sits in the footer and
// advances to the next track on click. Off by default; the choice persists
// across pages (localStorage), and the playing position carries across page
// loads within a visit (sessionStorage). With Turbo Drive the player object
// survives navigation entirely.
// The toggle bars follow the actual music via a Web Audio analyser. Each band
// is normalized against its own rolling average, so even a steady ambient
// track shows its micro-dynamics. If the analyser stalls or feeds silence
// while music plays, the bars fall back to a gentle CSS motion.
(function () {
  if (window.__suduAudioWired) return;
  window.__suduAudioWired = true;
  var KEY = 'sudu-audio';
  var POS = 'sudu-audio-pos';
  var TRACKS = [
    { src: '/audio/mf-rothschild-432.mp3', artist: 'MF Rothschild', short: '432', title: 'MF Rothschild · 432' },
    { src: '/audio/mf-rothschild-isis.mp3', artist: 'MF Rothschild', short: 'Isis', title: 'MF Rothschild · Isis' }
  ];
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
    '#audioToggle{position:relative;}#audioToggle::after{content:"";position:absolute;inset:-11px;}' +
    // The pill lives in the chrome bar, which is exempt from the dark-mode
    // inversion, so the active chip is coloured directly for each ground
    // rather than through the pre-image the inverted footer used to need.
    '#musicPill .track-pill{display:inline-flex;align-items:center;gap:2px;border:0.5px solid currentColor;border-radius:100px;padding:2px;}' +
    '#musicPill .track-pill button{border:0;border-radius:100px;padding:3px 9px;font-size:9.5px;font-weight:600;letter-spacing:0.06em;' +
      'background:transparent;color:inherit;opacity:0.6;transition:background .25s ease,color .25s ease,opacity .25s ease;}' +
    '#musicPill .track-pill button:hover{opacity:1;}' +
    '#musicPill .track-pill button.on{opacity:1;background:#171613;color:#F3F1EA;}' +
    'html.dm #musicPill .track-pill button.on{background:#F5F3EC;color:#171613;}';
  document.head.appendChild(css);

  function prefOn() { try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } }
  function setPref(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} }
  function savedPos() { try { return JSON.parse(sessionStorage.getItem(POS) || 'null'); } catch (e) { return null; } }
  function savePos(t) { try { sessionStorage.setItem(POS, JSON.stringify({ i: idx, t: t })); } catch (e) {} }
  function isPlaying() { return !!(player && !player.paused && !player.ended); }

  // ---- live visualizer ----
  var actx = null, analyser = null, srcNode = null, vizRAF = 0;
  var vizData = null, levels = [0.35, 0.35, 0.35], ema = [0, 0, 0];
  var lastTick = 0, silentSince = 0, vizBroken = false;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function vizLive() { return !!(analyser && !vizBroken); }

  function setupViz() {
    if (analyser || vizBroken || reduceMotion) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      srcNode = actx.createMediaElementSource(player);
      var an = actx.createAnalyser();
      an.fftSize = 128;
      an.smoothingTimeConstant = 0.55;
      srcNode.connect(an);
      an.connect(actx.destination);
      analyser = an;
      vizData = new Uint8Array(an.frequencyBinCount);
    } catch (e) {
      // never leave the element routed into a dead graph (that would mute it)
      if (srcNode && actx) { try { srcNode.connect(actx.destination); } catch (e2) {} }
      analyser = null;
      vizBroken = true;
    }
  }

  function band(from, to) {
    var sum = 0;
    for (var i = from; i < to; i++) sum += vizData[i];
    return sum / ((to - from) * 255);
  }

  function vizFrame() {
    vizRAF = requestAnimationFrame(vizFrame);
    lastTick = Date.now();
    analyser.getByteFrequencyData(vizData);
    var bands = [band(1, 8), band(8, 24), band(24, 60)];
    if (bands[0] || bands[1] || bands[2]) silentSince = 0;
    else if (!silentSince) silentSince = lastTick;
    var rects = document.querySelectorAll('#audioToggle svg rect');
    for (var i = 0; i < 3; i++) {
      // normalize against a slow rolling average so steady, drone-like music
      // still shows its micro-dynamics rather than freezing the bars
      ema[i] = ema[i] ? ema[i] * 0.985 + bands[i] * 0.015 : bands[i];
      var dev = ema[i] > 0.001 ? (bands[i] - ema[i]) / ema[i] : 0;
      var target = Math.max(0.22, Math.min(1, 0.55 + dev * 2.4));
      levels[i] += (target - levels[i]) * 0.25;
    }
    for (var r = 0; r < rects.length; r++) {
      rects[r].style.transition = 'none';
      rects[r].style.transform = 'scaleY(' + levels[r % 3].toFixed(3) + ')';
    }
  }

  function vizStart() {
    setupViz();
    if (!vizLive()) return;
    if (actx.state === 'suspended') actx.resume().catch(function () {});
    cancelAnimationFrame(vizRAF);
    silentSince = 0;
    vizRAF = requestAnimationFrame(vizFrame);
    paint();
  }

  function vizStop() {
    cancelAnimationFrame(vizRAF);
    vizRAF = 0;
    document.querySelectorAll('#audioToggle svg rect').forEach(function (r) {
      r.style.transition = '';
      r.style.transform = '';
    });
  }

  // Watchdog: restart a stalled frame loop; retire an analyser that feeds
  // silence while music audibly plays (a Safari quirk with media elements)
  // so the CSS motion takes over instead of frozen bars.
  setInterval(function () {
    if (!isPlaying() || !vizLive()) return;
    var now = Date.now();
    if (silentSince && now - silentSince > 4000) {
      vizBroken = true;
      vizStop();
      paint();
      return;
    }
    if (now - lastTick > 1200) vizStart();
  }, 1000);

  function paint() {
    var playing = isPlaying();
    var live = playing && vizLive() && !!vizRAF;
    document.querySelectorAll('#audioToggle').forEach(function (b) {
      b.setAttribute('aria-pressed', playing ? 'true' : 'false');
      b.setAttribute('data-playing', playing ? 'true' : 'false');
      b.setAttribute('data-viz', live ? 'true' : 'false');
      b.style.opacity = playing ? '1' : '0.35';
    });
    document.querySelectorAll('[data-track-title]').forEach(function (el) {
      el.textContent = TRACKS[idx].title;
    });
    document.querySelectorAll('[data-track-artist]').forEach(function (el) {
      el.textContent = TRACKS[idx].artist;
    });
    document.querySelectorAll('[data-track]').forEach(function (el) {
      var i = parseInt(el.getAttribute('data-track'), 10);
      var t = TRACKS[i];
      if (!t) { el.hidden = true; return; }
      var on = i === idx;
      el.textContent = t.short;
      el.setAttribute('data-active', on ? 'true' : 'false');
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.classList.toggle('on', on);
    });
  }

  function ensure() {
    if (player) return player;
    var s = savedPos();
    if (s && s.i >= 0 && s.i < TRACKS.length) idx = s.i;
    player = new Audio();
    player.preload = 'none';
    player.src = TRACKS[idx].src;
    player.volume = VOLUME;
    player.addEventListener('play', function () { paint(); vizStart(); });
    player.addEventListener('pause', function () { paint(); vizStop(); });
    player.addEventListener('ended', function () {
      switchTo((idx + 1) % TRACKS.length);
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

  function switchTo(i) {
    var p = ensure();
    idx = i % TRACKS.length;
    p.src = TRACKS[idx].src;
    savePos(0);
    setPref(true);
    p.play().catch(function () {});
    paint();
  }

  setInterval(function () {
    if (isPlaying()) savePos(player.currentTime);
  }, 1000);

  // The toggle acts on the real state: silent (for any reason) -> start,
  // playing -> stop. The footer title advances to the next track.
  document.addEventListener('click', function (e) {
    var t = e.target;
    var seg = t && t.closest && t.closest('[data-track]');
    if (seg) {
      var i = parseInt(seg.getAttribute('data-track'), 10);
      if (i === idx) {
        if (isPlaying()) { setPref(false); stop(); }
        else { setPref(true); start().catch(function () {}); }
        paint();
      } else if (i >= 0 && i < TRACKS.length) {
        switchTo(i);
      }
      return;
    }
    if (t && t.closest && t.closest('#trackSwitch')) {
      switchTo(idx + 1);
      return;
    }
    var b = t && t.closest && t.closest('#audioToggle');
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


  // ---- the music pill ----
  // Built rather than authored into the pages: it belongs to the chrome bar,
  // which persists across Turbo visits, so it must not be part of the body
  // markup that Turbo replaces. paint() finds #audioToggle and [data-track]
  // by selector, so nothing else has to know where the controls ended up.
  function buildPill() {
    if (!window.suduBar || document.getElementById('musicPill')) return;
    var pill = document.createElement('div');
    pill.id = 'musicPill';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'audioToggle';
    toggle.setAttribute('aria-label', 'Toggle background music');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('data-playing', 'false');
    toggle.title = 'Background music';
    toggle.style.cssText = 'border:0;background:transparent;padding:0;width:13px;height:13px;' +
      'display:inline-flex;align-items:center;justify-content:center;opacity:0.35;transition:opacity .25s ease;';
    toggle.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" style="display:block;">' +
      '<rect x="2" y="2" width="1.4" height="9" rx="0.7" fill="currentColor"></rect>' +
      '<rect x="5.8" y="2" width="1.4" height="9" rx="0.7" fill="currentColor"></rect>' +
      '<rect x="9.6" y="2" width="1.4" height="9" rx="0.7" fill="currentColor"></rect></svg>';
    pill.appendChild(toggle);

    var seg = document.createElement('span');
    seg.className = 'track-pill';
    TRACKS.forEach(function (t, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-track', String(i));
      b.setAttribute('aria-label', 'Play ' + t.title);
      b.textContent = t.short;
      seg.appendChild(b);
    });
    pill.appendChild(seg);

    window.suduBar().appendChild(pill);
    paint();
  }

  function paintOnly() { paint(); [400, 1200, 3000].forEach(function (t) { setTimeout(paint, t); }); }
  function afterLoad(fn) {
    if (document.readyState === 'complete') setTimeout(fn, 500);
    else window.addEventListener('load', function () { setTimeout(fn, 500); });
  }
  window.addEventListener('DOMContentLoaded', function () { buildPill(); paintOnly(); afterLoad(onPageReady); });
  // Turbo page swaps: the player object survives and keeps playing;
  // just repaint the fresh buttons (and resume if something stopped it).
  document.addEventListener('turbo:load', function () { buildPill(); paintOnly(); afterLoad(onPageReady); });
  if (document.readyState !== 'loading') buildPill();
})();
