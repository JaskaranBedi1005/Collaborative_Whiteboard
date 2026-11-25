// Exports the whiteboard canvases as a JPEG image on the board's background
// colour, scaled down to approximately 1024 px wide for Gemini Flash.
//
// The background must match the current theme: in dark mode dark ink is drawn
// light, so a white background would make it nearly invisible to the AI.
function boardBackground(boardElement) {
  const color = getComputedStyle(boardElement).backgroundColor;
  // Fall back to white if the colour is missing or transparent.
  return color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent' ? color : '#ffffff';
}

export function getBoardSnapshot(boardElement, targetWidth = 1024) {
  if (!boardElement) return null;
  // Layers marked data-export="false" (the fading laser pointer) are left out.
  const canvases = boardElement.querySelectorAll('canvas:not([data-export="false"])');
  if (canvases.length === 0) return null;

  const baseCanvas = canvases[0];
  const srcWidth = baseCanvas.width;
  const srcHeight = baseCanvas.height;
  if (!srcWidth || !srcHeight) return null;

  const scale = Math.min(1, targetWidth / srcWidth);
  const outWidth = Math.round(srcWidth * scale);
  const outHeight = Math.round(srcHeight * scale);

  const offscreen = document.createElement('canvas');
  offscreen.width = outWidth;
  offscreen.height = outHeight;
  const ctx = offscreen.getContext('2d');

  // Must fill: the canvas layers are transparent, and JPEG would otherwise
  // render transparent areas as black.
  ctx.fillStyle = boardBackground(boardElement);
  ctx.fillRect(0, 0, outWidth, outHeight);

  // Draw the base layer (finished strokes) and live layer (in-progress lines)
  for (const canvas of canvases) {
    ctx.drawImage(canvas, 0, 0, outWidth, outHeight);
  }

  return offscreen.toDataURL('image/jpeg', 0.85);
}
