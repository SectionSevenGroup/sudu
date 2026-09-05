/* Exact boundary geometry for Sketch. Parameters stay attached to the original
   wall, so a cut survives editing, saving and exporting without flattening arcs. */
(function (root) {
  'use strict';
  var EPS = 1e-7, TAU = Math.PI * 2;
  function wrap(t) { return ((t % 1) + 1) % 1; }
  function point(path, t) {
    if (path.curve) {
      var c = path.curve, a = c.angle + c.sweep * t;
      return { x: c.x + c.radius * Math.cos(a), y: c.y + c.radius * Math.sin(a) };
    }
    return { x: path.a.x + (path.b.x - path.a.x) * t, y: path.a.y + (path.b.y - path.a.y) * t };
  }
  function parameter(path, p) {
    if (path.curve) {
      var c = path.curve, a = Math.atan2(p.y - c.y, p.x - c.x);
      return wrap((c.sweep < 0 ? c.angle - a : a - c.angle) / TAU) * TAU / Math.abs(c.sweep);
    }
    var dx = path.b.x - path.a.x, dy = path.b.y - path.a.y;
    return ((p.x - path.a.x) * dx + (p.y - path.a.y) * dy) / (dx * dx + dy * dy);
  }
  function cuts(path) {
    return (Array.isArray(path.cuts) ? path.cuts : []).filter(function (c) {
      return c && c.edge === path.edge && Number.isFinite(c.from) && Number.isFinite(c.to) &&
        c.from >= 0 && c.to <= 1 && c.to > c.from;
    }).sort(function (a, b) { return a.from - b.from; });
  }
  function visible(path, t) {
    if (path.closed) t = wrap(t);
    if (t < -EPS || t > 1 + EPS) return false;
    var removed = cuts(path);
    if (path.closed && (t < EPS || t > 1 - EPS) && removed.some(function (c) { return c.from === 0; }) &&
      removed.some(function (c) { return c.to === 1; })) return false;
    return !removed.some(function (c) { return t > c.from + EPS && t < c.to - EPS; });
  }
  function ranges(path) {
    var result = [], end = 0;
    cuts(path).forEach(function (c) {
      if (c.from > end + EPS) result.push([end, c.from]);
      end = Math.max(end, c.to);
    });
    if (end < 1 - EPS) result.push([end, 1]);
    return result;
  }
  function intersections(a, b) {
    var points = [];
    if (!a.curve && !b.curve) {
      var ux = a.b.x - a.a.x, uy = a.b.y - a.a.y;
      var vx = b.b.x - b.a.x, vy = b.b.y - b.a.y;
      var den = ux * vy - uy * vx;
      if (Math.abs(den) < EPS) return []; // Coincident walls have no unique crossing.
      var t = ((b.a.x - a.a.x) * vy - (b.a.y - a.a.y) * vx) / den;
      points.push(point(a, t));
    } else if (a.curve && b.curve) {
      var c = a.curve, d = b.curve, dx = d.x - c.x, dy = d.y - c.y;
      var length = Math.hypot(dx, dy);
      if (length < EPS || length >= c.radius + d.radius - EPS || length <= Math.abs(c.radius - d.radius) + EPS) return [];
      var along = (c.radius * c.radius - d.radius * d.radius + length * length) / (2 * length);
      var h = Math.sqrt(Math.max(0, c.radius * c.radius - along * along));
      [-1, 1].forEach(function (sign) {
        points.push({ x: c.x + dx * along / length - sign * dy * h / length,
          y: c.y + dy * along / length + sign * dx * h / length });
      });
    } else {
      var line = a.curve ? b : a, circle = (a.curve ? a : b).curve;
      var lx = line.b.x - line.a.x, ly = line.b.y - line.a.y;
      var fx = line.a.x - circle.x, fy = line.a.y - circle.y;
      var aa = lx * lx + ly * ly, bb = 2 * (fx * lx + fy * ly);
      var cc = fx * fx + fy * fy - circle.radius * circle.radius, disc = bb * bb - 4 * aa * cc;
      if (aa < EPS || disc <= EPS) return []; // Tangency must not split a wall.
      [-1, 1].forEach(function (sign) { points.push(point(line, (-bb + sign * Math.sqrt(disc)) / (2 * aa))); });
    }
    return points.filter(function (p) { return visible(a, parameter(a, p)) && visible(b, parameter(b, p)); });
  }
  function intervals(path, all) {
    var stops = path.closed ? [] : [0, 1];
    cuts(path).forEach(function (c) { stops.push(c.from, c.to); });
    all.forEach(function (other) {
      if (other === path) return;
      intersections(path, other).forEach(function (p) { stops.push(parameter(path, p)); });
    });
    stops = stops.map(function (t) { return path.closed ? wrap(t) : Math.max(0, Math.min(1, t)); })
      .sort(function (a, b) { return a - b; }).filter(function (t, i, values) { return !i || t - values[i - 1] > EPS; });
    if (stops.length < 2) return [];
    var result = [];
    for (var i = 0; i < stops.length - (path.closed ? 0 : 1); i++) {
      var from = stops[i], to = i + 1 < stops.length ? stops[i + 1] : stops[0] + 1;
      if (to - from > EPS && visible(path, (from + to) / 2)) result.push({ path: path, from: from, to: to });
    }
    return result;
  }
  function nearest(paths, p, tolerance) {
    var best = null, distance = tolerance;
    paths.forEach(function (path) {
      if (path.targetable === false) return;
      var t = parameter(path, p);
      var projected = point(path, Math.max(0, Math.min(1, t)));
      var lowerBound = path.curve ? Math.abs(Math.hypot(p.x - path.curve.x, p.y - path.curve.y) - path.curve.radius)
        : Math.hypot(p.x - projected.x, p.y - projected.y);
      if (lowerBound > distance) return;
      intervals(path, paths).forEach(function (part) {
        var candidates = [t, part.from, part.to];
        if (path.closed) candidates.push(t + 1, t - 1);
        candidates.forEach(function (value) {
          var q = point(path, Math.max(part.from, Math.min(part.to, value)));
          var d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d <= distance) { distance = d; best = part; }
        });
      });
    });
    return best;
  }
  function addCut(path, from, to) {
    var next = cuts(path).slice();
    if (to > 1) { next.push({edge:path.edge, from:from, to:1}, {edge:path.edge, from:0, to:to - 1}); }
    else next.push({edge:path.edge, from:from, to:to});
    next.sort(function (a, b) { return a.from - b.from; });
    var merged = [];
    next.forEach(function (c) {
      var last = merged[merged.length - 1];
      if (last && c.from <= last.to + EPS) last.to = Math.max(last.to, c.to);
      else merged.push({edge:c.edge, from:c.from, to:c.to});
    });
    return (path.cuts || []).filter(function (c) { return c && c.edge !== path.edge; }).concat(merged);
  }
  var api = {point:point, parameter:parameter, cuts:cuts, visible:visible, ranges:ranges,
    intersections:intersections, intervals:intervals, nearest:nearest, addCut:addCut};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SketchTrim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
