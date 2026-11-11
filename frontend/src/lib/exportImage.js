// Exports the whiteboard canvases as a JPEG image on a solid white background,
// scaled down to approximately 1024 px wide for Gemini Flash.

export function getBoardSnapshot(boardElement, targetWidth = 1024) {
  if (!boardElement) return null;
  const canvases = boardElement.querySelectorAll('canvas');
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

  // Must fill with white: the canvas layers are transparent,
  // and JPEG would otherwise render transparent areas as black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outWidth, outHeight);

  // Draw the base layer (finished strokes) and live layer (in-progress lines)
  for (const canvas of canvases) {
    ctx.drawImage(canvas, 0, 0, outWidth, outHeight);
  }

  return offscreen.toDataURL('image/jpeg', 0.85);
}
