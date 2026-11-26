import { useEffect, useRef } from 'react';
import { LASER_COLOR } from '../lib/laser';
import { drawNameTag } from '../lib/nameTag';
import { createStroke, createStrokeId, drawStroke } from '../lib/strokes';

// Ignore tiny mouse movements so strokes stay small (fewer points to send/save).
const MIN_POINT_DISTANCE = 1.5;
// Send the line-in-progress to others this often while drawing.
const PROGRESS_INTERVAL_MS = 50;
// Very long scribbles are split into several strokes so each message stays
// well under API Gateway's 32 KB frame size.
const MAX_POINTS_PER_STROKE = 1000;
// How long someone's name tag stays after their line is finished
// (fully visible for the first half, then fading out).
const TAG_LINGER_MS = 1200;

// Makes the canvas use the screen's real pixel density so lines stay sharp on
// high-resolution displays, while we keep drawing in normal CSS pixels.
function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

// `preview` is for the live layer: eraser strokes show as a soft trail there,
// because there is no ink on that layer for them to cut away.
// `theme` picks a readable ink for near-black / near-white lines.
function redraw(canvas, { width, height }, strokes, { preview = false, theme } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) drawStroke(ctx, stroke, { preview, theme });
}

const round1 = (n) => Math.round(n * 10) / 10;

function getPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return [round1(event.clientX - rect.left), round1(event.clientY - rect.top)];
}

