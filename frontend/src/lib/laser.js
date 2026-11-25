// Laser pointer: a glowing trail that fades out shortly after it is drawn.
// It is for pointing while you talk, so it is never saved and can't be undone.
//
// Over the network it reuses the live-preview "progress" message with
// stroke.tool === 'laser'. The server already forwards those without saving
// them, and because no final "stroke" message is ever sent, nothing is stored.

import { drawNameTag } from './nameTag.js';

export const LASER_COLOR = '#ef4444';
export const LASER_FADE_MS = 1500;
const LASER_WIDTH = 4;

// Holds every trail on screen (yours and other people's), each point stamped
// with the time it appeared: { [id]: { color, points: [[x, y, time], ...] } }.
export function createLaserTrails() {
  const trails = new Map();
  let onChange = null;

  return {
    // `spreadMs`: points from the network arrive in batches (one every ~50 ms).
    // Spreading their times across the batch makes the fade as smooth as a
    // local trail instead of stepping once per batch.
    // `label`: the pointer's name, shown at the tip (other people's trails only).
    add(id, points, { color = LASER_COLOR, spreadMs = 0, label = '' } = {}) {
      if (!points.length) return;
      const now = performance.now();
      let trail = trails.get(id);
      if (!trail) {
        trail = { color, label, points: [] };
        trails.set(id, trail);
      }
      const step = points.length > 1 ? spreadMs / (points.length - 1) : 0;
      points.forEach(([x, y], i) => {
        trail.points.push([x, y, now - spreadMs + i * step]);
      });
      onChange?.();
    },

    // Drops faded points; returns true while anything is still visible.
    prune(now) {
      for (const [id, trail] of trails) {
        trail.points = trail.points.filter((p) => now - p[2] < LASER_FADE_MS);
        if (trail.points.length === 0) trails.delete(id);
      }
      return trails.size > 0;
    },

    draw(ctx, now, { theme, bounds } = {}) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = LASER_WIDTH;
      for (const { color, points } of trails.values()) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        // Each segment fades with the age of its newer end.
        for (let i = 1; i < points.length; i++) {
          const [x0, y0] = points[i - 1];
          const [x1, y1, t] = points[i];
          ctx.globalAlpha = Math.max(0, 1 - (now - t) / LASER_FADE_MS);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        // Bright dot at the tip.
        const [hx, hy, ht] = points[points.length - 1];
        ctx.globalAlpha = Math.max(0, 1 - (now - ht) / LASER_FADE_MS);
        ctx.beginPath();
        ctx.arc(hx, hy, LASER_WIDTH, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Name tags on top, fading with the trail's tip.
      for (const { color, label, points } of trails.values()) {
        if (!label) continue;
        const [hx, hy, ht] = points[points.length - 1];
        const alpha = Math.max(0, 1 - (now - ht) / LASER_FADE_MS);
        drawNameTag(ctx, { name: label, x: hx, y: hy, color, theme, alpha, bounds });
      }
    },

    // Called whenever points are added, so the drawing loop can wake up.
    setOnChange(fn) {
      onChange = fn;
    },
  };
}
