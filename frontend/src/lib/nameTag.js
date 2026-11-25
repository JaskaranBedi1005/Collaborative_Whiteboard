// Draws a small name tag (a rounded pill) next to the tip of a line someone
// else is drawing, in the colour they are drawing with.

import { displayColor } from './theme.js';

const FONT = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PAD_X = 7;
const HEIGHT = 20;
const OFFSET = 12; // gap between the pen tip and the tag
const MARGIN = 6; // keep the tag inside the board

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// `color` is the stroke colour as saved; `theme` picks the readable version.
export function drawNameTag(ctx, { name, x, y, color, theme, alpha = 1, bounds }) {
  if (!name) return;
  const background = color ? displayColor(color, theme) : '#6b7280';
  // Dark text on light colours (yellow, cyan, light ink), white text otherwise.
  const text = luminance(background) > 0.6 ? '#111827' : '#ffffff';

  ctx.save();
  ctx.font = FONT;
  const width = Math.ceil(ctx.measureText(name).width) + PAD_X * 2;

  // Below-right of the tip, flipped to the other side near the board's edges.
  let left = x + OFFSET;
  let top = y + OFFSET;
  if (bounds) {
    if (left + width > bounds.width - MARGIN) left = x - OFFSET - width;
    if (top + HEIGHT > bounds.height - MARGIN) top = y - OFFSET - HEIGHT;
    left = Math.max(MARGIN, left);
    top = Math.max(MARGIN, top);
  }

  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = background;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, width, HEIGHT, HEIGHT / 2);
  else ctx.rect(left, top, width, HEIGHT); // older browsers
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = text;
  ctx.textBaseline = 'middle';
  ctx.fillText(name, left + PAD_X, top + HEIGHT / 2 + 0.5);
  ctx.restore();
}