// Three stacked canvases:
//  - base:  every finished stroke (only redrawn when the stroke list changes)
//  - laser: fading laser-pointer trails (animated only while one is visible)
//  - live:  lines being drawn right now, yours and other people's; also
//           receives the pointer events
export default function Whiteboard({
  strokes,
  remoteLive,
  laser,
  theme = 'light',
  myName = '',
  tool,
  color,
  size,
  onStrokeProgress,
  onStrokeComplete,
}) {
  const themeRef = useRef(theme);
  const baseOpts = () => ({ theme: themeRef.current });
  const liveOpts = () => ({ preview: true, theme: themeRef.current });
  // Sent with your live points so others see who is drawing.
  const myNameRef = useRef(myName);
  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);
  const containerRef = useRef(null);
  const baseRef = useRef(null);
  const laserCanvasRef = useRef(null);
  const liveRef = useRef(null);
  // The laser trail you are drawing right now: { id, points, sent, lastSentAt }
  const laserStrokeRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const strokesRef = useRef(strokes);
  const remoteLiveRef = useRef(remoteLive);
  // Last painted set of other people's live lines, to spot the ones that just
  // finished; and their fading tags: { [id]: { name, tip, color, endedAt } }.
  const prevRemoteRef = useRef({});
  const lingeringTagsRef = useRef(new Map());
  const currentStrokeRef = useRef(null);
  const sentPointsRef = useRef(0);
  const lastSentAtRef = useRef(0);
  const frameRef = useRef(0);

  // Live layer = lines being drawn right now, plus a name tag at the tip of
  // each line someone else is drawing (never on your own).
  // When someone's line finishes, their tag stays at its end for a moment and
  // fades out, instead of vanishing the instant they lift the pen.
  function paintLive() {
    const now = performance.now();
    const remote = remoteLiveRef.current;

    for (const [id, stroke] of Object.entries(prevRemoteRef.current)) {
      const tip = stroke.points.at(-1);
      if (!remote[id] && stroke.name && tip) {
        lingeringTagsRef.current.set(id, {
          name: stroke.name,
          tip,
          color: stroke.tool === 'eraser' ? null : stroke.color,
          endedAt: now,
        });
      }
    }
    prevRemoteRef.current = remote;

    const canvas = liveRef.current;
    redraw(canvas, sizeRef.current, liveStrokes(), liveOpts());
    const ctx = canvas.getContext('2d');
    const tag = (name, tip, color, alpha = 1) =>
      drawNameTag(ctx, {
        name,
        x: tip[0],
        y: tip[1],
        color,
        theme: themeRef.current,
        alpha,
        bounds: sizeRef.current,
      });

    const drawingNow = new Set();
    for (const stroke of Object.values(remote)) {
      const tip = stroke.points.at(-1);
      if (!stroke.name || !tip) continue;
      drawingNow.add(stroke.name);
      tag(stroke.name, tip, stroke.tool === 'eraser' ? null : stroke.color);
    }

    let stillFading = false;
    for (const [id, t] of lingeringTagsRef.current) {
      const age = now - t.endedAt;
      // Gone once faded, or as soon as that person starts another line.
      if (age >= TAG_LINGER_MS || drawingNow.has(t.name)) {
        lingeringTagsRef.current.delete(id);
        continue;
      }
      const fadeStart = TAG_LINGER_MS / 2;
      tag(t.name, t.tip, t.color, age < fadeStart ? 1 : 1 - (age - fadeStart) / fadeStart);
      stillFading = true;
    }
    if (stillFading) scheduleLiveRender();
  }

  function liveStrokes() {
    const list = Object.values(remoteLiveRef.current);
    if (currentStrokeRef.current) list.push(currentStrokeRef.current);
    return list;
  }

  // Resize both canvases whenever the board area changes size, then repaint.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      sizeRef.current = { width, height };
      setupCanvas(baseRef.current, width, height);
      setupCanvas(laserCanvasRef.current, width, height);
      setupCanvas(liveRef.current, width, height);
      redraw(baseRef.current, sizeRef.current, strokesRef.current, baseOpts());
      paintLive();
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // Switching theme repaints both layers with the right ink colours.
  // (Declared before the strokes effect so the theme is current for it.)
  useEffect(() => {
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    redraw(baseRef.current, sizeRef.current, strokesRef.current, baseOpts());
    paintLive();
  }, [theme]);

  // Repaint the finished strokes whenever the list changes (add/undo/clear).
  useEffect(() => {
    strokesRef.current = strokes;
    redraw(baseRef.current, sizeRef.current, strokes, baseOpts());
  }, [strokes]);

  // Laser layer: animate while any trail is still fading, then stop until new
  // points arrive (no work at all while nobody is pointing).
  useEffect(() => {
    if (!laser) return undefined;
    let frame = 0;
    function tick() {
      frame = 0;
      const now = performance.now();
      const { width, height } = sizeRef.current;
      const ctx = laserCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      const stillVisible = laser.prune(now);
      laser.draw(ctx, now, { theme: themeRef.current, bounds: sizeRef.current });
      if (stillVisible) frame = requestAnimationFrame(tick);
    }
    laser.setOnChange(() => {
      if (!frame) frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      laser.setOnChange(null);
    };
  }, [laser]);

  // Repaint the live layer when other people's in-progress lines change.
  useEffect(() => {
    remoteLiveRef.current = remoteLive;
    scheduleLiveRender();
  });

  // Redraw the live layer at most once per screen refresh.
  function scheduleLiveRender() {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      paintLive();
    });
  }

  function startStroke(point) {
    const stroke = createStroke({ tool, color, size });
    stroke.points.push(point);
    currentStrokeRef.current = stroke;
    sentPointsRef.current = 0;
    lastSentAtRef.current = 0;
    return stroke;
  }

  // Send only the points the others haven't received yet.
  function sendProgress(stroke) {
    const from = sentPointsRef.current;
    if (stroke.points.length <= from) return;
    const { id, tool: strokeTool, color: strokeColor, size: strokeSize } = stroke;
    onStrokeProgress(
      { id, tool: strokeTool, color: strokeColor, size: strokeSize, name: myNameRef.current },
      from,
      stroke.points.slice(from),
    );
    sentPointsRef.current = stroke.points.length;
    lastSentAtRef.current = performance.now();
  }

  // ----- Laser pointer: shown locally, sent as "progress", never saved -----

  function sendLaserProgress(trail) {
    if (trail.points.length <= trail.sent) return;
    onStrokeProgress(
      { id: trail.id, tool: 'laser', color: LASER_COLOR, size: 4, name: myNameRef.current },
      trail.sent,
      trail.points.slice(trail.sent),
    );
    trail.sent = trail.points.length;
    trail.lastSentAt = performance.now();
  }

  function startLaser(point) {
    const trail = { id: createStrokeId(), points: [point], sent: 0, lastSentAt: 0 };
    laserStrokeRef.current = trail;
    laser?.add(trail.id, [point]);
  }

  function moveLaser(moves, canvas) {
    const trail = laserStrokeRef.current;
    const added = [];
    for (const move of moves) {
      const point = getPoint(move, canvas);
      const last = trail.points[trail.points.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_POINT_DISTANCE) continue;
      trail.points.push(point);
      added.push(point);
    }
    laser?.add(trail.id, added);
    if (performance.now() - trail.lastSentAt >= PROGRESS_INTERVAL_MS) sendLaserProgress(trail);
  }

  function finishLaser() {
    const trail = laserStrokeRef.current;
    if (!trail) return;
    laserStrokeRef.current = null;
    sendLaserProgress(trail); // the last few points; nothing is saved
  }

  // ----- Pointer handling -----

  // Browsers group fast movements together; "coalesced" events give us all
  // of them, which makes quick strokes much smoother.
  function pointerMoves(event) {
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    return coalesced && coalesced.length > 0 ? coalesced : [event.nativeEvent];
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return; // left click only
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event, event.currentTarget);
    if (tool === 'laser') {
      startLaser(point);
      return;
    }
    startStroke(point);
    scheduleLiveRender();
  }

  function handlePointerMove(event) {
    if (laserStrokeRef.current) {
      moveLaser(pointerMoves(event), event.currentTarget);
      return;
    }
    let stroke = currentStrokeRef.current;
    if (!stroke) return;
    const canvas = event.currentTarget;
    for (const move of pointerMoves(event)) {
      const point = getPoint(move, canvas);
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_POINT_DISTANCE) continue;
      stroke.points.push(point);
      if (stroke.points.length >= MAX_POINTS_PER_STROKE) {
        // Finish this piece and carry on seamlessly from the same point.
        finishStroke();
        stroke = startStroke(point);
      }
    }
    if (performance.now() - lastSentAtRef.current >= PROGRESS_INTERVAL_MS) {
      sendProgress(stroke);
    }
    scheduleLiveRender();
  }

  function finishStroke() {
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    currentStrokeRef.current = null;
    // Paint onto the base layer right away so nothing flickers while React
    // updates the stroke list.
    drawStroke(baseRef.current.getContext('2d'), stroke, baseOpts());
    paintLive();
    onStrokeComplete(stroke);
  }

  function handlePointerEnd() {
    finishLaser();
    finishStroke();
  }

  return (
    <div ref={containerRef} className="board">
      <canvas ref={baseRef} className="board-layer" />
      {/* Not part of the board image sent to the AI summary. */}
      <canvas ref={laserCanvasRef} className="board-layer" data-export="false" />
      <canvas
        ref={liveRef}
        className={`board-layer board-input tool-${tool}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
      />
    </div>
  );
}
