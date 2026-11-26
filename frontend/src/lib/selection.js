// Geometry for the Select tool: which line was clicked, which lines a
// dragged box touches, the box around a selection, and moving lines.
//
// Eraser strokes are not selectable: they are invisible "holes", and picking
// one up by accident would be confusing.

const CLICK_TOLERANCE = 6; // extra pixels around a line that still count as "on it"

export const isSelectable = (stroke) => stroke?.tool !== 'eraser' && stroke?.points?.length > 0;

// Bounding box of a line, including its thickness.
export function strokeBounds(stroke) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of stroke.points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const pad = (stroke.size ?? 0) / 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

// Box around several lines (null when there are none).
export function selectionBounds(strokes) {
  if (strokes.length === 0) return null;
  const boxes = strokes.map(strokeBounds);
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

export function pointInBox(x, y, box, margin = 0) {
  return (
    box !== null &&
    x >= box.minX - margin &&
    x <= box.maxX + margin &&
    y >= box.minY - margin &&
    y <= box.maxY + margin
  );
}

function distanceToSegment(px, py, [x0, y0], [x1, y1]) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSq));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

export function hitStroke(stroke, x, y) {
  if (!isSelectable(stroke)) return false;
  const reach = (stroke.size ?? 0) / 2 + CLICK_TOLERANCE;
  if (!pointInBox(x, y, strokeBounds(stroke), CLICK_TOLERANCE)) return false;
  const { points } = stroke;
  if (points.length === 1) return Math.hypot(x - points[0][0], y - points[0][1]) <= reach;
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(x, y, points[i - 1], points[i]) <= reach) return true;
  }
  return false;
}

// The top-most line under the point (later lines are drawn on top).
export function topStrokeAt(strokes, x, y) {
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (hitStroke(strokes[i], x, y)) return strokes[i];
  }
  return null;
}

// Do segments p-q and r-s cross?
function segmentsCross(p, q, r, s) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = cross(r, s, p);
  const d2 = cross(r, s, q);
  const d3 = cross(p, q, r);
  const d4 = cross(p, q, s);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// Does the segment a-b touch the box? (An end inside it, or crossing an edge.)
function segmentTouchesBox(a, b, box) {
  if (pointInBox(a[0], a[1], box) || pointInBox(b[0], b[1], box)) return true;
  const tl = [box.minX, box.minY];
  const tr = [box.maxX, box.minY];
  const br = [box.maxX, box.maxY];
  const bl = [box.minX, box.maxY];
  return (
    segmentsCross(a, b, tl, tr) ||
    segmentsCross(a, b, tr, br) ||
    segmentsCross(a, b, br, bl) ||
    segmentsCross(a, b, bl, tl)
  );
}

// Lines that touch the dragged box: a point inside it, or a segment crossing
// it (fast strokes can have points far apart, on both sides of the box).
export function strokesInRect(strokes, rect) {
  const box = {
    minX: Math.min(rect.x0, rect.x1),
    minY: Math.min(rect.y0, rect.y1),
    maxX: Math.max(rect.x0, rect.x1),
    maxY: Math.max(rect.y0, rect.y1),
  };
  return strokes.filter((s) => {
    if (!isSelectable(s)) return false;
    const { points } = s;
    if (points.length === 1) return pointInBox(points[0][0], points[0][1], box);
    for (let i = 1; i < points.length; i++) {
      if (segmentTouchesBox(points[i - 1], points[i], box)) return true;
    }
    return false;
  });
}

const round1 = (n) => Math.round(n * 10) / 10;

// Same line (same id, so it keeps its place in the drawing order), moved.
export function translateStroke(stroke, dx, dy) {
  return { ...stroke, points: stroke.points.map(([x, y]) => [round1(x + dx), round1(y + dy)]) };
}
