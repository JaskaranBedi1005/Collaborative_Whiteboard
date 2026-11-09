import { useEffect, useRef } from 'react';
import { createStroke, drawStroke } from '../lib/strokes';

// Ignore tiny mouse movements so strokes stay small (fewer points to send/save).
const MIN_POINT_DISTANCE = 1.5;
// Send the line-in-progress to others this often while drawing.
const PROGRESS_INTERVAL_MS = 50;
// Very long scribbles are split into several strokes so each message stays
// well under API Gateway's 32 KB frame size.
const MAX_POINTS_PER_STROKE = 1000;

// Makes the canvas use the screen's real pixel density so lines stay sharp on
// high-resolution displays, while we keep drawing in normal CSS pixels.
function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function redraw(canvas, { width, height }, strokes) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

const round1 = (n) => Math.round(n * 10) / 10;

function getPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return [round1(event.clientX - rect.left), round1(event.clientY - rect.top)];
}

// Two stacked canvases:
//  - base: every finished stroke (only redrawn when the stroke list changes)
//  - live: lines being drawn right now, yours and other people's
export default function Whiteboard({
  strokes,
  remoteLive,
  tool,
  color,
  size,
  onStrokeProgress,
  onStrokeComplete,
}) {
  const containerRef = useRef(null);
  const baseRef = useRef(null);
  const liveRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const strokesRef = useRef(strokes);
  const remoteLiveRef = useRef(remoteLive);
  const currentStrokeRef = useRef(null);
  const sentPointsRef = useRef(0);
  const lastSentAtRef = useRef(0);
  const frameRef = useRef(0);

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
      setupCanvas(liveRef.current, width, height);
      redraw(baseRef.current, sizeRef.current, strokesRef.current);
      redraw(liveRef.current, sizeRef.current, liveStrokes());
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // Repaint the finished strokes whenever the list changes (add/undo/clear).
  useEffect(() => {
    strokesRef.current = strokes;
    redraw(baseRef.current, sizeRef.current, strokes);
  }, [strokes]);

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
      redraw(liveRef.current, sizeRef.current, liveStrokes());
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
      { id, tool: strokeTool, color: strokeColor, size: strokeSize },
      from,
      stroke.points.slice(from),
    );
    sentPointsRef.current = stroke.points.length;
    lastSentAtRef.current = performance.now();
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return; // left click only
    event.currentTarget.setPointerCapture(event.pointerId);
    startStroke(getPoint(event, event.currentTarget));
    scheduleLiveRender();
  }

  function handlePointerMove(event) {
    let stroke = currentStrokeRef.current;
    if (!stroke) return;
    const canvas = event.currentTarget;
    // Browsers group fast movements together; "coalesced" events give us all
    // of them, which makes quick strokes much smoother.
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    const moves = coalesced && coalesced.length > 0 ? coalesced : [event.nativeEvent];
    for (const move of moves) {
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
    drawStroke(baseRef.current.getContext('2d'), stroke);
    redraw(liveRef.current, sizeRef.current, liveStrokes());
    onStrokeComplete(stroke);
  }

  return (
    <div ref={containerRef} className="board">
      <canvas ref={baseRef} className="board-layer" />
      <canvas
        ref={liveRef}
        className={`board-layer board-input tool-${tool}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onLostPointerCapture={finishStroke}
      />
    </div>
  );
}
