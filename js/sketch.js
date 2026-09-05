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
  var traceLayers = document.getElementById('traceLayers');
  var stencilPanel = document.getElementById('stencilPanel');
  var stencilChoices = document.getElementById('stencilChoices');
  var stencilCategoryButtons = Array.prototype.slice.call(document.querySelectorAll('[data-stencil-category]'));
  var stencilStyleButtons = Array.prototype.slice.call(document.querySelectorAll('[data-stencil-style]'));
  var floorButtons = Array.prototype.slice.call(document.querySelectorAll('[data-floor]'));
  var underlayInput = document.getElementById('underlayInput');
  var projectInput = document.getElementById('projectInput');
  var zoomLevel = document.getElementById('zoomLevel');
  var siteXhair = null;
  // The stage also carries data-tool so CSS can style the active cursor.
  // Only actual toolbar buttons belong in this collection; otherwise pointer
  // events that bubble from the canvas make the stage run the button handler.
  var toolButtons = Array.prototype.slice.call(document.querySelectorAll('.tool-button[data-tool]'));
  var actionButtons = {};
  document.querySelectorAll('[data-action]').forEach(function (button) {
    actionButtons[button.getAttribute('data-action')] = button;
  });
  var mobileUi = document.getElementById('mobileSketchUi');
  var mobileSheet = document.getElementById('mobileToolSheet');
  var mobileToolsToggle = document.getElementById('sketchToolsToggle');
  var mobileToolButtons = Array.prototype.slice.call(document.querySelectorAll('[data-mobile-tool]'));
  var mobileActionButtons = Array.prototype.slice.call(document.querySelectorAll('[data-mobile-action]'));
  var mobilePanels = Array.prototype.slice.call(document.querySelectorAll('[data-mobile-panel]'));
  var mobileOpenPanel = '';

  var INK = '#171613';
  var PAPER = '#F3F1EA';
  var GRID = 'rgba(23,22,19,0.26)';
  var FLOOR_ORDER = ['basement', 'main', 'second'];
  var FLOOR_LABELS = { basement: 'Basement', main: 'Main', second: 'Second' };
  var tool = 'pen';
  var floors = {};
  var activeFloor = 'main';
  var traceSerial = 0;
  var objects = [];
  var undoStack = [];
  var redoStack = [];
  var active = null;
  var selectedIndex = -1;
  var resizeDrag = null;
  var moveDrag = null;
  var notePoint = null;
  var cssWidth = 0;
  var cssHeight = 0;
  var dpr = 1;
  var saveTimer = 0;
  var hintTimer = 0;
  var doorFlip = false;
  var rulerDrag = null;
  var rulerState = { visible: false, x: 0.5, y: 0.5, angle: 0 };
  var STORAGE_KEY = 'sudu-sketch-v3';
  var PREVIOUS_STORAGE_KEY = 'sudu-sketch-v2';
  var LEGACY_STORAGE_KEY = 'sudu-sketch-v1';
  var RULER_KEY = 'sudu-sketch-ruler-v1';
  // Legacy model units stay at two feet so v1-v3 drawings, opening lengths
  // and stencil sizes retain their dimensions. The visible/snap grid is finer.
  var GRID_SPACING = 28;
  var WORLD_DOTS_X = 64;
  var WORLD_DOTS_Y = 48;
  var WORLD_WIDTH = WORLD_DOTS_X * GRID_SPACING;
  var WORLD_HEIGHT = WORLD_DOTS_Y * GRID_SPACING;
  var DOT_FEET = 2;
  var GRID_FEET = 1;
  var MAJOR_GRID_FEET = 4;
  var GRID_STEP = GRID_SPACING * GRID_FEET / DOT_FEET;
  var camera = { x: 0, y: 0, scale: 1, fitted: false };
  var pointers = new Map();
  var gesture = null;
  var panDrag = null;
  var spaceHeld = false;
  var imageCache = new Map();
  var objectSerial = 0;
  var allowedTypes = ['pen', 'line', 'room', 'door', 'window', 'area', 'stencil', 'note'];
  var stencilCategory = 'cars';
  var stencilId = 'car-sedan';
  var stencilFilled = false;
  var stencilRotation = 0;
  var STENCIL_CATEGORY_LABELS = { cars: 'car', trees: 'tree', furniture: 'furniture' };
  var STENCILS = [
    { id: 'car-sedan', category: 'cars', name: 'Sedan', dots: [4, 2] },
    { id: 'car-suv', category: 'cars', name: 'SUV', dots: [4.5, 2.2] },
    { id: 'tree-canopy', category: 'trees', name: 'Canopy', dots: [3.2, 3.2] },
    { id: 'tree-column', category: 'trees', name: 'Column', dots: [2, 2] },
    { id: 'sofa', category: 'furniture', name: 'Sofa', dots: [3.5, 1.5] },
    { id: 'bed', category: 'furniture', name: 'Bed', dots: [3.5, 2.5] },
    { id: 'dining', category: 'furniture', name: 'Dining', dots: [3.5, 2.5] },
    { id: 'armchair', category: 'furniture', name: 'Chair', dots: [1.7, 1.7] }
  ];
  var toolHints = {
    pen: 'Draw freely. Strokes smooth automatically.',
    line: 'Drag between two points to draw a straight wall.',
    room: 'Drag diagonally to block out a room.',
    door: 'Click for a 3′ door or drag a custom opening. Select Door again or hold Shift to reverse the swing.',
    window: 'Click for a 4′ window or drag a custom opening.',
    area: 'Drag a rectangle to shade an area.',
    stencil: 'Choose a plan template, then click the grid to place it.',
    edit: 'Select any object. Drag to move it or use a diamond anchor to reshape it.',
    pan: 'Drag the drawing to move around. Pinch or scroll to zoom.',
    note: 'Select a point on the plan, then type a note.',
    erase: 'Select a line, room, opening, area, template or note to remove it.'
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeObjectId(type) {
    objectSerial += 1;
    return String(type || 'object').slice(0, 8) + '-' + Date.now().toString(36) + '-' + objectSerial.toString(36);
  }

  function ensureObjectId(object) {
    if (object && !object.id) object.id = makeObjectId(object.type);
    return object;
  }

  function makeLayer(id, name, layerObjects) {
    return {
      id: id,
      name: name,
      visible: true,
      locked: false,
      opacity: 1,
      underlay: null,
      objects: layerObjects || [],
      undoStack: [],
      redoStack: []
    };
  }

  function makeFloor() {
    return {
      layers: [makeLayer('base', 'Drawing', [])],
      activeLayerId: 'base',
      references: { below: false, above: false }
    };
  }

  function resetFloors() {
    floors = { basement: makeFloor(), main: makeFloor(), second: makeFloor() };
  }

  function cleanObjects(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(function (item) {
      return item && allowedTypes.indexOf(item.type) !== -1;
    }).slice(-200).map(ensureObjectId);
  }

  function floorState(key) {
    return floors[key] || floors.main;
  }

  function layerState(floor, id) {
    for (var i = 0; i < floor.layers.length; i++) {
      if (floor.layers[i].id === id) return floor.layers[i];
    }
    return floor.layers[0];
  }

  function activeFloorState() {
    return floorState(activeFloor);
  }

  function activeLayerState() {
    var floor = activeFloorState();
    return layerState(floor, floor.activeLayerId);
  }

  function bindActiveLayer() {
    var layer = activeLayerState();
    objects = layer.objects;
    undoStack = layer.undoStack;
    redoStack = layer.redoStack;
  }

  function setObjects(next) {
    var layer = activeLayerState();
    layer.objects = next;
    objects = next;
  }

  function floorHasDrawing(key) {
    return floorState(key).layers.some(function (layer) { return layer.objects.length > 0 || Boolean(layer.underlay); });
  }

  function visibleObjectsForFloor(key) {
    var visible = [];
    floorState(key).layers.forEach(function (layer) {
      if (layer.visible) visible = visible.concat(layer.objects);
    });
    return visible;
  }

  function adjacentFloor(direction) {
    var index = FLOOR_ORDER.indexOf(activeFloor);
    var next = direction === 'below' ? index - 1 : index + 1;
    return next >= 0 && next < FLOOR_ORDER.length ? FLOOR_ORDER[next] : null;
  }

  function currentSceneHasDrawing() {
    if (activeFloorState().layers.some(function (layer) { return layer.visible && (layer.objects.length || layer.underlay); })) return true;
    var refs = activeFloorState().references;
    var below = refs.below && adjacentFloor('below');
    var above = refs.above && adjacentFloor('above');
    return Boolean((below && floorHasDrawing(below)) || (above && floorHasDrawing(above)));
  }

  function serializeWorkspace() {
    var savedFloors = {};
    FLOOR_ORDER.forEach(function (key) {
      var floor = floorState(key);
      savedFloors[key] = {
        activeLayerId: floor.activeLayerId,
        references: clone(floor.references),
        layers: floor.layers.map(function (layer) {
          return {
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
            underlay: layer.underlay,
            objects: layer.objects
          };
        })
      };
    });
    return {
      version: 3,
      units: { feetPerDot: DOT_FEET, dots: [WORLD_DOTS_X, WORLD_DOTS_Y] },
      grid: { feetPerDot: GRID_FEET, majorEveryFeet: MAJOR_GRID_FEET },
      activeFloor: activeFloor,
      traceSerial: traceSerial,
      floors: savedFloors
    };
  }

  function persistDrawing() {
    window.clearTimeout(saveTimer);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeWorkspace())); } catch (error) {}
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistDrawing, 160);
  }

  function persistRuler() {
    try { localStorage.setItem(RULER_KEY, JSON.stringify(rulerState)); } catch (error) {}
  }

  function loadSaved() {
    resetFloors();
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(PREVIOUS_STORAGE_KEY) || 'null');
      if (saved && (saved.version === 2 || saved.version === 3) && saved.floors) {
        FLOOR_ORDER.forEach(function (key) {
          var source = saved.floors[key];
          if (!source || !Array.isArray(source.layers)) return;
          var layers = source.layers.slice(0, 12).map(function (layer, index) {
            var id = String(layer.id || (index ? 'trace-' + index : 'base')).slice(0, 36);
            var name = String(layer.name || (index ? 'Trace ' + index : 'Drawing')).slice(0, 32);
            var clean = makeLayer(id, name, cleanObjects(layer.objects));
            clean.visible = layer.visible !== false;
            clean.locked = Boolean(layer.locked);
            clean.opacity = Math.max(0.08, Math.min(1, Number(layer.opacity) || 1));
            clean.underlay = layer.underlay && typeof layer.underlay.src === 'string'
              ? {
                  name: String(layer.underlay.name || 'Imported trace').slice(0, 64),
                  src: layer.underlay.src,
                  x: Number(layer.underlay.x) || 0,
                  y: Number(layer.underlay.y) || 0,
                  width: Math.max(0.02, Number(layer.underlay.width) || 1),
                  height: Math.max(0.02, Number(layer.underlay.height) || 1)
                }
              : null;
            return clean;
          });
          if (!layers.some(function (layer) { return layer.id === 'base'; })) layers.unshift(makeLayer('base', 'Drawing', []));
          floors[key].layers = layers;
          floors[key].activeLayerId = layers.some(function (layer) { return layer.id === source.activeLayerId; })
            ? source.activeLayerId
            : layers[0].id;
          floors[key].references = {
            below: Boolean(source.references && source.references.below),
            above: Boolean(source.references && source.references.above)
          };
        });
        if (FLOOR_ORDER.indexOf(saved.activeFloor) !== -1) activeFloor = saved.activeFloor;
        traceSerial = Math.max(0, Number(saved.traceSerial) || 0);
      } else {
        var legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
        floors.main.layers[0].objects = cleanObjects(legacy);
      }
    } catch (error) {
      resetFloors();
      activeFloor = 'main';
      traceSerial = 0;
    }
    bindActiveLayer();

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
    GRID = document.documentElement.classList.contains('dm')
      ? 'rgba(245,243,236,0.26)'
      : 'rgba(23,22,19,0.26)';
    renderStencilChoices();
    render();
  }

  function remember(previous) {
    objects.forEach(ensureObjectId);
    undoStack.push(previous);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    scheduleSave();
    updateActions();
  }

  function updateActions() {
    var hasDrawing = objects.length > 0;
    var hasProjectDrawing = FLOOR_ORDER.some(floorHasDrawing);
    var hasSceneDrawing = currentSceneHasDrawing();
    var locked = activeLayerState().locked;
    actionButtons.undo.disabled = undoStack.length === 0;
    actionButtons.redo.disabled = redoStack.length === 0;
    actionButtons.clear.disabled = !hasDrawing || locked;
    actionButtons.save.disabled = !hasProjectDrawing;
    actionButtons.screenshot.disabled = !hasSceneDrawing;
    actionButtons.pdf.disabled = !hasSceneDrawing;
    actionButtons.send.disabled = !hasSceneDrawing;
    actionButtons.ruler.classList.toggle('is-active', rulerState.visible);
    actionButtons.ruler.setAttribute('aria-pressed', rulerState.visible ? 'true' : 'false');
    updateWorkspaceControls();
    syncMobileControls();
  }

  function renderTraceControls() {
    var floor = activeFloorState();
    traceLayers.textContent = '';
    floor.layers.forEach(function (layer) {
      var group = document.createElement('div');
      group.className = 'trace-layer';
      group.setAttribute('data-layer', layer.id);
      group.classList.toggle('is-active', floor.activeLayerId === layer.id);
      group.classList.toggle('is-hidden', !layer.visible);
      group.classList.toggle('is-locked', layer.locked);

      var select = document.createElement('button');
      select.type = 'button';
      select.className = 'trace-select';
      select.setAttribute('data-layer-select', layer.id);
      select.setAttribute('aria-pressed', floor.activeLayerId === layer.id ? 'true' : 'false');
      select.textContent = layer.name;
      group.appendChild(select);

      var visible = document.createElement('button');
      visible.type = 'button';
      visible.className = 'trace-visible';
      visible.setAttribute('data-layer-visible', layer.id);
      visible.setAttribute('aria-label', (layer.visible ? 'Hide ' : 'Show ') + layer.name);
      visible.setAttribute('aria-pressed', layer.visible ? 'true' : 'false');
      visible.textContent = layer.visible ? 'On' : 'Off';
      group.appendChild(visible);

      var lock = document.createElement('button');
      lock.type = 'button';
      lock.className = 'trace-lock';
      lock.setAttribute('data-layer-lock', layer.id);
      lock.setAttribute('aria-label', (layer.locked ? 'Unlock ' : 'Lock ') + layer.name);
      lock.setAttribute('aria-pressed', layer.locked ? 'true' : 'false');
      lock.textContent = layer.locked ? 'Lock' : 'Free';
      group.appendChild(lock);

      var opacity = document.createElement('input');
      opacity.type = 'range';
      opacity.className = 'trace-opacity';
      opacity.min = '8';
      opacity.max = '100';
      opacity.value = String(Math.round(layer.opacity * 100));
      opacity.setAttribute('data-layer-opacity', layer.id);
      opacity.setAttribute('aria-label', layer.name + ' opacity');
      group.appendChild(opacity);

      if (layer.underlay) {
        var calibrate = document.createElement('button');
        calibrate.type = 'button';
        calibrate.className = 'trace-scale';
        calibrate.setAttribute('data-layer-scale', layer.id);
        calibrate.setAttribute('aria-label', 'Set the real width of ' + layer.name);
        calibrate.textContent = 'Scale';
        group.appendChild(calibrate);
      }

      var copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'trace-copy';
      copy.setAttribute('data-layer-copy', layer.id);
      copy.setAttribute('aria-label', 'Duplicate ' + layer.name);
      copy.textContent = 'Copy';
      group.appendChild(copy);

      if (floor.layers.length > 1) {
        var up = document.createElement('button');
        up.type = 'button';
        up.className = 'trace-order';
        up.setAttribute('data-layer-order', layer.id);
        up.setAttribute('data-direction', 'up');
        up.setAttribute('aria-label', 'Move ' + layer.name + ' up');
        up.textContent = '↑';
        group.appendChild(up);

        var down = document.createElement('button');
        down.type = 'button';
        down.className = 'trace-order';
        down.setAttribute('data-layer-order', layer.id);
        down.setAttribute('data-direction', 'down');
        down.setAttribute('aria-label', 'Move ' + layer.name + ' down');
        down.textContent = '↓';
        group.appendChild(down);
      }

      if (layer.id !== 'base') {
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'trace-remove';
        remove.setAttribute('data-layer-remove', layer.id);
        remove.setAttribute('aria-label', 'Remove ' + layer.name);
        remove.textContent = '×';
        group.appendChild(remove);
      }
      traceLayers.appendChild(group);
    });
  }

  function updateWorkspaceControls() {
    floorButtons.forEach(function (button) {
      var key = button.getAttribute('data-floor');
      var on = key === activeFloor;
      button.classList.toggle('is-active', on);
      button.classList.toggle('has-content', floorHasDrawing(key));
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    var refs = activeFloorState().references;
    ['below', 'above'].forEach(function (direction) {
      var button = actionButtons['reference-' + direction];
      var available = Boolean(adjacentFloor(direction));
      button.disabled = !available;
      button.classList.toggle('is-active', available && refs[direction]);
      button.setAttribute('aria-pressed', available && refs[direction] ? 'true' : 'false');
    });
    actionButtons['add-trace'].disabled = activeFloorState().layers.length >= 12;
    renderTraceControls();
  }

  function resetDrawingInteraction() {
    active = null;
    selectedIndex = -1;
    resizeDrag = null;
    moveDrag = null;
    closeNoteComposer();
  }

  function selectFloor(next) {
    if (FLOOR_ORDER.indexOf(next) === -1 || next === activeFloor) return;
    persistDrawing();
    activeFloor = next;
    bindActiveLayer();
    resetDrawingInteraction();
    updateActions();
    render();
    setHint(FLOOR_LABELS[next] + ' floor — ' + activeLayerState().name + '.');
  }

  function selectLayer(id) {
    var floor = activeFloorState();
    var layer = layerState(floor, id);
    if (!layer || floor.activeLayerId === layer.id) return;
    floor.activeLayerId = layer.id;
    layer.visible = true;
    bindActiveLayer();
    resetDrawingInteraction();
    updateActions();
    render();
    setHint(layer.name + ' selected on the ' + FLOOR_LABELS[activeFloor].toLowerCase() + ' floor.');
  }

  function addTrace() {
    var floor = activeFloorState();
    if (floor.layers.length >= 12) return;
    traceSerial += 1;
    var id = 'trace-' + Date.now().toString(36) + '-' + traceSerial;
    var name = 'Trace ' + String(traceSerial).padStart(2, '0');
    floor.layers.push(makeLayer(id, name, []));
    floor.activeLayerId = id;
    bindActiveLayer();
    resetDrawingInteraction();
    scheduleSave();
    updateActions();
    render();
    setHint(name + ' added. Draw on it, or switch back to another layer.');
  }

  function toggleLayerVisibility(id) {
    var floor = activeFloorState();
    var layer = layerState(floor, id);
    if (!layer) return;
    layer.visible = !layer.visible;
    if (!layer.visible && floor.activeLayerId === layer.id) {
      var replacement = floor.layers.find(function (item) { return item.visible; });
      if (!replacement) {
        replacement = floor.layers[0];
        replacement.visible = true;
      }
      floor.activeLayerId = replacement.id;
      bindActiveLayer();
      resetDrawingInteraction();
    }
    scheduleSave();
    updateActions();
    render();
  }

  function toggleLayerLock(id) {
    var layer = layerState(activeFloorState(), id);
    if (!layer) return;
    layer.locked = !layer.locked;
    resetDrawingInteraction();
    scheduleSave();
    updateActions();
    render();
    setHint(layer.name + (layer.locked ? ' locked.' : ' unlocked.'));
  }

  function setLayerOpacity(id, value) {
    var layer = layerState(activeFloorState(), id);
    if (!layer) return;
    layer.opacity = Math.max(0.08, Math.min(1, Number(value) / 100));
    scheduleSave();
    render();
  }

  function calibrateUnderlay(id) {
    var layer = layerState(activeFloorState(), id);
    if (!layer || !layer.underlay) return;
    var currentFeet = Math.round(layer.underlay.width * WORLD_DOTS_X * DOT_FEET);
    var answer = window.prompt('How many feet wide is this imported trace?', String(currentFeet));
    var feet = Number(answer);
    if (!answer || !Number.isFinite(feet) || feet <= 0) return;
    var oldWidth = layer.underlay.width;
    var oldHeight = layer.underlay.height;
    var centreX = layer.underlay.x + oldWidth / 2;
    var centreY = layer.underlay.y + oldHeight / 2;
    layer.underlay.width = feet / (WORLD_DOTS_X * DOT_FEET);
    layer.underlay.height = oldHeight * layer.underlay.width / oldWidth;
    layer.underlay.x = centreX - layer.underlay.width / 2;
    layer.underlay.y = centreY - layer.underlay.height / 2;
    scheduleSave();
    render();
    setHint('Imported trace calibrated to ' + feet + '′ wide.');
  }

  function renameLayer(id) {
    var layer = layerState(activeFloorState(), id);
    if (!layer) return;
    var next = window.prompt('Layer name', layer.name);
    if (!next || !next.trim()) return;
    layer.name = next.trim().slice(0, 32);
    scheduleSave();
    renderTraceControls();
    setHint('Layer renamed ' + layer.name + '.');
  }

  function duplicateLayer(id) {
    var floor = activeFloorState();
    if (floor.layers.length >= 12) return;
    var source = layerState(floor, id);
    if (!source) return;
    traceSerial += 1;
    var copy = makeLayer('trace-' + Date.now().toString(36) + '-' + traceSerial, source.name + ' copy', clone(source.objects));
    copy.visible = source.visible;
    copy.locked = false;
    copy.opacity = source.opacity;
    copy.underlay = source.underlay ? clone(source.underlay) : null;
    var index = floor.layers.indexOf(source);
    floor.layers.splice(index + 1, 0, copy);
    floor.activeLayerId = copy.id;
    bindActiveLayer();
    resetDrawingInteraction();
    scheduleSave();
    updateActions();
    render();
    setHint(copy.name + ' added.');
  }

  function reorderLayer(id, direction) {
    var floor = activeFloorState();
    var index = floor.layers.findIndex(function (layer) { return layer.id === id; });
    if (index < 0) return;
    var next = direction === 'up' ? index + 1 : index - 1;
    if (next < 0 || next >= floor.layers.length) return;
    var moved = floor.layers.splice(index, 1)[0];
    floor.layers.splice(next, 0, moved);
    scheduleSave();
    renderTraceControls();
    render();
  }

  function importUnderlay(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setHint('Import a PNG, JPG or WebP trace image.');
      return;
    }
    var url = URL.createObjectURL(file);
    var image = new Image();
    image.onload = function () {
      var maxSide = 1800;
      var scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      var buffer = document.createElement('canvas');
      buffer.width = Math.max(1, Math.round(image.naturalWidth * scale));
      buffer.height = Math.max(1, Math.round(image.naturalHeight * scale));
      var bufferContext = buffer.getContext('2d');
      bufferContext.drawImage(image, 0, 0, buffer.width, buffer.height);
      var source = buffer.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);

      var floor = activeFloorState();
      traceSerial += 1;
      var layer = makeLayer('trace-' + Date.now().toString(36) + '-' + traceSerial, file.name.replace(/\.[^.]+$/, '').slice(0, 28) || 'Imported trace', []);
      var imageAspect = buffer.width / buffer.height;
      var worldAspect = WORLD_WIDTH / WORLD_HEIGHT;
      if (imageAspect > worldAspect) {
        layer.underlay = { name: file.name, src: source, x: 0.04, y: (1 - (0.92 * worldAspect / imageAspect)) / 2, width: 0.92, height: 0.92 * worldAspect / imageAspect };
      } else {
        layer.underlay = { name: file.name, src: source, x: (1 - (0.92 * imageAspect / worldAspect)) / 2, y: 0.04, width: 0.92 * imageAspect / worldAspect, height: 0.92 };
      }
      layer.opacity = 0.45;
      layer.locked = true;
      floor.layers.splice(1, 0, layer);
      imageCache.set(source, image);
      scheduleSave();
      updateActions();
      render();
      setHint('Trace imported and locked. Adjust its opacity in Layers.');
    };
    image.onerror = function () {
      URL.revokeObjectURL(url);
      setHint('That image could not be opened.');
    };
    image.src = url;
  }

  function removeTrace(id) {
    if (id === 'base') return;
    var floor = activeFloorState();
    var layer = layerState(floor, id);
    if (!layer || !window.confirm('Remove ' + layer.name + ' and its drawing?')) return;
    floor.layers = floor.layers.filter(function (item) { return item.id !== id; });
    if (floor.activeLayerId === id) floor.activeLayerId = floor.layers[0].id;
    bindActiveLayer();
    resetDrawingInteraction();
    scheduleSave();
    updateActions();
    render();
  }

  function toggleReference(direction) {
    if (!adjacentFloor(direction)) return;
    var refs = activeFloorState().references;
    refs[direction] = !refs[direction];
    scheduleSave();
    updateActions();
    render();
    setHint((refs[direction] ? 'Showing ' : 'Hiding ') + 'the ' + direction + ' floor outline.');
  }

  function resize() {
    var followFit = !camera.fitted || Math.abs(camera.scale - fittedScale(cssWidth, cssHeight)) < 0.0001;
    var centreX = (cssWidth / 2 - camera.x) / camera.scale;
    var centreY = (cssHeight / 2 - camera.y) / camera.scale;
    var rect = stage.getBoundingClientRect();
    cssWidth = Math.max(1, Math.round(rect.width));
    cssHeight = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (followFit) fitView();
    else {
      camera.x = cssWidth / 2 - centreX * camera.scale;
      camera.y = cssHeight / 2 - centreY * camera.scale;
      clampCamera();
    }
    positionRuler();
    render();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampCamera() {
    var padding = Math.min(84, Math.min(cssWidth, cssHeight) * 0.18);
    var drawnWidth = WORLD_WIDTH * camera.scale;
    var drawnHeight = WORLD_HEIGHT * camera.scale;
    camera.x = drawnWidth <= cssWidth
      ? (cssWidth - drawnWidth) / 2
      : clamp(camera.x, cssWidth - drawnWidth - padding, padding);
    camera.y = drawnHeight <= cssHeight
      ? (cssHeight - drawnHeight) / 2
      : clamp(camera.y, cssHeight - drawnHeight - padding, padding);
    updateZoomLevel();
  }

  function fittedScale(width, height) {
    var margin = Math.min(28, width * 0.03);
    return clamp(Math.min((width - margin * 2) / WORLD_WIDTH, (height - margin * 2) / WORLD_HEIGHT), 0.18, 3.5);
  }

  function fitView() {
    if (!cssWidth || !cssHeight) return;
    camera.scale = fittedScale(cssWidth, cssHeight);
    camera.x = (cssWidth - WORLD_WIDTH * camera.scale) / 2;
    camera.y = (cssHeight - WORLD_HEIGHT * camera.scale) / 2;
    camera.fitted = true;
    updateZoomLevel();
    render();
  }

  function zoomAt(nextScale, screenX, screenY) {
    var oldScale = camera.scale;
    var next = clamp(nextScale, 0.18, 4.5);
    var worldX = (screenX - camera.x) / oldScale;
    var worldY = (screenY - camera.y) / oldScale;
    camera.scale = next;
    camera.x = screenX - worldX * next;
    camera.y = screenY - worldY * next;
    camera.fitted = true;
    clampCamera();
    render();
  }

  function updateZoomLevel() {
    if (zoomLevel) zoomLevel.textContent = Math.round(camera.scale * 100) + '%';
    stage.style.setProperty('--grid-major-screen', GRID_STEP * MAJOR_GRID_FEET / GRID_FEET * camera.scale + 'px');
    if (rulerState.visible) positionRuler();
  }

  function screenPoint(point) {
    return {
      x: camera.x + point.x * WORLD_WIDTH * camera.scale,
      y: camera.y + point.y * WORLD_HEIGHT * camera.scale
    };
  }

  function pointFromEvent(event, snap) {
    var rect = canvas.getBoundingClientRect();
    var x = clamp((event.clientX - rect.left - camera.x) / camera.scale, 0, WORLD_WIDTH);
    var y = clamp((event.clientY - rect.top - camera.y) / camera.scale, 0, WORLD_HEIGHT);
    if (snap) {
      x = Math.round(x / GRID_STEP) * GRID_STEP;
      y = Math.round(y / GRID_STEP) * GRID_STEP;
    }
    return { x: x / WORLD_WIDTH, y: y / WORLD_HEIGHT };
  }

  function px(point) {
    return { x: point.x * WORLD_WIDTH, y: point.y * WORLD_HEIGHT };
  }

  function constrainToRuler(start, end) {
    var a = px(start);
    var b = px(end);
    var radians = rulerState.angle * Math.PI / 180;
    var ux = Math.cos(radians);
    var uy = Math.sin(radians);
    var distance = (b.x - a.x) * ux + (b.y - a.y) * uy;
    return {
      x: Math.max(0, Math.min(1, (a.x + ux * distance) / WORLD_WIDTH)),
      y: Math.max(0, Math.min(1, (a.y + uy * distance) / WORLD_HEIGHT))
    };
  }

  function drawGrid(target, width, height) {
    var outputScale = width / WORLD_WIDTH;
    var columns = Math.round(WORLD_WIDTH / GRID_STEP);
    var rows = Math.round(WORLD_HEIGHT / GRID_STEP);
    var majorEvery = MAJOR_GRID_FEET / GRID_FEET;
    target.save();
    target.fillStyle = GRID;
    // Integer indices keep the four-foot intersections fixed to world origin
    // during pan/zoom and avoid fractional-export offsets from modulo arithmetic.
    for (var column = 0; column <= columns; column++) {
      for (var row = 0; row <= rows; row++) {
        var major = column % majorEvery === 0 && row % majorEvery === 0;
        target.beginPath();
        target.arc(column * width / columns, row * height / rows, (major ? 1.2 : 0.8) * outputScale, 0, Math.PI * 2);
        target.fill();
      }
    }
    target.restore();
  }

  function drawOpening(target, object, width, height, outputScale) {
    object = resolvedOpening(object);
    var baseAlpha = target.globalAlpha;
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
      target.globalAlpha = baseAlpha * 0.72;
      target.beginPath();
      target.arc(0, 0, length, 0, direction * Math.PI / 2, direction < 0);
      target.stroke();
    }
    target.restore();
  }

  function drawArea(target, object, width, height, outputScale) {
    var baseAlpha = target.globalAlpha;
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
    target.globalAlpha = baseAlpha * 0.07;
    target.fillStyle = INK;
    target.fillRect(x, y, w, h);
    target.globalAlpha = baseAlpha * 0.18;
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
    target.globalAlpha = baseAlpha * 0.34;
    target.strokeStyle = INK;
    target.lineWidth = 0.75 * outputScale;
    target.strokeRect(x, y, w, h);
    if (w > 70 * outputScale && h > 42 * outputScale) {
      var widthFeet = Math.abs(object.end.x - object.start.x) * WORLD_DOTS_X * DOT_FEET;
      var heightFeet = Math.abs(object.end.y - object.start.y) * WORLD_DOTS_Y * DOT_FEET;
      var squareFeet = Math.round(widthFeet * heightFeet);
      target.globalAlpha = baseAlpha * 0.68;
      target.fillStyle = INK;
      target.font = '600 ' + Math.max(9, 10 * outputScale) + 'px Urbanist, sans-serif';
      target.textAlign = 'center';
      target.textBaseline = 'middle';
      target.fillText(squareFeet.toLocaleString() + ' SF', x + w / 2, y + h / 2);
    }
    target.restore();
  }

  function stencilSpec(id) {
    for (var i = 0; i < STENCILS.length; i++) {
      if (STENCILS[i].id === id) return STENCILS[i];
    }
    return STENCILS[0];
  }

  function roundedRectPath(target, x, y, width, height, radius) {
    var r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
    target.beginPath();
    target.moveTo(x + r, y);
    target.lineTo(x + width - r, y);
    target.quadraticCurveTo(x + width, y, x + width, y + r);
    target.lineTo(x + width, y + height - r);
    target.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    target.lineTo(x + r, y + height);
    target.quadraticCurveTo(x, y + height, x, y + height - r);
    target.lineTo(x, y + r);
    target.quadraticCurveTo(x, y, x + r, y);
    target.closePath();
  }

  function paintStencilShape(target, filled) {
    if (filled) target.fill();
    target.stroke();
  }

  function drawStencilGlyph(target, id, width, height, filled, outputScale) {
    var w = Math.max(12, Math.abs(width));
    var h = Math.max(12, Math.abs(height));
    var detail = filled ? PAPER : INK;
    target.save();
    target.strokeStyle = INK;
    target.fillStyle = INK;
    target.lineWidth = Math.max(1, 1.35 * outputScale);
    target.lineCap = 'round';
    target.lineJoin = 'round';

    if (id === 'car-sedan' || id === 'car-suv') {
      roundedRectPath(target, -w / 2, -h * 0.42, w, h * 0.84, id === 'car-suv' ? h * 0.15 : h * 0.3);
      paintStencilShape(target, filled);
      target.strokeStyle = detail;
      target.lineWidth = Math.max(1, 1.05 * outputScale);
      roundedRectPath(target, -w * 0.22, -h * 0.31, w * 0.47, h * 0.62, h * 0.12);
      target.stroke();
      target.beginPath();
      target.moveTo(-w * 0.28, -h * 0.4);
      target.lineTo(-w * 0.28, h * 0.4);
      target.moveTo(w * 0.31, -h * 0.4);
      target.lineTo(w * 0.31, h * 0.4);
      target.stroke();
      target.strokeStyle = INK;
      target.lineWidth = Math.max(1.2, 2.2 * outputScale);
      [-0.28, 0.28].forEach(function (side) {
        target.beginPath();
        target.moveTo(-w * 0.29, side * h * 1.5);
        target.lineTo(-w * 0.08, side * h * 1.5);
        target.moveTo(w * 0.08, side * h * 1.5);
        target.lineTo(w * 0.29, side * h * 1.5);
        target.stroke();
      });
    }

    if (id === 'tree-canopy' || id === 'tree-column') {
      var radius = Math.min(w, h) * (id === 'tree-column' ? 0.43 : 0.49);
      target.beginPath();
      target.arc(0, 0, radius, 0, Math.PI * 2);
      paintStencilShape(target, filled);
      target.strokeStyle = detail;
      target.lineWidth = Math.max(1, outputScale);
      target.beginPath();
      target.arc(0, 0, radius * 0.68, 0, Math.PI * 2);
      target.stroke();
      target.beginPath();
      target.moveTo(-radius * 0.48, 0);
      target.lineTo(radius * 0.48, 0);
      target.moveTo(0, -radius * 0.48);
      target.lineTo(0, radius * 0.48);
      target.stroke();
      target.fillStyle = detail;
      target.beginPath();
      target.arc(0, 0, Math.max(1.5, radius * 0.08), 0, Math.PI * 2);
      target.fill();
    }

    if (id === 'sofa') {
      roundedRectPath(target, -w / 2, -h / 2, w, h, h * 0.18);
      paintStencilShape(target, filled);
      target.strokeStyle = detail;
      target.lineWidth = Math.max(1, outputScale);
      roundedRectPath(target, -w * 0.36, -h * 0.27, w * 0.72, h * 0.54, h * 0.12);
      target.stroke();
      target.beginPath();
      target.moveTo(0, -h * 0.27);
      target.lineTo(0, h * 0.27);
      target.stroke();
    }

    if (id === 'bed') {
      roundedRectPath(target, -w / 2, -h / 2, w, h, h * 0.06);
      paintStencilShape(target, filled);
      target.strokeStyle = detail;
      target.lineWidth = Math.max(1, outputScale);
      target.beginPath();
      target.moveTo(-w * 0.2, -h / 2);
      target.lineTo(-w * 0.2, h / 2);
      target.stroke();
      roundedRectPath(target, -w * 0.42, -h * 0.34, w * 0.16, h * 0.29, h * 0.05);
      target.stroke();
      roundedRectPath(target, -w * 0.42, h * 0.05, w * 0.16, h * 0.29, h * 0.05);
      target.stroke();
    }

    if (id === 'dining') {
      roundedRectPath(target, -w * 0.34, -h * 0.3, w * 0.68, h * 0.6, h * 0.09);
      paintStencilShape(target, filled);
      target.strokeStyle = INK;
      var chairs = [[-0.42, -0.27], [-0.42, 0.27], [0.42, -0.27], [0.42, 0.27]];
      chairs.forEach(function (chair) {
        roundedRectPath(target, chair[0] * w - w * 0.07, chair[1] * h - h * 0.09, w * 0.14, h * 0.18, h * 0.04);
        paintStencilShape(target, filled);
      });
    }

    if (id === 'armchair') {
      roundedRectPath(target, -w / 2, -h / 2, w, h, h * 0.18);
      paintStencilShape(target, filled);
      target.strokeStyle = detail;
      roundedRectPath(target, -w * 0.28, -h * 0.29, w * 0.56, h * 0.58, h * 0.11);
      target.stroke();
    }
    target.restore();
  }

  function stencilBounds(object) {
    var quarterTurns = Math.round((Number(object.rotation) || 0) / 90);
    var swap = Math.abs(quarterTurns) % 2 === 1;
    var width = Math.abs(Number(object.width) || 0.08);
    var height = Math.abs(Number(object.height) || 0.08);
    var shownWidth = swap ? height * WORLD_HEIGHT / WORLD_WIDTH : width;
    var shownHeight = swap ? width * WORLD_WIDTH / WORLD_HEIGHT : height;
    return {
      left: object.point.x - shownWidth / 2,
      right: object.point.x + shownWidth / 2,
      top: object.point.y - shownHeight / 2,
      bottom: object.point.y + shownHeight / 2,
      swap: swap
    };
  }

  function drawStencil(target, object, width, height, outputScale) {
    var center = { x: object.point.x * width, y: object.point.y * height };
    target.save();
    target.translate(center.x, center.y);
    target.rotate((Number(object.rotation) || 0) * Math.PI / 180);
    drawStencilGlyph(
      target,
      object.stencil,
      Math.abs(object.width * width),
      Math.abs(object.height * height),
      Boolean(object.filled),
      outputScale
    );
    target.restore();
  }

  function drawObject(target, object, width, height) {
    var toPx = function (point) { return { x: point.x * width, y: point.y * height }; };
    var outputScale = width / WORLD_WIDTH;
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
      var roomWidth = Math.abs(roomEnd.x - roomStart.x);
      var roomHeight = Math.abs(roomEnd.y - roomStart.y);
      if (roomWidth > 70 * outputScale && roomHeight > 42 * outputScale) {
        var roomWidthFeet = Math.round(Math.abs(object.end.x - object.start.x) * WORLD_DOTS_X * DOT_FEET);
        var roomHeightFeet = Math.round(Math.abs(object.end.y - object.start.y) * WORLD_DOTS_Y * DOT_FEET);
        target.globalAlpha *= 0.58;
        target.font = '600 ' + Math.max(9, 10 * outputScale) + 'px Urbanist, sans-serif';
        target.textAlign = 'center';
        target.textBaseline = 'middle';
        target.fillText(roomWidthFeet + '′ × ' + roomHeightFeet + '′', (roomStart.x + roomEnd.x) / 2, (roomStart.y + roomEnd.y) / 2);
      }
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

    if (object.type === 'stencil') {
      target.restore();
      drawStencil(target, object, width, height, outputScale);
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

  function isResizableObject(object) {
    return object && ['line', 'room', 'door', 'window', 'area', 'stencil'].indexOf(object.type) !== -1;
  }

  function objectAnchors(object) {
    if (object && (object.type === 'door' || object.type === 'window')) object = resolvedOpening(object);
    if (!isResizableObject(object)) return [];
    if (object.type === 'line' || object.type === 'door' || object.type === 'window') {
      return [
        { name: 'start', point: object.start },
        { name: 'end', point: object.end }
      ];
    }

    if (object.type === 'stencil') {
      var bounds = stencilBounds(object);
      return [
        { name: 'nw', point: { x: bounds.left, y: bounds.top }, opposite: { x: bounds.right, y: bounds.bottom } },
        { name: 'ne', point: { x: bounds.right, y: bounds.top }, opposite: { x: bounds.left, y: bounds.bottom } },
        { name: 'se', point: { x: bounds.right, y: bounds.bottom }, opposite: { x: bounds.left, y: bounds.top } },
        { name: 'sw', point: { x: bounds.left, y: bounds.bottom }, opposite: { x: bounds.right, y: bounds.top } }
      ];
    }

    var left = Math.min(object.start.x, object.end.x);
    var right = Math.max(object.start.x, object.end.x);
    var top = Math.min(object.start.y, object.end.y);
    var bottom = Math.max(object.start.y, object.end.y);
    return [
      { name: 'nw', point: { x: left, y: top }, opposite: { x: right, y: bottom } },
      { name: 'ne', point: { x: right, y: top }, opposite: { x: left, y: bottom } },
      { name: 'se', point: { x: right, y: bottom }, opposite: { x: left, y: top } },
      { name: 'sw', point: { x: left, y: bottom }, opposite: { x: right, y: top } }
    ];
  }

  function drawSelection(target, object) {
    if (object.type === 'door' || object.type === 'window') object = resolvedOpening(object);
    var anchors = objectAnchors(object);
    target.save();
    target.strokeStyle = INK;
    target.lineWidth = 0.8;
    target.globalAlpha = 0.46;
    target.setLineDash([5, 5]);

    if (object.type === 'line' || object.type === 'door' || object.type === 'window') {
      var lineStart = px(object.start);
      var lineEnd = px(object.end);
      target.beginPath();
      target.moveTo(lineStart.x, lineStart.y);
      target.lineTo(lineEnd.x, lineEnd.y);
      target.stroke();
    } else if (object.type === 'stencil') {
      var bounds = stencilBounds(object);
      target.strokeRect(
        bounds.left * WORLD_WIDTH,
        bounds.top * WORLD_HEIGHT,
        (bounds.right - bounds.left) * WORLD_WIDTH,
        (bounds.bottom - bounds.top) * WORLD_HEIGHT
      );
    } else if (object.start && object.end) {
      var start = px(object.start);
      var end = px(object.end);
      target.strokeRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y)
      );
    } else {
      var box = objectBounds(object);
      target.strokeRect(
        box.left * WORLD_WIDTH,
        box.top * WORLD_HEIGHT,
        (box.right - box.left) * WORLD_WIDTH,
        (box.bottom - box.top) * WORLD_HEIGHT
      );
    }

    target.setLineDash([]);
    target.globalAlpha = 1;
    anchors.forEach(function (anchor) {
      var point = px(anchor.point);
      target.save();
      target.translate(point.x, point.y);
      target.rotate(Math.PI / 4);
      target.fillStyle = PAPER;
      target.strokeStyle = INK;
      target.lineWidth = 1.5;
      target.fillRect(-5, -5, 10, 10);
      target.strokeRect(-5, -5, 10, 10);
      target.restore();
      target.fillStyle = INK;
      target.beginPath();
      target.arc(point.x, point.y, 1.25, 0, Math.PI * 2);
      target.fill();
    });
    target.restore();
  }

  function objectBounds(object) {
    if (object.type === 'stencil') return stencilBounds(object);
    if (object.start && object.end) {
      return {
        left: Math.min(object.start.x, object.end.x),
        right: Math.max(object.start.x, object.end.x),
        top: Math.min(object.start.y, object.end.y),
        bottom: Math.max(object.start.y, object.end.y)
      };
    }
    if (object.type === 'pen' && object.points.length) {
      var xs = object.points.map(function (point) { return point.x; });
      var ys = object.points.map(function (point) { return point.y; });
      return { left: Math.min.apply(null, xs), right: Math.max.apply(null, xs), top: Math.min.apply(null, ys), bottom: Math.max.apply(null, ys) };
    }
    var point = object.point || { x: 0, y: 0 };
    var noteWidth = object.type === 'note' ? Math.max(70, String(object.text || '').length * 8) / WORLD_WIDTH : 0.02;
    return { left: point.x - 0.006, right: point.x + noteWidth, top: point.y - 0.012, bottom: point.y + 0.012 };
  }

  function drawFloorOutline(target, key, width, height, direction) {
    var outlineObjects = visibleObjectsForFloor(key);
    if (!outlineObjects.length) return;
    var outputScale = width / WORLD_WIDTH;
    target.save();
    target.strokeStyle = INK;
    target.fillStyle = INK;
    target.globalAlpha = direction === 'above' ? 0.2 : 0.27;
    target.lineWidth = 1.05 * outputScale;
    target.lineCap = 'round';
    target.lineJoin = 'round';
    target.setLineDash(direction === 'above'
      ? [2.5 * outputScale, 5 * outputScale]
      : [8 * outputScale, 5 * outputScale]);

    outlineObjects.forEach(function (object) {
      if (object.type === 'line' || object.type === 'door' || object.type === 'window') {
        if (object.type === 'door' || object.type === 'window') object = resolvedOpening(object);
        target.beginPath();
        target.moveTo(object.start.x * width, object.start.y * height);
        target.lineTo(object.end.x * width, object.end.y * height);
        target.stroke();
      }
      if (object.type === 'room' || object.type === 'area') {
        var startX = object.start.x * width;
        var startY = object.start.y * height;
        var endX = object.end.x * width;
        var endY = object.end.y * height;
        target.strokeRect(startX, startY, endX - startX, endY - startY);
      }
    });
    target.restore();
  }

  function imageForUnderlay(source) {
    if (!source) return null;
    if (imageCache.has(source)) return imageCache.get(source);
    var image = new Image();
    image.decoding = 'async';
    image.onload = render;
    image.src = source;
    imageCache.set(source, image);
    return image;
  }

  function drawUnderlay(target, underlay, width, height) {
    if (!underlay || !underlay.src) return;
    var image = imageForUnderlay(underlay.src);
    if (!image || !image.complete || !image.naturalWidth) return;
    target.save();
    target.drawImage(
      image,
      underlay.x * width,
      underlay.y * height,
      underlay.width * width,
      underlay.height * height
    );
    target.restore();
  }

  function drawScene(target, width, height, includeInteraction) {
    target.fillStyle = PAPER;
    target.fillRect(0, 0, width, height);
    drawGrid(target, width, height);

    var refs = activeFloorState().references;
    var below = adjacentFloor('below');
    var above = adjacentFloor('above');
    if (refs.below && below) drawFloorOutline(target, below, width, height, 'below');
    if (refs.above && above) drawFloorOutline(target, above, width, height, 'above');

    var floor = activeFloorState();
    floor.layers.forEach(function (layer) {
      if (!layer.visible || !layer.underlay) return;
      target.save();
      target.globalAlpha = layer.opacity;
      drawUnderlay(target, layer.underlay, width, height);
      target.restore();
    });
    floor.layers.forEach(function (layer) {
      if (!layer.visible) return;
      target.save();
      target.globalAlpha = layer.opacity * (layer.id === floor.activeLayerId ? 1 : 0.82);
      layer.objects.forEach(function (object) { drawObject(target, object, width, height); });
      target.restore();
    });

    if (!includeInteraction) return;
    if (active) drawObject(target, active, width, height);
    if (tool === 'edit' && !activeLayerState().locked && selectedIndex >= 0 && objects[selectedIndex]) {
      drawSelection(target, objects[selectedIndex]);
    }
  }

  function render() {
    if (!cssWidth || !cssHeight) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);
    drawScene(ctx, WORLD_WIDTH, WORLD_HEIGHT, true);
    ctx.restore();
  }

  function selectedStencilObject() {
    var object = selectedIndex >= 0 ? objects[selectedIndex] : null;
    return object && object.type === 'stencil' ? object : null;
  }

  function updateStencilPanel() {
    var selected = selectedStencilObject();
    var visible = tool === 'stencil' || (tool === 'edit' && selected);
    stencilPanel.hidden = !visible;
    if (!visible) return;
    var filled = selected ? Boolean(selected.filled) : stencilFilled;
    stencilStyleButtons.forEach(function (button) {
      var on = (button.getAttribute('data-stencil-style') === 'solid') === filled;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    stencilCategoryButtons.forEach(function (button) {
      var on = button.getAttribute('data-stencil-category') === stencilCategory;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderStencilChoices() {
    if (!stencilChoices) return;
    var selected = selectedStencilObject();
    var previewFilled = selected ? Boolean(selected.filled) : stencilFilled;
    stencilChoices.textContent = '';
    STENCILS.filter(function (spec) { return spec.category === stencilCategory; }).forEach(function (spec) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'stencil-choice';
      button.setAttribute('data-stencil-id', spec.id);
      button.setAttribute('aria-label', spec.name + ' template');
      button.setAttribute('aria-pressed', spec.id === stencilId ? 'true' : 'false');
      button.classList.toggle('is-active', spec.id === stencilId);
      var preview = document.createElement('canvas');
      preview.width = 116;
      preview.height = 72;
      preview.setAttribute('aria-hidden', 'true');
      var previewContext = preview.getContext('2d');
      previewContext.fillStyle = PAPER;
      previewContext.fillRect(0, 0, preview.width, preview.height);
      previewContext.translate(preview.width / 2, preview.height / 2);
      var ratio = spec.dots[0] / spec.dots[1];
      var shownWidth = ratio >= 1 ? 78 : 54 * ratio;
      var shownHeight = ratio >= 1 ? 78 / ratio : 54;
      drawStencilGlyph(previewContext, spec.id, shownWidth, shownHeight, previewFilled, 1.6);
      var label = document.createElement('span');
      label.textContent = spec.name;
      button.appendChild(preview);
      button.appendChild(label);
      stencilChoices.appendChild(button);
    });
    updateStencilPanel();
  }

  function chooseStencilCategory(category) {
    stencilCategory = category;
    var choices = STENCILS.filter(function (spec) { return spec.category === category; });
    if (!choices.some(function (spec) { return spec.id === stencilId; })) stencilId = choices[0].id;
    renderStencilChoices();
    setHint('Choose a ' + STENCIL_CATEGORY_LABELS[category] + ' template, then click the grid to place it.');
  }

  function chooseStencil(id) {
    var spec = stencilSpec(id);
    stencilId = spec.id;
    stencilCategory = spec.category;
    var selected = selectedStencilObject();
    if (tool === 'edit' && selected) {
      var previous = clone(objects);
      selected.stencil = spec.id;
      remember(previous);
      setHint(spec.name + ' template selected. Drag to move or use the anchors to resize.', 1800);
      render();
    }
    renderStencilChoices();
  }

  function setStencilStyle(filled) {
    var selected = selectedStencilObject();
    if (tool === 'edit' && selected) {
      if (Boolean(selected.filled) !== filled) {
        var previous = clone(objects);
        selected.filled = filled;
        remember(previous);
      }
      render();
    } else {
      stencilFilled = filled;
    }
    renderStencilChoices();
    setHint(selected
      ? (filled ? 'Template changed to solid black.' : 'Template changed to an architectural outline.')
      : (filled ? 'Templates will place as solid black.' : 'Templates will place as architectural outlines.'), 1600);
  }

  function rotateTemplate() {
    var selected = selectedStencilObject();
    if (tool === 'edit' && selected) {
      var previous = clone(objects);
      selected.rotation = ((Number(selected.rotation) || 0) + 90) % 360;
      remember(previous);
      render();
      setHint('Template rotated 90°.');
    } else {
      stencilRotation = (stencilRotation + 90) % 360;
      setHint('The next template will be rotated ' + stencilRotation + '°.');
    }
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
    resizeDrag = null;
    moveDrag = null;
    selectedIndex = -1;
    closeNoteComposer();
    stage.setAttribute('data-tool', tool);
    setHint(toolHints[tool]);
    toolButtons.forEach(function (button) {
      var on = button.getAttribute('data-tool') === tool;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    updateStencilPanel();
    syncMobileControls();
    render();
  }

  function closeMobilePanels() {
    mobileOpenPanel = '';
    if (mobileUi) mobileUi.classList.remove('is-tools-open');
    if (mobileSheet) mobileSheet.hidden = true;
    mobilePanels.forEach(function (panel) { panel.hidden = true; });
    stencilPanel.hidden = true;
    var levels = document.querySelector('#sketchLevels');
    if (levels) levels.classList.remove('is-mobile-open');
    var traceBar = document.querySelector('.trace-bar');
    if (traceBar) traceBar.classList.remove('is-mobile-open');
    syncMobileControls();
  }

  function openMobilePanel(name) {
    if (mobileOpenPanel === name && mobileSheet && !mobileSheet.hidden) {
      closeMobilePanels();
      return;
    }
    closeMobilePanels();
    mobileOpenPanel = name;
    if (mobileUi) mobileUi.classList.add('is-tools-open');
    if (mobileSheet) mobileSheet.hidden = false;
    mobilePanels.forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-mobile-panel') !== name;
    });
    syncMobileControls();
  }

  function openMobileSection(name) {
    var panel = document.querySelector(name === 'levels' ? '#sketchLevels' : '.trace-bar');
    var willOpen = name === 'templates' ? stencilPanel.hidden : panel && !panel.classList.contains('is-mobile-open');
    closeMobilePanels();
    if (willOpen) {
      mobileOpenPanel = name;
      if (name === 'templates') {
        setTool('stencil');
        stencilPanel.hidden = false;
      } else if (panel) panel.classList.add('is-mobile-open');
    }
    syncMobileControls();
  }

  function syncMobileControls() {
    if (!mobileUi) return;
    var floorName = document.querySelector('#mobileFloorName');
    if (floorName) floorName.textContent = FLOOR_LABELS[activeFloor];
    if (mobileToolsToggle) {
      var isOpen = !!mobileOpenPanel || !!document.querySelector('.trace-bar.is-mobile-open') || !stencilPanel.hidden;
      mobileToolsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
    mobileToolButtons.forEach(function (button) {
      var on = button.getAttribute('data-mobile-tool') === tool;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    mobileActionButtons.forEach(function (button) {
      var name = button.getAttribute('data-mobile-action');
      var source = actionButtons[name];
      if (source) button.disabled = source.disabled;
      if (['levels', 'layers', 'templates'].indexOf(name) !== -1) {
        var expanded = name === 'templates' ? !stencilPanel.hidden : mobileOpenPanel === name;
        button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (name === 'levels') button.setAttribute('aria-label', 'Levels, current floor: ' + FLOOR_LABELS[activeFloor]);
        if (name === 'layers') button.setAttribute('aria-label', 'Layers, active: ' + activeLayerState().name);
      }
      button.classList.toggle('is-active', name === 'ruler' && rulerState.visible);
    });
  }

  function closeNoteComposer() {
    noteComposer.hidden = true;
    notePoint = null;
    noteInput.value = '';
  }

  function openNoteComposer(point) {
    var screen = screenPoint(point);
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
      objects.push({ id: makeObjectId('note'), type: 'note', point: notePoint, text: text.slice(0, 80) });
      remember(previous);
    }
    closeNoteComposer();
    render();
  }

  function screenDistance(a, b) {
    return Math.hypot((a.x - b.x) * WORLD_WIDTH * camera.scale, (a.y - b.y) * WORLD_HEIGHT * camera.scale);
  }

  function wallSegments() {
    var segments = [];
    visibleObjectsForFloor(activeFloor).forEach(function (object) {
      ensureObjectId(object);
      if (object.type === 'line') segments.push({ start: object.start, end: object.end, hostId: object.id, hostEdge: 0 });
      if (object.type === 'room') {
        var a = object.start;
        var b = object.end;
        var corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
        for (var i = 0; i < 4; i++) segments.push({ start: corners[i], end: corners[(i + 1) % 4], hostId: object.id, hostEdge: i });
      }
    });
    return segments;
  }

  function objectById(id, floorKey) {
    var found = null;
    floorState(floorKey || activeFloor).layers.some(function (layer) {
      found = layer.objects.find(function (object) { return object.id === id; }) || null;
      return Boolean(found);
    });
    return found;
  }

  function segmentForHost(hostId, edge, floorKey) {
    var host = objectById(hostId, floorKey);
    if (!host) return null;
    if (host.type === 'line') return { start: host.start, end: host.end };
    if (host.type === 'room') {
      var a = host.start;
      var b = host.end;
      var corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      var index = clamp(Number(edge) || 0, 0, 3);
      return { start: corners[index], end: corners[(index + 1) % 4] };
    }
    return null;
  }

  function resolvedOpening(object, floorKey) {
    if (!object || !object.hostId) return object;
    var segment = segmentForHost(object.hostId, object.hostEdge, floorKey);
    if (!segment) return object;
    var a = px(segment.start);
    var b = px(segment.end);
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var length = Math.hypot(dx, dy);
    if (!length) return object;
    var ux = dx / length;
    var uy = dy / length;
    var openingLength = Math.min(length, Math.max(GRID_SPACING * 0.5, Number(object.lengthDots || (object.type === 'door' ? 1.5 : 2)) * GRID_SPACING));
    var halfFraction = openingLength / length / 2;
    var position = clamp(Number(object.position) || 0.5, halfFraction, 1 - halfFraction);
    var centre = { x: a.x + dx * position, y: a.y + dy * position };
    var copy = Object.assign({}, object);
    copy.start = { x: (centre.x - ux * openingLength / 2) / WORLD_WIDTH, y: (centre.y - uy * openingLength / 2) / WORLD_HEIGHT };
    copy.end = { x: (centre.x + ux * openingLength / 2) / WORLD_WIDTH, y: (centre.y + uy * openingLength / 2) / WORLD_HEIGHT };
    return copy;
  }

  function attachOpening(opening, point) {
    if (!opening) return opening;
    var centre = px(point || {
      x: (opening.start.x + opening.end.x) / 2,
      y: (opening.start.y + opening.end.y) / 2
    });
    var closest = null;
    wallSegments().forEach(function (segment) {
      if (segment.hostId === opening.id) return;
      var a = px(segment.start);
      var b = px(segment.end);
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) return;
      var t = clamp(((centre.x - a.x) * dx + (centre.y - a.y) * dy) / lengthSquared, 0, 1);
      var projected = { x: a.x + dx * t, y: a.y + dy * t };
      var distance = Math.hypot(centre.x - projected.x, centre.y - projected.y);
      if (!closest || distance < closest.distance) closest = { distance: distance, segment: segment, position: t };
    });
    if (!closest || closest.distance > GRID_SPACING * 1.35) return opening;
    var start = px(opening.start);
    var end = px(opening.end);
    opening.hostId = closest.segment.hostId;
    opening.hostEdge = closest.segment.hostEdge;
    opening.position = closest.position;
    opening.lengthDots = Math.max(0.5, Math.hypot(end.x - start.x, end.y - start.y) / GRID_SPACING);
    return opening;
  }

  function openingFromClick(type, point, flip) {
    var centre = px(point);
    var direction = { x: 1, y: 0 };
    var closest = null;

    wallSegments().forEach(function (segment) {
      var a = px(segment.start);
      var b = px(segment.end);
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) return;
      var t = ((centre.x - a.x) * dx + (centre.y - a.y) * dy) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
      var projected = { x: a.x + dx * t, y: a.y + dy * t };
      var distance = Math.hypot(centre.x - projected.x, centre.y - projected.y);
      if (!closest || distance < closest.distance) {
        var segmentLength = Math.sqrt(lengthSquared);
        closest = {
          distance: distance,
          point: projected,
          direction: { x: dx / segmentLength, y: dy / segmentLength },
          hostId: segment.hostId,
          hostEdge: segment.hostEdge,
          position: t
        };
      }
    });

    if (closest && closest.distance <= GRID_SPACING * 1.25) {
      centre = closest.point;
      direction = closest.direction;
    }

    var openingLength = GRID_SPACING * (type === 'door' ? 1.5 : 2);
    var half = openingLength / 2;
    var start = {
      x: Math.max(0, Math.min(WORLD_WIDTH, centre.x - direction.x * half)) / WORLD_WIDTH,
      y: Math.max(0, Math.min(WORLD_HEIGHT, centre.y - direction.y * half)) / WORLD_HEIGHT
    };
    var end = {
      x: Math.max(0, Math.min(WORLD_WIDTH, centre.x + direction.x * half)) / WORLD_WIDTH,
      y: Math.max(0, Math.min(WORLD_HEIGHT, centre.y + direction.y * half)) / WORLD_HEIGHT
    };
    return {
      id: makeObjectId(type),
      type: type,
      start: start,
      end: end,
      flip: Boolean(flip),
      hostId: closest && closest.distance <= GRID_SPACING * 1.25 ? closest.hostId : null,
      hostEdge: closest && closest.distance <= GRID_SPACING * 1.25 ? closest.hostEdge : null,
      position: closest && closest.distance <= GRID_SPACING * 1.25 ? closest.position : null,
      lengthDots: type === 'door' ? 1.5 : 2
    };
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
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) * camera.scale;
  }

  function pointInsideRect(point, start, end) {
    return point.x >= Math.min(start.x, end.x) && point.x <= Math.max(start.x, end.x) &&
      point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y);
  }

  function hitObject(object, point) {
        if (object.type === 'door' || object.type === 'window') object = resolvedOpening(object, key);
    if (object.type === 'pen') {
      for (var i = 1; i < object.points.length; i++) {
        if (distanceToSegment(point, object.points[i - 1], object.points[i]) < 16) return true;
      }
    }
    if (object.type === 'line' || object.type === 'door' || object.type === 'window') {
      return distanceToSegment(point, object.start, object.end) < 18;
    }
    if (object.type === 'area') return pointInsideRect(point, object.start, object.end);
    if (object.type === 'stencil') {
      var bounds = stencilBounds(object);
      return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
    }
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
      var tolerance = 16 / Math.max(0.18, camera.scale);
      return p.x >= n.x - tolerance && p.x <= n.x + Math.max(70, object.text.length * 8) + tolerance && Math.abs(p.y - n.y) < tolerance;
    }
    return false;
  }

  function hitAnchor(object, point) {
    var anchors = objectAnchors(object);
    for (var i = 0; i < anchors.length; i++) {
      if (screenDistance(anchors[i].point, point) <= 20) return anchors[i];
    }
    return null;
  }

  function selectableObjectAt(point) {
    for (var i = objects.length - 1; i >= 0; i--) {
      if (hitObject(objects[i], point)) return i;
    }
    return -1;
  }

  function beginResize(event, index, anchor) {
    canvas.setPointerCapture(event.pointerId);
    var previous = clone(objects);
    var object = objects[index];
    if (object && (object.type === 'door' || object.type === 'window') && object.hostId) {
      var resolved = resolvedOpening(object);
      object.start = resolved.start;
      object.end = resolved.end;
      delete object.hostId;
      delete object.hostEdge;
      delete object.position;
    }
    resizeDrag = {
      index: index,
      handle: anchor.name,
      opposite: anchor.opposite ? clone(anchor.opposite) : null,
      previous: previous,
      changed: false
    };
    setHint('Drag the anchor. It snaps to the 2′ dot grid.');
  }

  function beginEdit(event) {
    if (activeLayerState().locked) {
      setHint('This layer is locked. Unlock it in Layers to edit.');
      return;
    }
    var point = pointFromEvent(event, false);
    var anchor = selectedIndex >= 0 && objects[selectedIndex]
      ? hitAnchor(objects[selectedIndex], point)
      : null;
    if (anchor) {
      beginResize(event, selectedIndex, anchor);
      return;
    }

    if (selectedIndex >= 0 && objects[selectedIndex] && hitObject(objects[selectedIndex], point)) {
      beginMove(event, selectedIndex, point);
      return;
    }

    selectedIndex = selectableObjectAt(point);
    if (selectedIndex >= 0) {
      if (objects[selectedIndex].type === 'stencil') {
        var spec = stencilSpec(objects[selectedIndex].stencil);
        stencilId = spec.id;
        stencilCategory = spec.category;
        renderStencilChoices();
      }
      anchor = hitAnchor(objects[selectedIndex], point);
      if (anchor) beginResize(event, selectedIndex, anchor);
      else beginMove(event, selectedIndex, point);
      updateStencilPanel();
    } else {
      setHint(toolHints.edit);
      updateStencilPanel();
    }
    render();
  }

  function beginMove(event, index, point) {
    var object = objects[index];
    canvas.setPointerCapture(event.pointerId);
    var previous = clone(objects);
    if ((object.type === 'door' || object.type === 'window') && object.hostId) {
      var resolved = resolvedOpening(object);
      object.start = resolved.start;
      object.end = resolved.end;
      delete object.hostId;
      delete object.hostEdge;
      delete object.position;
    }
    moveDrag = {
      index: index,
      previous: previous,
      start: clone(point),
      original: clone(object),
      changed: false
    };
    updateStencilPanel();
    setHint('Drag to move. Release to snap to the 2′ grid.');
    render();
  }

  function moveResize(event) {
    if (!resizeDrag || !objects[resizeDrag.index]) return;
    var point = pointFromEvent(event, true);
    var object = objects[resizeDrag.index];
    if (object.type === 'line' || object.type === 'door' || object.type === 'window') {
      object[resizeDrag.handle] = point;
    } else if (object.type === 'stencil') {
      var centre = {
        x: (resizeDrag.opposite.x + point.x) / 2,
        y: (resizeDrag.opposite.y + point.y) / 2
      };
      var shownWidth = Math.max(GRID_STEP / WORLD_WIDTH, Math.abs(point.x - resizeDrag.opposite.x));
      var shownHeight = Math.max(GRID_STEP / WORLD_HEIGHT, Math.abs(point.y - resizeDrag.opposite.y));
      object.point = centre;
      if (stencilBounds(object).swap) {
        object.width = shownHeight * WORLD_HEIGHT / WORLD_WIDTH;
        object.height = shownWidth * WORLD_WIDTH / WORLD_HEIGHT;
      } else {
        object.width = shownWidth;
        object.height = shownHeight;
      }
    } else {
      object.start = clone(resizeDrag.opposite);
      object.end = point;
    }
    resizeDrag.changed = true;
    render();
  }

  function moveSelected(event) {
    if (!moveDrag || !objects[moveDrag.index]) return;
    var point = pointFromEvent(event, true);
    var object = objects[moveDrag.index];
    var original = moveDrag.original;
    var dx = point.x - moveDrag.start.x;
    var dy = point.y - moveDrag.start.y;
    var shiftPoint = function (source) {
      return { x: clamp(source.x + dx, 0, 1), y: clamp(source.y + dy, 0, 1) };
    };
    if (original.point) object.point = shiftPoint(original.point);
    if (original.start) object.start = shiftPoint(original.start);
    if (original.end) object.end = shiftPoint(original.end);
    if (original.points) object.points = original.points.map(shiftPoint);
    moveDrag.changed = true;
    render();
  }

  function finishMove(event) {
    if (!moveDrag) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    var previous = moveDrag.previous;
    var movedObject = objects[moveDrag.index];
    if (movedObject && (movedObject.type === 'door' || movedObject.type === 'window')) attachOpening(movedObject);
    var changed = moveDrag.changed && JSON.stringify(previous) !== JSON.stringify(objects);
    moveDrag = null;
    if (changed) remember(previous);
    setHint(changed ? 'Object moved.' : 'Object selected. Drag it to move or use an anchor to reshape it.', changed ? 1500 : 0);
    render();
  }

  function finishResize(event) {
    if (!resizeDrag) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    var previous = resizeDrag.previous;
    var resizedObject = objects[resizeDrag.index];
    if (resizedObject && (resizedObject.type === 'door' || resizedObject.type === 'window')) attachOpening(resizedObject);
    var changed = resizeDrag.changed && JSON.stringify(previous) !== JSON.stringify(objects);
    resizeDrag = null;
    if (changed) remember(previous);
    setHint(changed ? 'Resized. Drag another anchor or choose a drawing tool.' : toolHints.edit, changed ? 1800 : 0);
    render();
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

  function pointerScreen(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function beginPan(event) {
    var point = pointerScreen(event);
    canvas.setPointerCapture(event.pointerId);
    panDrag = { pointerId: event.pointerId, x: point.x, y: point.y, cameraX: camera.x, cameraY: camera.y };
    stage.classList.add('is-panning');
  }

  function movePan(event) {
    if (!panDrag || panDrag.pointerId !== event.pointerId) return false;
    var point = pointerScreen(event);
    camera.x = panDrag.cameraX + point.x - panDrag.x;
    camera.y = panDrag.cameraY + point.y - panDrag.y;
    camera.fitted = true;
    clampCamera();
    render();
    return true;
  }

  function endPan(event) {
    if (!panDrag || panDrag.pointerId !== event.pointerId) return false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    panDrag = null;
    stage.classList.remove('is-panning');
    return true;
  }

  function beginGesture() {
    var values = Array.from(pointers.values());
    if (values.length < 2) return;
    var a = values[0];
    var b = values[1];
    var centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gesture = {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      scale: camera.scale,
      worldX: (centre.x - camera.x) / camera.scale,
      worldY: (centre.y - camera.y) / camera.scale
    };
    active = null;
    resizeDrag = null;
    moveDrag = null;
    panDrag = null;
    stage.classList.add('is-panning');
  }

  function moveGesture() {
    if (!gesture || pointers.size < 2) return false;
    var values = Array.from(pointers.values());
    var a = values[0];
    var b = values[1];
    var centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    camera.scale = clamp(gesture.scale * distance / gesture.distance, 0.18, 4.5);
    camera.x = centre.x - gesture.worldX * camera.scale;
    camera.y = centre.y - gesture.worldY * camera.scale;
    camera.fitted = true;
    clampCamera();
    render();
    return true;
  }

  function onPointerDown(event) {
    if (event.pointerType === 'touch') {
      pointers.set(event.pointerId, pointerScreen(event));
      if (pointers.size >= 2) {
        canvas.setPointerCapture(event.pointerId);
        beginGesture();
        return;
      }
    }
    if (event.button !== undefined && event.button !== 0 && event.button !== 1) return;
    if (tool === 'pan' || spaceHeld || event.button === 1) { beginPan(event); return; }
    if (activeLayerState().locked) {
      setHint('This layer is locked. Select or unlock a drawing layer.');
      return;
    }
    if (tool === 'edit') { beginEdit(event); return; }
    canvas.setPointerCapture(event.pointerId);
    var snap = ['line', 'room', 'door', 'window', 'area', 'stencil'].indexOf(tool) !== -1;
    var point = pointFromEvent(event, snap);
    if (tool === 'erase') {
      eraseAt(point);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (tool === 'note') { openNoteComposer(point); return; }
    if (tool === 'stencil') {
      var spec = stencilSpec(stencilId);
      var previous = clone(objects);
      objects.push({
        id: makeObjectId('stencil'),
        type: 'stencil',
        stencil: spec.id,
        point: point,
        width: spec.dots[0] * GRID_SPACING / WORLD_WIDTH,
        height: spec.dots[1] * GRID_SPACING / WORLD_HEIGHT,
        rotation: stencilRotation,
        filled: stencilFilled
      });
      if (objects.length > 200) objects.shift();
      remember(previous);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      setHint(spec.name + ' placed. Choose Edit to move, resize, restyle or rotate it.', 2200);
      render();
      return;
    }
    if (tool === 'pen') active = { id: makeObjectId('pen'), type: 'pen', points: [point] };
    if (tool === 'line') active = { id: makeObjectId('line'), type: 'line', start: point, end: point };
    if (tool === 'room') active = { id: makeObjectId('room'), type: 'room', start: point, end: point };
    if (tool === 'door') active = { id: makeObjectId('door'), type: 'door', start: point, end: point, flip: event.shiftKey ? !doorFlip : doorFlip };
    if (tool === 'window') active = { id: makeObjectId('window'), type: 'window', start: point, end: point };
    if (tool === 'area') active = { id: makeObjectId('area'), type: 'area', start: point, end: point };
    render();
  }

  function onPointerMove(event) {
    if (event.pointerType === 'touch' && pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, pointerScreen(event));
      if (moveGesture()) return;
    }
    if (movePan(event)) return;
    if (resizeDrag) { moveResize(event); return; }
    if (moveDrag) { moveSelected(event); return; }
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
    if (event.pointerType === 'touch') {
      pointers.delete(event.pointerId);
      if (gesture) {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (pointers.size < 2) {
          gesture = null;
          stage.classList.remove('is-panning');
        }
        return;
      }
    }
    if (endPan(event)) return;
    if (resizeDrag) { finishResize(event); return; }
    if (moveDrag) { finishMove(event); return; }
    if (!active) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    var openingClick = (active.type === 'door' || active.type === 'window') && screenDistance(active.end, active.start) <= 16;
    if (openingClick) active = openingFromClick(active.type, active.start, active.flip);
    var valid = active.type === 'pen'
      ? active.points.length > 1
      : screenDistance(active.end, active.start) > 6;
    if (valid) {
      var previous = clone(objects);
      if (active.type === 'pen') active.points = smoothStroke(active.points);
      if (active.type === 'door' || active.type === 'window') attachOpening(active);
      objects.push(clone(active));
      if (objects.length > 200) objects.shift();
      remember(previous);
    }
    active = null;
    render();
  }

  function undo() {
    if (activeLayerState().locked) { setHint('Unlock this layer to change it.'); return; }
    if (!undoStack.length) return;
    selectedIndex = -1;
    redoStack.push(clone(objects));
    setObjects(undoStack.pop());
    updateStencilPanel();
    scheduleSave();
    updateActions();
    render();
  }

  function redo() {
    if (activeLayerState().locked) { setHint('Unlock this layer to change it.'); return; }
    if (!redoStack.length) return;
    selectedIndex = -1;
    undoStack.push(clone(objects));
    setObjects(redoStack.pop());
    updateStencilPanel();
    scheduleSave();
    updateActions();
    render();
  }

  function clearDrawing() {
    if (!objects.length || activeLayerState().locked) return;
    if (!window.confirm('Clear ' + activeLayerState().name + ' on the ' + FLOOR_LABELS[activeFloor].toLowerCase() + ' floor?')) return;
    var previous = clone(objects);
    setObjects([]);
    selectedIndex = -1;
    updateStencilPanel();
    remember(previous);
    render();
  }

  function saveDrawing() {
    if (!FLOOR_ORDER.some(floorHasDrawing)) return;
    persistDrawing();
    persistRuler();
    var blob = new Blob([JSON.stringify(serializeWorkspace(), null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'sudu-sketch-project.sudusketch';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (window.suduHaptics) window.suduHaptics.tick(10);
    setHint('Project file saved. Your work also stays on this device.', 2200);
  }

  function openProject(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var project = JSON.parse(String(reader.result || ''));
        if (!project || !project.floors || (project.version !== 2 && project.version !== 3)) throw new Error('Unsupported project');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        loadSaved();
        camera.fitted = false;
        fitView();
        updateActions();
        render();
        setHint('Project opened.');
      } catch (error) {
        setHint('That is not a valid SuDu sketch project.');
      }
    };
    reader.readAsText(file);
  }

  function exportSurface() {
    var width = 1800;
    var height = Math.round(width * WORLD_HEIGHT / WORLD_WIDTH);
    var out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    var outCtx = out.getContext('2d');
    drawScene(outCtx, width, height, false);
    return out;
  }

  function exportCanvas(callback) {
    var out = exportSurface();
    out.toBlob(callback, 'image/png', 0.94);
  }

  function captureScreenshot() {
    exportCanvas(function (blob) {
      if (!blob) return;
      var link = document.createElement('a');
      var url = URL.createObjectURL(blob);
      link.href = url;
      link.download = 'sudu-' + activeFloor + '-floor-sketch.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      setHint('Screenshot saved.', 1800);
    });
  }

  function capturePDF() {
    var surface = exportSurface();
    var encoded = surface.toDataURL('image/jpeg', 0.93).split(',')[1];
    var binary = atob(encoded);
    var imageBytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) imageBytes[i] = binary.charCodeAt(i);

    var parts = [];
    var offsets = [0];
    var length = 0;
    var encoder = new TextEncoder();
    var pushText = function (value) {
      var bytes = encoder.encode(value);
      parts.push(bytes);
      length += bytes.length;
    };
    var pushBytes = function (bytes) { parts.push(bytes); length += bytes.length; };
    var beginObject = function (number) { offsets[number] = length; pushText(number + ' 0 obj\n'); };

    pushText('%PDF-1.4\n%SuDu\n');
    beginObject(1); pushText('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    beginObject(2); pushText('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    beginObject(3); pushText('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
    beginObject(4);
    pushText('<< /Type /XObject /Subtype /Image /Width ' + surface.width + ' /Height ' + surface.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + imageBytes.length + ' >>\nstream\n');
    pushBytes(imageBytes);
    pushText('\nendstream\nendobj\n');
    var commands = 'q\n720 0 0 540 36 36 cm\n/Im0 Do\nQ\n';
    beginObject(5); pushText('<< /Length ' + commands.length + ' >>\nstream\n' + commands + 'endstream\nendobj\n');
    var xref = length;
    pushText('xref\n0 6\n0000000000 65535 f \n');
    for (var number = 1; number <= 5; number++) pushText(String(offsets[number]).padStart(10, '0') + ' 00000 n \n');
    pushText('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');

    var blob = new Blob(parts, { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'sudu-' + activeFloor + '-floor-sketch.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setHint('PDF saved.', 1800);
  }

  function positionRuler() {
    ruler.hidden = !rulerState.visible;
    ruler.style.left = (rulerState.x * 100) + '%';
    ruler.style.top = (rulerState.y * 100) + '%';
    ruler.style.transform = 'translate(-50%, -50%) rotate(' + rulerState.angle + 'deg)';
    var shown = Math.round(((rulerState.angle % 180) + 180) % 180);
    var feet = Math.max(2, Math.round((ruler.offsetWidth / Math.max(0.01, camera.scale) / GRID_SPACING) * DOT_FEET));
    rulerAngle.textContent = shown + '° · ' + feet + '′';
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
    if (!currentSceneHasDrawing()) return;
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
    if (!currentSceneHasDrawing()) return;
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
      data.append('sketch', blob, 'sudu-' + activeFloor + '-floor-sketch.png');
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

  if (mobileToolsToggle) mobileToolsToggle.addEventListener('click', function () {
    if (mobileToolsToggle.getAttribute('aria-expanded') === 'true') {
      stencilPanel.hidden = true;
      closeMobilePanels();
    } else {
      openMobilePanel('draw');
    }
  });

  mobileToolButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var source = document.querySelector('.tool-button[data-tool="' + button.getAttribute('data-mobile-tool') + '"]');
      closeMobilePanels();
      if (source) source.click();
    });
  });
  mobileActionButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var name = button.getAttribute('data-mobile-action');
      if (['levels', 'layers', 'templates'].indexOf(name) !== -1) {
        openMobileSection(name);
        return;
      }
      var source = actionButtons[name];
      if (source && !source.disabled) source.click();
      closeMobilePanels();
    });
  });
  document.querySelectorAll('[data-mobile-close]').forEach(function (button) {
    button.addEventListener('click', closeMobilePanels);
  });

  stencilCategoryButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      chooseStencilCategory(button.getAttribute('data-stencil-category'));
    });
  });
  stencilStyleButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setStencilStyle(button.getAttribute('data-stencil-style') === 'solid');
    });
  });
  stencilChoices.addEventListener('click', function (event) {
    var choice = event.target.closest('[data-stencil-id]');
    if (choice) chooseStencil(choice.getAttribute('data-stencil-id'));
  });

  floorButtons.forEach(function (button) {
    button.addEventListener('click', function () { selectFloor(button.getAttribute('data-floor')); });
  });
  actionButtons['add-trace'].addEventListener('click', addTrace);
  actionButtons['reference-below'].addEventListener('click', function () { toggleReference('below'); });
  actionButtons['reference-above'].addEventListener('click', function () { toggleReference('above'); });
  actionButtons['rotate-template'].addEventListener('click', rotateTemplate);
  traceLayers.addEventListener('click', function (event) {
    var select = event.target.closest('[data-layer-select]');
    var visible = event.target.closest('[data-layer-visible]');
    var lock = event.target.closest('[data-layer-lock]');
    var copy = event.target.closest('[data-layer-copy]');
    var order = event.target.closest('[data-layer-order]');
    var scale = event.target.closest('[data-layer-scale]');
    var remove = event.target.closest('[data-layer-remove]');
    if (select) selectLayer(select.getAttribute('data-layer-select'));
    if (visible) toggleLayerVisibility(visible.getAttribute('data-layer-visible'));
    if (lock) toggleLayerLock(lock.getAttribute('data-layer-lock'));
    if (copy) duplicateLayer(copy.getAttribute('data-layer-copy'));
    if (order) reorderLayer(order.getAttribute('data-layer-order'), order.getAttribute('data-direction'));
    if (scale) calibrateUnderlay(scale.getAttribute('data-layer-scale'));
    if (remove) removeTrace(remove.getAttribute('data-layer-remove'));
  });
  traceLayers.addEventListener('dblclick', function (event) {
    var select = event.target.closest('[data-layer-select]');
    if (select) renameLayer(select.getAttribute('data-layer-select'));
  });
  traceLayers.addEventListener('input', function (event) {
    var opacity = event.target.closest('[data-layer-opacity]');
    if (opacity) setLayerOpacity(opacity.getAttribute('data-layer-opacity'), opacity.value);
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', function (event) {
    event.preventDefault();
    var point = pointerScreen(event);
    zoomAt(camera.scale * Math.exp(-event.deltaY * 0.0015), point.x, point.y);
  }, { passive: false });
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
  actionButtons['open-project'].addEventListener('click', function () { projectInput.click(); });
  actionButtons['import-underlay'].addEventListener('click', function () { underlayInput.click(); });
  actionButtons['zoom-in'].addEventListener('click', function () { zoomAt(camera.scale * 1.22, cssWidth / 2, cssHeight / 2); });
  actionButtons['zoom-out'].addEventListener('click', function () { zoomAt(camera.scale / 1.22, cssWidth / 2, cssHeight / 2); });
  actionButtons['fit-view'].addEventListener('click', fitView);
  actionButtons.screenshot.addEventListener('click', captureScreenshot);
  actionButtons.pdf.addEventListener('click', capturePDF);
  actionButtons.send.addEventListener('click', openSendPanel);
  actionButtons['close-send'].addEventListener('click', closeSendPanel);
  form.addEventListener('submit', submitForm);
  underlayInput.addEventListener('change', function () {
    importUnderlay(underlayInput.files && underlayInput.files[0]);
    underlayInput.value = '';
  });
  projectInput.addEventListener('change', function () {
    openProject(projectInput.files && projectInput.files[0]);
    projectInput.value = '';
  });

  document.addEventListener('keydown', function (event) {
    if (event.target && /input|textarea/i.test(event.target.tagName)) return;
    if (event.key === 'Escape' && (mobileOpenPanel || document.querySelector('.trace-bar.is-mobile-open') || !stencilPanel.hidden)) {
      stencilPanel.hidden = true;
      closeMobilePanels();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      spaceHeld = true;
      return;
    }
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
    var keyTools = { p: 'pen', l: 'line', r: 'room', d: 'door', w: 'window', a: 'area', t: 'stencil', v: 'edit', h: 'pan', n: 'note', e: 'erase' };
    if (keyTools[event.key.toLowerCase()]) setTool(keyTools[event.key.toLowerCase()]);
    var floorKeys = { '1': 'basement', '2': 'main', '3': 'second' };
    if (floorKeys[event.key]) selectFloor(floorKeys[event.key]);
  });
  document.addEventListener('keyup', function (event) {
    if (event.code === 'Space') spaceHeld = false;
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
          html.classList.remove('dm', 'dmwarm', 'dmred');
          html.style.removeProperty('--dm-bg');
        } else if (value === '#C0431F') {
          html.classList.add('dm', 'dmwarm', 'dmred');
          html.style.setProperty('--dm-bg', value);
        } else {
          html.classList.add('dm');
          html.classList.remove('dmwarm', 'dmred');
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
  renderStencilChoices();
  buildThemePicker();
  buildCrosshair();
  positionRuler();
  updateActions();
  resize();
  syncPalette();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
