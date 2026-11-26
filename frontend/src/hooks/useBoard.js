import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVE_FOR_MS, sameActivity } from '../lib/activity.js';
import { sanitizeName } from '../lib/identity.js';
import { LASER_COLOR } from '../lib/laser.js';
import { useBoardSocket } from './useBoardSocket.js';

// Other people's live points arrive in batches this far apart (see Whiteboard).
const PROGRESS_BATCH_MS = 50;

// A remote line that hasn't been updated for this long is assumed abandoned
// (e.g. that person's internet dropped mid-stroke) and is removed.
const STALE_LIVE_STROKE_MS = 5000;

// Moving or deleting many lines sends one message per line. API Gateway is
// throttled at 50 messages/second, so bulk changes go out at a steady pace.
const BULK_SEND_INTERVAL_MS = 40; // 25 a second
const MAX_HISTORY = 100;

// Restored lines get a new id (others may already have ignored the old one as
// deleted). Keeping the old id as a prefix keeps them in the same drawing order.
const restoredId = (id) => `${id}-u${Math.random().toString(36).slice(2, 6)}`;

const byId = (a, b) => a.id.localeCompare(b.id);

function withoutKey(object, key) {
  if (!(key in object)) return object;
  const copy = { ...object };
  delete copy[key];
  return copy;
}

