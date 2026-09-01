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
  var ruler = document.getElementById('sketchRuler');
  var rulerFace = ruler.querySelector('[data-ruler-drag]');
  var rulerRotate = document.getElementById('rulerRotate');
  var rulerAngle = document.getElementById('rulerAngle');
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
  var hintTimer = 0;
  var doorFlip = false;
  var rulerDrag = null;
  var rulerState = { visible: false, x: 0.5, y: 0.5, angle: 0 };
  var STORAGE_KEY = 'sudu-sketch-v1';
  var RULER_KEY = 'sudu-sketch-ruler-v1';
  var allowedTypes = ['pen', 'line', 'room', 'door', 'window', 'area', 'note'];
  var toolHints = {
    pen: 'Draw freely. Strokes smooth automatically.',
    line: 'Drag between two points to draw a straight wall.',
    room: 'Drag diagonally to block out a room.',
    door: 'Drag across an opening. Select Door again or hold Shift to reverse the swing.',
    window: 'Drag along a wall to place a window.',
    area: 'Drag a rectangle to shade an area.',
    note: 'Select a point on the plan, then type a note.',
    erase: 'Select a line, room, opening, area or note to remove it.'
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function persistDrawing() {
    window.clearTimeout(saveTimer);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(objects)); } catch (error) {}
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistDrawing, 160);
  }

  function persistRuler() {
    try { localStorage.setItem(RULER_KEY, JSON.stringify(rulerState)); } catch (error) {}
  }

  function loadSaved() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) objects = saved.filter(function (item) {
        return item && allowedTypes.indexOf(item.type) !== -1;
      }).slice(-200);
    } catch (error) { objects = []; }

    try {
      var savedRuler = JSON.parse(localStorage.getItem(RULER_KEY) || 'null');
      if (savedRuler && typeof savedRuler === 'object') {
        rulerState.visible = Boolean(savedRuler.visible);
        rulerState.x = Math.max(0.08, Math.min(0.92, Number(savedRuler.x) || 0.5));
        rulerState.y = Math.max(0.08, Math.min(0.92, Number(savedRuler.y) || 0.5));
        rulerState.angle = Number(savedRuler.angle) || 0;
      }
    } catch (error) {}
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
    actionButtons.save.disabled = !hasDrawing;
    actionButtons.screenshot.disabled = !hasDrawing;
    actionButtons.send.disabled = !hasDrawing;
    actionButtons.ruler.classList.toggle('is-active', rulerState.visible);
    actionButtons.ruler.setAttribute('aria-pressed', rulerState.visible ? 'true' : 'false');
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
    positionRuler();
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

  function constrainToRuler(start, end) {
    var a = px(start);
    var b = px(end);
    var radians = rulerState.angle * Math.PI / 180;
    var ux = Math.cos(radians);
    var uy = Math.sin(radians);
    var distance = (b.x - a.x) * ux + (b.y - a.y) * uy;
    return {
      x: Math.max(0, Math.min(1, (a.x + ux * distance) / cssWidth)),
      y: Math.max(0, Math.min(1, (a.y + uy * distance) / cssHeight))
    };
  }

  function drawGrid(target, width, height) {
    var outputScale = cssWidth ? width / cssWidth : 1;
    var spacing = 28 * outputScale;
    var offsetX = (width % spacing) / 2;
    var offsetY = (height % spacing) / 2;
    target.save();
    target.fillStyle = GRID;
    for (var x = offsetX; x <= width; x += spacing) {
      for (var y = offsetY; y <= height; y += spacing) {
        target.beginPath();
        target.arc(x, y, Math.max(1, outputScale), 0, Math.PI * 2);
        target.fill();
      }
    }
    target.restore();
  }

  function drawOpening(target, object, width, height, outputScale) {
    var start = { x: object.start.x * width, y: object.start.y * height };
    var end = { x: object.end.x * width, y: object.end.y * height };
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var length = Math.hypot(dx, dy);
    if (length < 2) return;

    target.save();
    target.translate(start.x, start.y);
    target.rotate(Math.atan2(dy, dx));
    target.fillStyle = PAPER;
    target.fillRect(-4 * outputScale, -7 * outputScale, length + 8 * outputScale, 14 * outputScale);
    target.strokeStyle = INK;
    target.lineWidth = 1.45 * outputScale;
    target.lineCap = 'butt';

    target.beginPath();
    target.moveTo(0, -6 * outputScale);
    target.lineTo(0, 6 * outputScale);
    target.moveTo(length, -6 * outputScale);
    target.lineTo(length, 6 * outputScale);
    target.stroke();

    if (object.type === 'window') {
      target.beginPath();
      target.moveTo(0, -2.5 * outputScale);
      target.lineTo(length, -2.5 * outputScale);
      target.moveTo(0, 2.5 * outputScale);
      target.lineTo(length, 2.5 * outputScale);
      target.stroke();
    } else {
      var direction = object.flip ? -1 : 1;
      target.beginPath();
      target.moveTo(0, 0);
      target.lineTo(0, direction * length);
      target.stroke();
      target.globalAlpha = 0.72;
      target.beginPath();
      target.arc(0, 0, length, 0, direction * Math.PI / 2, direction < 0);
      target.stroke();
    }
    target.restore();
  }

  function drawArea(target, object, width, height, outputScale) {
    var start = { x: object.start.x * width, y: object.start.y * height };
    var end = { x: object.end.x * width, y: object.end.y * height };
    var x = Math.min(start.x, end.x);
    var y = Math.min(start.y, end.y);
    var w = Math.abs(end.x - start.x);
    var h = Math.abs(end.y - start.y);
    var hatch = 12 * outputScale;

    target.save();
    target.beginPath();
    target.rect(x, y, w, h);
    target.clip();
    target.globalAlpha = 0.07;
    target.fillStyle = INK;
    target.fillRect(x, y, w, h);
    target.globalAlpha = 0.18;
    target.strokeStyle = INK;
    target.lineWidth = 0.7 * outputScale;
    for (var d = -h; d < w + h; d += hatch) {
      target.beginPath();
      target.moveTo(x + d, y + h);
      target.lineTo(x + d + h, y);
      target.stroke();
    }
    target.restore();

    target.save();
    target.globalAlpha = 0.34;
    target.strokeStyle = INK;
    target.lineWidth = 0.75 * outputScale;
    target.strokeRect(x, y, w, h);
    target.restore();
  }

  function drawObject(target, object, width, height) {
    var toPx = function (point) { return { x: point.x * width, y: point.y * height }; };
    var outputScale = cssWidth ? width / cssWidth : 1;
    target.save();
    target.strokeStyle = INK;
    target.fillStyle = INK;
    target.lineCap = 'round';
    target.lineJoin = 'round';

    if (object.type === 'pen') {
      if (!object.points.length) { target.restore(); return; }
      target.lineWidth = 1.55 * outputScale;
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
      target.lineWidth = 2.1 * outputScale;
      target.beginPath();
      target.moveTo(lineStart.x, lineStart.y);
      target.lineTo(lineEnd.x, lineEnd.y);
      target.stroke();
    }

    if (object.type === 'room') {
      var roomStart = toPx(object.start);
      var roomEnd = toPx(object.end);
      target.lineWidth = 2.1 * outputScale;
      target.strokeRect(roomStart.x, roomStart.y, roomEnd.x - roomStart.x, roomEnd.y - roomStart.y);
    }

    if (object.type === 'door' || object.type === 'window') {
      target.restore();
      drawOpening(target, object, width, height, outputScale);
      return;
    }

    if (object.type === 'area') {
      target.restore();
      drawArea(target, object, width, height, outputScale);
      return;
    }

    if (object.type === 'note') {
      var note = toPx(object.point);
      var size = Math.max(10 * outputScale, Math.min(13 * outputScale, width / 110));
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

  function setHint(message, restore) {
    window.clearTimeout(hintTimer);
    hint.textContent = message;
    if (restore) {
      hintTimer = window.setTimeout(function () { hint.textContent = toolHints[tool]; }, restore);
    }
  }

  function setTool(next) {
    if (!toolHints[next]) return;
    tool = next;
    active = null;
    closeNoteComposer();
    stage.setAttribute('data-tool', tool);
    setHint(toolHints[tool]);
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

  function screenDistance(a, b) {
    return Math.hypot((a.x - b.x) * cssWidth, (a.y - b.y) * cssHeight);
  }

  function smoothStroke(points) {
    if (points.length < 3) return points;
    var reduced = [points[0]];
    for (var i = 1; i < points.length - 1; i++) {
      if (screenDistance(points[i], reduced[reduced.length - 1]) >= 2.4) reduced.push(points[i]);
    }
    reduced.push(points[points.length - 1]);

    var smoothed = reduced;
    for (var pass = 0; pass < 2 && smoothed.length > 2; pass++) {
      var next = [smoothed[0]];
      for (var j = 0; j < smoothed.length - 1; j++) {
        var a = smoothed[j];
        var b = smoothed[j + 1];
        next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      next.push(smoothed[smoothed.length - 1]);
      smoothed = next;
    }

    if (smoothed.length > 480) {
      var sampled = [];
      var step = (smoothed.length - 1) / 479;
      for (var k = 0; k < 480; k++) sampled.push(smoothed[Math.round(k * step)]);
      smoothed = sampled;
    }
    return smoothed;
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

  function pointInsideRect(point, start, end) {
    return point.x >= Math.min(start.x, end.x) && point.x <= Math.max(start.x, end.x) &&
      point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y);
  }

  function hitObject(object, point) {
    if (object.type === 'pen') {
      for (var i = 1; i < object.points.length; i++) {
        if (distanceToSegment(point, object.points[i - 1], object.points[i]) < 16) return true;
      }
    }
    if (object.type === 'line' || object.type === 'door' || object.type === 'window') {
      return distanceToSegment(point, object.start, object.end) < 18;
    }
    if (object.type === 'area') return pointInsideRect(point, object.start, object.end);
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
    var snap = ['line', 'room', 'door', 'window', 'area'].indexOf(tool) !== -1;
    var point = pointFromEvent(event, snap);
    if (tool === 'erase') { eraseAt(point); return; }
    if (tool === 'note') { openNoteComposer(point); return; }
    if (tool === 'pen') active = { type: 'pen', points: [point] };
    if (tool === 'line') active = { type: 'line', start: point, end: point };
    if (tool === 'room') active = { type: 'room', start: point, end: point };
    if (tool === 'door') active = { type: 'door', start: point, end: point, flip: event.shiftKey ? !doorFlip : doorFlip };
    if (tool === 'window') active = { type: 'window', start: point, end: point };
    if (tool === 'area') active = { type: 'area', start: point, end: point };
    render();
  }

  function onPointerMove(event) {
    if (!active) return;
    var snap = ['line', 'room', 'door', 'window', 'area'].indexOf(active.type) !== -1;
    var point = pointFromEvent(event, snap);
    if (active.type === 'pen') {
      var last = active.points[active.points.length - 1];
      if (screenDistance(point, last) > 1.4) active.points.push(point);
    } else {
      if (active.type === 'line' && rulerState.visible && !event.altKey) point = constrainToRuler(active.start, point);
      active.end = point;
      if (active.type === 'door') active.flip = event.shiftKey ? !doorFlip : doorFlip;
    }
    render();
  }

  function onPointerUp(event) {
    if (!active) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    var valid = active.type === 'pen'
      ? active.points.length > 1
      : screenDistance(active.end, active.start) > (active.type === 'door' || active.type === 'window' ? 16 : 6);
    if (valid) {
      var previous = clone(objects);
      if (active.type === 'pen') active.points = smoothStroke(active.points);
      objects.push(clone(active));
      if (objects.length > 200) objects.shift();
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

  function saveDrawing() {
    if (!objects.length) return;
    persistDrawing();
    persistRuler();
    if (window.suduHaptics) window.suduHaptics.tick(10);
    setHint('Saved on this device.', 1800);
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
    out.toBlob(callback, 'image/png', 0.94);
  }

  function captureScreenshot() {
    exportCanvas(function (blob) {
      if (!blob) return;
      var link = document.createElement('a');
      var url = URL.createObjectURL(blob);
      link.href = url;
      link.download = 'sudu-sketch.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      setHint('Screenshot saved.', 1800);
    });
  }

  function positionRuler() {
    ruler.hidden = !rulerState.visible;
    ruler.style.left = (rulerState.x * 100) + '%';
    ruler.style.top = (rulerState.y * 100) + '%';
    ruler.style.transform = 'translate(-50%, -50%) rotate(' + rulerState.angle + 'deg)';
    var shown = Math.round(((rulerState.angle % 180) + 180) % 180);
    rulerAngle.textContent = shown + '°';
  }

  function toggleRuler() {
    rulerState.visible = !rulerState.visible;
    positionRuler();
    persistRuler();
    updateActions();
    setHint(rulerState.visible
      ? 'Drag the ruler to move it. Drag its round end to rotate; Line follows its angle.'
      : toolHints[tool]);
  }

  function beginRulerDrag(event, mode) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    var rect = stage.getBoundingClientRect();
    rulerDrag = {
      mode: mode,
      startX: event.clientX,
      startY: event.clientY,
      x: rulerState.x,
      y: rulerState.y,
      centerX: rect.left + rulerState.x * rect.width,
      centerY: rect.top + rulerState.y * rect.height,
      stageWidth: rect.width,
      stageHeight: rect.height
    };
  }

  function moveRuler(event) {
    if (!rulerDrag) return;
    event.preventDefault();
    if (rulerDrag.mode === 'move') {
      rulerState.x = Math.max(0.08, Math.min(0.92, rulerDrag.x + (event.clientX - rulerDrag.startX) / rulerDrag.stageWidth));
      rulerState.y = Math.max(0.08, Math.min(0.92, rulerDrag.y + (event.clientY - rulerDrag.startY) / rulerDrag.stageHeight));
    } else {
      rulerState.angle = Math.atan2(event.clientY - rulerDrag.centerY, event.clientX - rulerDrag.centerX) * 180 / Math.PI;
    }
    positionRuler();
  }

  function endRulerDrag() {
    if (!rulerDrag) return;
    rulerDrag = null;
    persistRuler();
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
      fetch('/', { method: 'POST', body: data }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        formStatus.textContent = 'Sketch sent. We will reply by email.';
        submit.textContent = 'Sketch sent ✓';
      }).catch(function () {
        submit.disabled = false;
        formStatus.textContent = 'That did not send. Please try again, or email joe@sudu.studio.';
      });
    });
  }

  toolButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var next = button.getAttribute('data-tool');
      if (next === 'door' && tool === 'door') {
        doorFlip = !doorFlip;
        button.textContent = doorFlip ? 'Door ↺' : 'Door';
        setHint(doorFlip ? 'Door swing reversed.' : toolHints.door, 1600);
        return;
      }
      setTool(next);
    });
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('pointermove', function (event) {
    var rect = stage.getBoundingClientRect();
    cursor.style.left = (event.clientX - rect.left) + 'px';
    cursor.style.top = (event.clientY - rect.top) + 'px';
  }, { passive: true });
  stage.addEventListener('pointerenter', function () { cursor.style.opacity = '1'; });
  stage.addEventListener('pointerleave', function () { cursor.style.opacity = '0'; });

  rulerFace.addEventListener('pointerdown', function (event) { beginRulerDrag(event, 'move'); });
  rulerRotate.addEventListener('pointerdown', function (event) { beginRulerDrag(event, 'rotate'); });
  document.addEventListener('pointermove', moveRuler, { passive: false });
  document.addEventListener('pointerup', endRulerDrag, { passive: true });
  document.addEventListener('pointercancel', endRulerDrag, { passive: true });

  noteInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); commitNote(); }
    if (event.key === 'Escape') { event.preventDefault(); closeNoteComposer(); canvas.focus(); }
  });
  noteInput.addEventListener('blur', function () { if (!noteComposer.hidden) commitNote(); });
  actionButtons.ruler.addEventListener('click', toggleRuler);
  actionButtons.undo.addEventListener('click', undo);
  actionButtons.redo.addEventListener('click', redo);
  actionButtons.clear.addEventListener('click', clearDrawing);
  actionButtons.save.addEventListener('click', saveDrawing);
  actionButtons.screenshot.addEventListener('click', captureScreenshot);
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
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveDrawing();
      return;
    }
    if (event.key.toLowerCase() === 'u') {
      toggleRuler();
      return;
    }
    var keyTools = { p: 'pen', l: 'line', r: 'room', d: 'door', w: 'window', a: 'area', n: 'note', e: 'erase' };
    if (keyTools[event.key.toLowerCase()]) setTool(keyTools[event.key.toLowerCase()]);
  });

  window.addEventListener('scroll', function () {
    nav.classList.toggle('is-scrolled', window.scrollY > 30);
  }, { passive: true });

  var resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  window.addEventListener('pagehide', function () { persistDrawing(); persistRuler(); });

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
  positionRuler();
  updateActions();
  resize();
  syncPalette();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
