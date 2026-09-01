(function () {
  'use strict';

  var canvas = document.getElementById('sketchCanvas');
  var stage = document.getElementById('drawStage');
  if (!canvas || !stage) return;

  var ctx = canvas.getContext('2d');
  var cursor = document.getElementById('drawCursor');
  var hint = document.getElementById('toolHint');
  var noteComposer = document.getElementById('noteComposer');
  var noteInput = document.getElementById('noteInput');
  var sendPanel = document.getElementById('sendPanel');
  var form = document.getElementById('sketchForm');
  var formStatus = document.getElementById('formStatus');
  var nav = document.getElementById('suduNav');
  var siteXhair = null;
  var toolButtons = Array.prototype.slice.call(document.querySelectorAll('[data-tool]'));
  var actionButtons = {};
  document.querySelectorAll('[data-action]').forEach(function (button) {
    actionButtons[button.getAttribute('data-action')] = button;
  });

  var INK = '#171613';
  var PAPER = '#F3F1EA';
  var GRID = 'rgba(23,22,19,0.18)';
  var tool = 'pen';
  var objects = [];
  var undoStack = [];
  var redoStack = [];
  var active = null;
  var notePoint = null;
  var cssWidth = 0;
  var cssHeight = 0;
  var dpr = 1;
  var saveTimer = 0;
  var STORAGE_KEY = 'sudu-sketch-v1';
  var toolHints = {
    pen: 'Draw freely with the pen.',
    line: 'Drag between two points to draw a straight wall.',
    room: 'Drag diagonally to block out a room.',
    note: 'Select a point on the plan, then type a note.',
    erase: 'Select a line, room or note to remove it.'
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(objects)); } catch (error) {}
    }, 160);
  }

  function loadSaved() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) objects = saved.filter(function (item) {
        return item && ['pen', 'line', 'room', 'note'].indexOf(item.type) !== -1;
      }).slice(-160);
    } catch (error) { objects = []; }
  }

  function syncPalette() {
    var styles = getComputedStyle(document.documentElement);
    PAPER = styles.getPropertyValue('--paper').trim() || '#F3F1EA';
    INK = styles.getPropertyValue('--ink').trim() || '#171613';
    GRID = document.documentElement.classList.contains('dm') && !document.documentElement.classList.contains('dmwarm')
      ? 'rgba(245,243,236,0.18)'
      : 'rgba(23,22,19,0.18)';
    render();
  }

  function remember(previous) {
    undoStack.push(previous);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
    scheduleSave();
    updateActions();
  }

  function updateActions() {
    var hasDrawing = objects.length > 0;
    actionButtons.undo.disabled = undoStack.length === 0;
    actionButtons.redo.disabled = redoStack.length === 0;
    actionButtons.clear.disabled = !hasDrawing;
    actionButtons.download.disabled = !hasDrawing;
    actionButtons.send.disabled = !hasDrawing;
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    cssWidth = Math.max(1, Math.round(rect.width));
    cssHeight = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function pointFromEvent(event, snap) {
    var rect = canvas.getBoundingClientRect();
    var x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    var y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    if (snap) {
      var spacing = 28;
      var offsetX = (rect.width % spacing) / 2;
      var offsetY = (rect.height % spacing) / 2;
      x = Math.round((x - offsetX) / spacing) * spacing + offsetX;
      y = Math.round((y - offsetY) / spacing) * spacing + offsetY;
    }
    return { x: x / rect.width, y: y / rect.height };
  }

  function px(point) {
    return { x: point.x * cssWidth, y: point.y * cssHeight };
  }

  function drawGrid(target, width, height) {
    var spacing = 28;
    var offsetX = (width % spacing) / 2;
    var offsetY = (height % spacing) / 2;
    target.save();
    target.fillStyle = GRID;
    for (var x = offsetX; x <= width; x += spacing) {
      for (var y = offsetY; y <= height; y += spacing) {
        target.beginPath();
        target.arc(x, y, 1, 0, Math.PI * 2);
        target.fill();
      }
    }
    target.restore();
  }

  function drawObject(target, object, width, height) {
    var toPx = function (point) { return { x: point.x * width, y: point.y * height }; };
    target.save();
    target.strokeStyle = INK;
    target.fillStyle = INK;
    target.lineCap = 'round';
    target.lineJoin = 'round';

    if (object.type === 'pen') {
      if (!object.points.length) { target.restore(); return; }
      target.lineWidth = 1.55;
      target.beginPath();
      var first = toPx(object.points[0]);
      target.moveTo(first.x, first.y);
      for (var i = 1; i < object.points.length; i++) {
        var before = toPx(object.points[i - 1]);
        var current = toPx(object.points[i]);
        var midX = (before.x + current.x) / 2;
        var midY = (before.y + current.y) / 2;
        target.quadraticCurveTo(before.x, before.y, midX, midY);
      }
      target.stroke();
    }

    if (object.type === 'line') {
      var lineStart = toPx(object.start);
      var lineEnd = toPx(object.end);
      target.lineWidth = 2.1;
      target.beginPath();
      target.moveTo(lineStart.x, lineStart.y);
      target.lineTo(lineEnd.x, lineEnd.y);
      target.stroke();
    }

    if (object.type === 'room') {
      var roomStart = toPx(object.start);
      var roomEnd = toPx(object.end);
      target.lineWidth = 2.1;
      target.strokeRect(roomStart.x, roomStart.y, roomEnd.x - roomStart.x, roomEnd.y - roomStart.y);
    }

    if (object.type === 'note') {
      var note = toPx(object.point);
      var size = Math.max(10, Math.min(13, width / 110));
      target.font = '600 ' + size + 'px Urbanist, sans-serif';
      target.textBaseline = 'middle';
      target.fillText(String(object.text || '').toUpperCase(), note.x, note.y);
    }
    target.restore();
  }

  function render() {
    if (!cssWidth || !cssHeight) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    drawGrid(ctx, cssWidth, cssHeight);
    objects.forEach(function (object) { drawObject(ctx, object, cssWidth, cssHeight); });
    if (active) drawObject(ctx, active, cssWidth, cssHeight);
  }

  function setTool(next) {
    if (!toolHints[next]) return;
    tool = next;
    active = null;
    closeNoteComposer();
    stage.setAttribute('data-tool', tool);
    hint.textContent = toolHints[tool];
    toolButtons.forEach(function (button) {
      var on = button.getAttribute('data-tool') === tool;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    render();
  }

  function closeNoteComposer() {
    noteComposer.hidden = true;
    notePoint = null;
    noteInput.value = '';
  }

  function openNoteComposer(point) {
    var screen = px(point);
    notePoint = point;
    noteComposer.style.left = Math.min(screen.x + 10, Math.max(10, cssWidth - 270)) + 'px';
    noteComposer.style.top = Math.max(24, Math.min(screen.y, cssHeight - 24)) + 'px';
    noteComposer.hidden = false;
    noteInput.value = '';
    window.setTimeout(function () { noteInput.focus(); }, 0);
  }

  function commitNote() {
    var text = noteInput.value.trim();
    if (text && notePoint) {
      var previous = clone(objects);
      objects.push({ type: 'note', point: notePoint, text: text.slice(0, 80) });
      remember(previous);
    }
    closeNoteComposer();
    render();
  }

  function distanceToSegment(point, start, end) {
    var p = px(point);
    var a = px(start);
    var b = px(end);
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = dx * dx + dy * dy;
    var t = lengthSquared ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function hitObject(object, point) {
    if (object.type === 'pen') {
      for (var i = 1; i < object.points.length; i++) {
        if (distanceToSegment(point, object.points[i - 1], object.points[i]) < 16) return true;
      }
    }
    if (object.type === 'line') return distanceToSegment(point, object.start, object.end) < 16;
    if (object.type === 'room') {
      var a = object.start;
      var b = object.end;
      var corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      for (var j = 0; j < 4; j++) {
        if (distanceToSegment(point, corners[j], corners[(j + 1) % 4]) < 16) return true;
      }
    }
    if (object.type === 'note') {
      var p = px(point);
      var n = px(object.point);
      return p.x >= n.x - 8 && p.x <= n.x + Math.max(70, object.text.length * 8) && Math.abs(p.y - n.y) < 16;
    }
    return false;
  }

  function eraseAt(point) {
    for (var i = objects.length - 1; i >= 0; i--) {
      if (hitObject(objects[i], point)) {
        var previous = clone(objects);
        objects.splice(i, 1);
        remember(previous);
        render();
        return;
      }
    }
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    var snap = tool === 'line' || tool === 'room';
    var point = pointFromEvent(event, snap);
    if (tool === 'erase') { eraseAt(point); return; }
    if (tool === 'note') { openNoteComposer(point); return; }
    if (tool === 'pen') active = { type: 'pen', points: [point] };
    if (tool === 'line') active = { type: 'line', start: point, end: point };
    if (tool === 'room') active = { type: 'room', start: point, end: point };
    render();
  }

  function onPointerMove(event) {
    var rect = stage.getBoundingClientRect();
    cursor.style.left = (event.clientX - rect.left) + 'px';
    cursor.style.top = (event.clientY - rect.top) + 'px';
    if (!active) return;
    var snap = active.type === 'line' || active.type === 'room';
    var point = pointFromEvent(event, snap);
    if (active.type === 'pen') {
      var last = active.points[active.points.length - 1];
      var dx = (point.x - last.x) * cssWidth;
      var dy = (point.y - last.y) * cssHeight;
      if (Math.hypot(dx, dy) > 1.4) active.points.push(point);
    } else {
      active.end = point;
    }
    render();
  }

  function onPointerUp(event) {
    if (!active) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    var valid = active.type === 'pen'
      ? active.points.length > 1
      : Math.hypot((active.end.x - active.start.x) * cssWidth, (active.end.y - active.start.y) * cssHeight) > 6;
    if (valid) {
      var previous = clone(objects);
      objects.push(clone(active));
      if (objects.length > 160) objects.shift();
      remember(previous);
    }
    active = null;
    render();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(clone(objects));
    objects = undoStack.pop();
    scheduleSave();
    updateActions();
    render();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(clone(objects));
    objects = redoStack.pop();
    scheduleSave();
    updateActions();
    render();
  }

  function clearDrawing() {
    if (!objects.length) return;
    if (!window.confirm('Clear the entire sketch?')) return;
    var previous = clone(objects);
    objects = [];
    remember(previous);
    render();
  }

  function exportCanvas(callback) {
    var width = 1800;
    var height = Math.round(width * cssHeight / cssWidth);
    var out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    var outCtx = out.getContext('2d');
    outCtx.fillStyle = PAPER;
    outCtx.fillRect(0, 0, width, height);
    drawGrid(outCtx, width, height);
    objects.forEach(function (object) { drawObject(outCtx, object, width, height); });
    out.toBlob(callback, 'image/png', .94);
  }

  function downloadSketch() {
    exportCanvas(function (blob) {
      if (!blob) return;
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'sudu-sketch.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    });
  }

  function openSendPanel() {
    if (!objects.length) return;
    sendPanel.hidden = false;
    window.requestAnimationFrame(function () {
      sendPanel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  }

  function closeSendPanel() {
    sendPanel.hidden = true;
    actionButtons.send.focus();
  }

  function submitForm(event) {
    event.preventDefault();
    if (!objects.length) return;
    var submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    formStatus.textContent = 'Preparing your sketch…';
    exportCanvas(function (blob) {
      if (!blob) {
        submit.disabled = false;
        formStatus.textContent = 'The drawing could not be prepared. Please try again.';
        return;
      }
      var data = new FormData(form);
      data.delete('sketch');
      data.append('sketch', blob, 'sudu-sketch.png');
      // sudu.studio is currently served by GitHub Pages while form storage is
      // owned by the mirrored Netlify deployment. A normal cross-origin form
      // POST is allowed, but its response is intentionally opaque to this
      // page. On a Netlify preview the same code posts locally and can inspect
      // the response in full.
      var onNetlify = /\.netlify\.app$/.test(window.location.hostname);
      var endpoint = onNetlify ? '/' : 'https://sudustudioarchitecture.netlify.app/';
      var options = { method: 'POST', body: data };
      if (!onNetlify) options.mode = 'no-cors';
      fetch(endpoint, options).then(function (response) {
        if (response.type !== 'opaque' && !response.ok) throw new Error('HTTP ' + response.status);
        formStatus.textContent = 'Sketch sent. We will reply by email.';
        submit.textContent = 'Sketch sent ✓';
      }).catch(function () {
        submit.disabled = false;
        formStatus.textContent = 'That did not send. Please try again, or email joe@sudu.studio.';
      });
    });
  }

  toolButtons.forEach(function (button) {
    button.addEventListener('click', function () { setTool(button.getAttribute('data-tool')); });
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('pointerenter', function () { cursor.style.opacity = '1'; });
  stage.addEventListener('pointerleave', function () { cursor.style.opacity = '0'; });
  noteInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); commitNote(); }
    if (event.key === 'Escape') { event.preventDefault(); closeNoteComposer(); canvas.focus(); }
  });
  noteInput.addEventListener('blur', function () { if (!noteComposer.hidden) commitNote(); });
  actionButtons.undo.addEventListener('click', undo);
  actionButtons.redo.addEventListener('click', redo);
  actionButtons.clear.addEventListener('click', clearDrawing);
  actionButtons.download.addEventListener('click', downloadSketch);
  actionButtons.send.addEventListener('click', openSendPanel);
  actionButtons['close-send'].addEventListener('click', closeSendPanel);
  form.addEventListener('submit', submitForm);

  document.addEventListener('keydown', function (event) {
    if (event.target && /input|textarea/i.test(event.target.tagName)) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    var keyTools = { p: 'pen', l: 'line', r: 'room', n: 'note', e: 'erase' };
    if (keyTools[event.key.toLowerCase()]) setTool(keyTools[event.key.toLowerCase()]);
  });

  window.addEventListener('scroll', function () {
    nav.classList.toggle('is-scrolled', window.scrollY > 30);
  }, { passive: true });

  var resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  window.addEventListener('pagehide', scheduleSave);

  function buildThemePicker() {
    if (document.getElementById('dmSwatches')) return;
    var choices = [['Charcoal', '#121110'], ['Off white', '#F3F1EA'], ['Burnt', '#C0431F']];
    var picker = document.createElement('div');
    picker.id = 'dmSwatches';
    choices.forEach(function (choice) {
      var button = document.createElement('button');
      button.type = 'button';
      button.title = choice[0];
      button.setAttribute('aria-label', 'Background: ' + choice[0]);
      button.setAttribute('data-v', choice[1]);
      button.style.cssText = 'width:13px;height:13px;border-radius:50%;border:0;cursor:pointer;padding:0;background:' + choice[1];
      button.addEventListener('click', function () {
        var value = choice[1];
        var html = document.documentElement;
        if (value === '#F3F1EA') {
          html.classList.remove('dm', 'dmwarm', 'dmred', 'dmlight');
          html.style.removeProperty('--dm-bg');
        } else if (value === '#C0431F') {
          html.classList.add('dm', 'dmwarm', 'dmred');
          html.classList.remove('dmlight');
          html.style.setProperty('--dm-bg', value);
        } else {
          html.classList.add('dm');
          html.classList.remove('dmwarm', 'dmred', 'dmlight');
          html.style.setProperty('--dm-bg', value);
        }
        try { localStorage.setItem('sudu-dm-bg', value); } catch (error) {}
        Array.prototype.forEach.call(picker.children, function (item) {
          item.hidden = item.getAttribute('data-v') === value;
        });
        syncPalette();
      });
      picker.appendChild(button);
    });
    if (window.suduBar) window.suduBar().appendChild(picker);
    var selected = '#F3F1EA';
    try { selected = localStorage.getItem('sudu-dm-bg') || selected; } catch (error) {}
    var selectedButton = picker.querySelector('[data-v="' + selected + '"]');
    if (selectedButton) selectedButton.hidden = true;
  }

  function buildCrosshair() {
    if (!window.matchMedia('(pointer:fine)').matches) return;
    siteXhair = document.createElement('div');
    siteXhair.className = 'site-xhair';
    siteXhair.setAttribute('aria-hidden', 'true');
    siteXhair.innerHTML = '<i></i><i></i><i></i><i></i>';
    document.documentElement.appendChild(siteXhair);
    document.documentElement.classList.add('xh');
    document.addEventListener('pointermove', function (event) {
      siteXhair.style.transform = 'translate3d(' + event.clientX + 'px,' + event.clientY + 'px,0)';
      siteXhair.style.opacity = stage.matches(':hover') ? '0' : '1';
    }, { passive: true });
    document.addEventListener('mouseleave', function () { siteXhair.style.opacity = '0'; });
    document.addEventListener('mouseenter', function () { siteXhair.style.opacity = stage.matches(':hover') ? '0' : '1'; });
  }

  loadSaved();
  buildThemePicker();
  buildCrosshair();
  updateActions();
  resize();
  syncPalette();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
