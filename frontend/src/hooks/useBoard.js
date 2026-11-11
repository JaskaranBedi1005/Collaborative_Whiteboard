import { useCallback, useEffect, useRef, useState } from 'react';
import { useBoardSocket } from './useBoardSocket.js';

// A remote line that hasn't been updated for this long is assumed abandoned
// (e.g. that person's internet dropped mid-stroke) and is removed.
const STALE_LIVE_STROKE_MS = 5000;

function withoutKey(object, key) {
  if (!(key in object)) return object;
  const copy = { ...object };
  delete copy[key];
  return copy;
}

// Holds everything that is on the board and keeps it in sync with everyone
// else on the same board through the WebSocket.
export function useBoard(boardId) {
  const [strokes, setStrokes] = useState([]);
  // IDs of strokes *this* user drew, newest last, so Undo only removes your own work.
  const [myStrokeIds, setMyStrokeIds] = useState([]);
  // Lines other people are drawing right now: { [strokeId]: stroke }
  const [remoteLive, setRemoteLive] = useState({});
  // Lines that are already finished or deleted. Messages can arrive slightly
  // out of order, so a late "progress" for these must be ignored.
  const closedIds = useRef(new Set());
  const removedIds = useRef(new Set());

  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'loadBoard': {
        const loadedStrokes = Array.isArray(message.strokes) ? message.strokes : [];
        const savedStrokes = loadedStrokes.filter(
          (stroke) => stroke?.id && !removedIds.current.has(stroke.id),
        );
        for (const stroke of savedStrokes) closedIds.current.add(stroke.id);
        setStrokes((prev) => {
          const strokesById = new Map(savedStrokes.map((stroke) => [stroke.id, stroke]));
          for (const stroke of prev) {
            if (stroke?.id && !removedIds.current.has(stroke.id)) {
              strokesById.set(stroke.id, stroke);
            }
          }
          return [...strokesById.values()].sort((a, b) => a.id.localeCompare(b.id));
        });
        setRemoteLive({});
        break;
      }
      case 'progress': {
        const { stroke, from, points } = message;
        if (!stroke?.id || !Array.isArray(points) || closedIds.current.has(stroke.id)) return;
        setRemoteLive((prev) => {
          const existing = prev[stroke.id]?.points ?? [];
          // Normally `from` equals what we already have and we just append.
          const merged =
            from <= existing.length ? existing.slice(0, from).concat(points) : existing.concat(points);
          return { ...prev, [stroke.id]: { ...stroke, points: merged, updatedAt: Date.now() } };
        });
        break;
      }
      case 'stroke': {
        const { stroke } = message;
        if (!stroke?.id || removedIds.current.has(stroke.id)) return;
        closedIds.current.add(stroke.id);
        setRemoteLive((prev) => withoutKey(prev, stroke.id));
        setStrokes((prev) => (prev.some((s) => s.id === stroke.id) ? prev : [...prev, stroke]));
        break;
      }
      case 'remove': {
        const { strokeId } = message;
        if (!strokeId) return;
        closedIds.current.add(strokeId);
        removedIds.current.add(strokeId);
        setRemoteLive((prev) => withoutKey(prev, strokeId));
        setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
        break;
      }
      case 'clear': {
        setStrokes([]);
        setMyStrokeIds([]);
        setRemoteLive({});
        break;
      }
      default:
        // Unknown message (e.g. an error notice from AWS): ignore it.
        break;
    }
  }, []);

  const { status, send } = useBoardSocket(boardId, handleMessage);

  // Drop half-finished remote lines that stopped updating.
  useEffect(() => {
    const timer = setInterval(() => {
      setRemoteLive((prev) => {
        const cutoff = Date.now() - STALE_LIVE_STROKE_MS;
        const fresh = Object.entries(prev).filter(([, s]) => s.updatedAt > cutoff);
        return fresh.length === Object.keys(prev).length ? prev : Object.fromEntries(fresh);
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Part of the line you are drawing right now: only the new points are sent.
  const sendProgress = useCallback(
    (strokeInfo, from, points) => {
      send({ type: 'progress', stroke: strokeInfo, from, points });
    },
    [send],
  );

  const addStroke = useCallback(
    (stroke) => {
      closedIds.current.add(stroke.id);
      setStrokes((prev) => [...prev, stroke]);
      setMyStrokeIds((prev) => [...prev, stroke.id]);
      send({ type: 'stroke', stroke });
    },
    [send],
  );

  const undo = useCallback(() => {
    if (myStrokeIds.length === 0) return;
    const lastId = myStrokeIds[myStrokeIds.length - 1];
    removedIds.current.add(lastId);
    setMyStrokeIds((prev) => prev.slice(0, -1));
    setStrokes((prev) => prev.filter((s) => s.id !== lastId));
    send({ type: 'remove', strokeId: lastId });
  }, [myStrokeIds, send]);

  const clear = useCallback(() => {
    setStrokes([]);
    setMyStrokeIds([]);
    setRemoteLive({});
    send({ type: 'clear' });
  }, [send]);

  return {
    strokes,
    remoteLive,
    status,
    addStroke,
    sendProgress,
    undo,
    clear,
    canUndo: myStrokeIds.length > 0,
  };
}