// Holds everything that is on the board and keeps it in sync with everyone
// else on the same board through the WebSocket.
// `laser` (optional) is the store from createLaserTrails(); other people's
// laser-pointer points go there instead of onto the board.
export function useBoard(boardId, { laser } = {}) {
  const laserRef = useRef(laser);
  useEffect(() => {
    laserRef.current = laser;
  }, [laser]);
  const [strokes, setStrokes] = useState([]);
  const strokesRef = useRef(strokes);
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // Undo history of *your own* actions, newest last:
  //   { kind: 'add', id }            a line you drew
  //   { kind: 'move', before: [...] } lines you moved (their old versions)
  //   { kind: 'delete', strokes: [...] } lines you deleted with Select
  const historyRef = useRef([]);
  const [historySize, setHistorySize] = useState(0);
  const pushHistory = useCallback((action) => {
    historyRef.current = [...historyRef.current, action].slice(-MAX_HISTORY);
    setHistorySize(historyRef.current.length);
  }, []);
  const resetHistory = useCallback(() => {
    historyRef.current = [];
    setHistorySize(0);
  }, []);
  // Lines other people are drawing right now: { [strokeId]: stroke }
  const [remoteLive, setRemoteLive] = useState({});
  // How many people (browser tabs) are on this board, as reported by the server.
  const [onlineCount, setOnlineCount] = useState(null);
  // Lines that are already finished or deleted. Messages can arrive slightly
  // out of order, so a late "progress" for these must be ignored.
  const closedIds = useRef(new Set());
  const removedIds = useRef(new Set());

  // Who else is drawing / erasing / pointing right now.
  // The ref is updated on every live message (~20 a second per person); the
  // state only changes when the list itself changes, to avoid extra renders.
  const activityRef = useRef(new Map()); // name -> { tool, at }
  const [activePeople, setActivePeople] = useState([]);

  const refreshActivity = useCallback(() => {
    const cutoff = Date.now() - ACTIVE_FOR_MS;
    for (const [name, entry] of activityRef.current) {
      if (entry.at < cutoff) activityRef.current.delete(name);
    }
    const next = [...activityRef.current].map(([name, { tool }]) => ({ name, tool }));
    setActivePeople((prev) => (sameActivity(prev, next) ? prev : next));
  }, []);

  const noteActivity = useCallback(
    (name, tool) => {
      if (!name) return;
      const previous = activityRef.current.get(name);
      activityRef.current.set(name, { tool, at: Date.now() });
      if (!previous || previous.tool !== tool) refreshActivity();
    },
    [refreshActivity],
  );

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
        if (!stroke?.id || !Array.isArray(points)) return;
        // Who is doing it: shown as a tag at the tip and in the top bar.
        const name = sanitizeName(stroke.name);
        const tool = stroke.tool === 'eraser' || stroke.tool === 'laser' ? stroke.tool : 'pen';
        noteActivity(name, tool);
        // Laser pointer: fading trail only, never part of the board.
        if (tool === 'laser') {
          const valid = points.filter(
            (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
          );
          laserRef.current?.add(stroke.id, valid, {
            color: LASER_COLOR,
            spreadMs: PROGRESS_BATCH_MS,
            label: name,
          });
          return;
        }
        if (closedIds.current.has(stroke.id)) return;
        setRemoteLive((prev) => {
          const existing = prev[stroke.id]?.points ?? [];
          // Normally `from` equals what we already have and we just append.
          const merged =
            from <= existing.length ? existing.slice(0, from).concat(points) : existing.concat(points);
          return {
            ...prev,
            [stroke.id]: { ...stroke, name, points: merged, updatedAt: Date.now() },
          };
        });
        break;
      }
      case 'stroke': {
        const { stroke } = message;
        if (!stroke?.id || !Array.isArray(stroke.points) || removedIds.current.has(stroke.id)) return;
        closedIds.current.add(stroke.id);
        setRemoteLive((prev) => withoutKey(prev, stroke.id));
        // A line we already have was moved by someone: replace it in place
        // (same position in the drawing order).
        setStrokes((prev) => {
          const index = prev.findIndex((s) => s.id === stroke.id);
          if (index === -1) return [...prev, stroke];
          const next = [...prev];
          next[index] = stroke;
          return next;
        });
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
        resetHistory();
        setRemoteLive({});
        break;
      }
      case 'presence': {
        if (Number.isInteger(message.count) && message.count > 0) setOnlineCount(message.count);
        break;
      }
      default:
        // Unknown message (e.g. an error notice from AWS): ignore it.
        break;
    }
  }, [noteActivity, resetHistory]);

  const { status, send } = useBoardSocket(boardId, handleMessage);

  // Paced queue for bulk changes (moving/deleting/restoring many lines).
  const queueRef = useRef([]);
  const queueTimerRef = useRef(0);
  const enqueue = useCallback(
    (messages) => {
      queueRef.current.push(...messages);
      if (queueTimerRef.current) return;
      queueTimerRef.current = setInterval(() => {
        const next = queueRef.current.shift();
        if (next) send(next);
        if (queueRef.current.length === 0) {
          clearInterval(queueTimerRef.current);
          queueTimerRef.current = 0;
        }
      }, BULK_SEND_INTERVAL_MS);
    },
    [send],
  );
  useEffect(() => () => clearInterval(queueTimerRef.current), []);

  // Forget people who stopped moving (checked twice a second while anyone is active).
  useEffect(() => {
    if (activePeople.length === 0) return undefined;
    const timer = setInterval(refreshActivity, 500);
    return () => clearInterval(timer);
  }, [activePeople.length, refreshActivity]);

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
      pushHistory({ kind: 'add', id: stroke.id });
      send({ type: 'stroke', stroke });
    },
    [pushHistory, send],
  );

  // --- Select tool: move and delete lines (anyone's), synced to everyone ---

  // Saves and shares new versions of lines that keep their ids.
  const replaceStrokes = useCallback(
    (updated) => {
      if (updated.length === 0) return;
      const map = new Map(updated.map((s) => [s.id, s]));
      setStrokes((prev) => prev.map((s) => map.get(s.id) ?? s));
      enqueue(updated.map((stroke) => ({ type: 'stroke', stroke })));
    },
    [enqueue],
  );

  // Removes lines for everyone and returns the lines that were removed.
  const removeStrokes = useCallback(
    (ids) => {
      const idSet = new Set(ids);
      const removed = strokesRef.current.filter((s) => idSet.has(s.id));
      if (removed.length === 0) return removed;
      for (const s of removed) {
        closedIds.current.add(s.id);
        removedIds.current.add(s.id);
      }
      setStrokes((prev) => prev.filter((s) => !idSet.has(s.id)));
      enqueue(removed.map((s) => ({ type: 'remove', strokeId: s.id })));
      return removed;
    },
    [enqueue],
  );

  // `transform(stroke)` returns the moved version of a line.
  const moveStrokes = useCallback(
    (ids, transform) => {
      const idSet = new Set(ids);
      const before = strokesRef.current.filter((s) => idSet.has(s.id));
      if (before.length === 0) return;
      replaceStrokes(before.map(transform));
      pushHistory({ kind: 'move', before });
    },
    [pushHistory, replaceStrokes],
  );

  const deleteStrokes = useCallback(
    (ids) => {
      const removed = removeStrokes(ids);
      if (removed.length > 0) pushHistory({ kind: 'delete', strokes: removed });
    },
    [pushHistory, removeStrokes],
  );

  // Undo your last action. Skips actions whose lines someone else has since
  // removed (there is nothing left to undo for those).
  const undo = useCallback(() => {
    while (historyRef.current.length > 0) {
      const action = historyRef.current.at(-1);
      historyRef.current = historyRef.current.slice(0, -1);
      setHistorySize(historyRef.current.length);
      const present = new Set(strokesRef.current.map((s) => s.id));

      if (action.kind === 'add') {
        if (!present.has(action.id)) continue;
        removeStrokes([action.id]);
        return;
      }
      if (action.kind === 'move') {
        const back = action.before.filter((s) => present.has(s.id));
        if (back.length === 0) continue;
        replaceStrokes(back);
        return;
      }
      if (action.kind === 'delete') {
        const restored = action.strokes.map((s) => ({ ...s, id: restoredId(s.id) }));
        for (const s of restored) closedIds.current.add(s.id);
        setStrokes((prev) => [...prev, ...restored].sort(byId));
        enqueue(restored.map((stroke) => ({ type: 'stroke', stroke })));
        return;
      }
    }
  }, [enqueue, removeStrokes, replaceStrokes]);

  const clear = useCallback(() => {
    queueRef.current = []; // don't let queued changes re-add lines after the clear
    setStrokes([]);
    resetHistory();
    setRemoteLive({});
    send({ type: 'clear' });
  }, [resetHistory, send]);

  return {
    strokes,
    remoteLive,
    status,
    // Only meaningful while connected; a stale number is worse than none.
    onlineCount: status === 'online' ? onlineCount : null,
    // Other people drawing / erasing / pointing right now: [{ name, tool }]
    activePeople: status === 'online' ? activePeople : [],
    addStroke,
    sendProgress,
    moveStrokes,
    deleteStrokes,
    undo,
    clear,
    canUndo: historySize > 0,
  };
}
