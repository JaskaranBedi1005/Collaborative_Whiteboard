import { useCallback, useEffect, useRef, useState } from 'react';

// The WebSocket address printed by `sam deploy` (see frontend/.env.example).
const WS_URL = import.meta.env.VITE_WS_URL;

const MAX_RETRY_DELAY_MS = 15000;

// Keeps one WebSocket open to AWS for the given board and reconnects
// automatically if it drops (AWS closes idle connections after 10 minutes).
//
// status: 'offline' (no URL configured) | 'connecting' | 'online' | 'reconnecting'
export function useBoardSocket(boardId, onMessage) {
  const [status, setStatus] = useState(WS_URL ? 'connecting' : 'offline');
  const socketRef = useRef(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!WS_URL) return undefined;

    let stopped = false;
    let attempt = 0;
    let retryTimer;

    function connect() {
      const socket = new WebSocket(`${WS_URL}?board=${encodeURIComponent(boardId)}`);
      const loadRequestId = crypto.randomUUID();
      const loadChunks = [];
      const receivedChunkIndexes = new Set();
      let loadChunkCount;
      let loadBoardComplete = false;
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setStatus('online');
        socket.send(JSON.stringify({ action: 'draw', type: 'loadBoard', requestId: loadRequestId }));
      };

      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return; // ignore anything that isn't JSON
        }
        if (message.type === 'loadBoardChunk') {
          if (
            loadBoardComplete ||
            message.requestId !== loadRequestId ||
            !Number.isInteger(message.chunkIndex) ||
            !Number.isInteger(message.chunkCount) ||
            message.chunkCount < 1 ||
            message.chunkIndex < 0 ||
            message.chunkIndex >= message.chunkCount ||
            !Array.isArray(message.strokes)
          ) {
            return;
          }
          if (loadChunkCount !== undefined && loadChunkCount !== message.chunkCount) return;
          loadChunkCount = message.chunkCount;
          if (!receivedChunkIndexes.has(message.chunkIndex)) {
            loadChunks[message.chunkIndex] = message.strokes;
            receivedChunkIndexes.add(message.chunkIndex);
          }
          if (receivedChunkIndexes.size === loadChunkCount) {
            loadBoardComplete = true;
            onMessageRef.current({ type: 'loadBoard', strokes: loadChunks.flat() });
          }
          return;
        }
        onMessageRef.current(message);
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped) return;
        setStatus('reconnecting');
        const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    }

    setStatus('connecting');
    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [boardId]);

  // Every message goes to the "draw" route on API Gateway.
  const send = useCallback((message) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ action: 'draw', ...message }));
    return true;
  }, []);

  return { status, send };
}
