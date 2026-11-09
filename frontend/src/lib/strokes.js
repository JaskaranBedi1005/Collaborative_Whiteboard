// A "stroke" is one continuous line drawn without lifting the pen.
// The whole board is just an ordered list of strokes, which keeps the data
// tiny and easy to send to other users (Phase 2) and save in DynamoDB (Phase 3).
//
// Shape of a stroke:
// { id, tool: 'pen' | 'eraser', color, size, points: [[x, y], [x, y], ...] }

export const BOARD_BACKGROUND = '#ffffff';

// The eraser paints with the background color, and is wider than the pen so
// it is comfortable to use.
const ERASER_SIZE_MULTIPLIER = 3;

// Starts with a timestamp so strokes sort in drawing order (used in Phase 3),
// plus a random part so two users drawing at the same millisecond don't clash.
export function createStrokeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createStroke({ tool, color, size }) {
  const isEraser = tool === 'eraser';
  return {
    id: createStrokeId(),
    tool,
    color: isEraser ? BOARD_BACKGROUND : color,
    size: isEraser ? size * ERASER_SIZE_MULTIPLIER : size,
    points: [],
  };
}

// Draws one stroke. Instead of joining points with straight lines (which looks
// jagged), it draws smooth curves through the midpoints between points.
export function drawStroke(ctx, stroke) {
  const { points, color, size } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (points.length === 1) {
    // A single click draws a dot.
    const [x, y] = points[0];
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
      const [x, y] = points[i];
      const [nx, ny] = points[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const [lx, ly] = points[points.length - 1];
    ctx.lineTo(lx, ly);
    ctx.stroke();
  }

  ctx.restore();
}
