// Runs for every message with "action": "draw".
// Finds everyone else on the sender's board and forwards the message to them.
//
// Message types (the "type" field):
//   progress - part of a line that is still being drawn (for live preview)
//   stroke   - a finished line
//   remove   - undo: delete one line by id
//   clear    - wipe the board
//   loadBoard - send the saved strokes back to this connection

import {
  clearBoardStrokes,
  getBoardConnections,
  getBoardOfConnection,
  getBoardStrokes,
  removeStroke,
  saveStroke,
} from './lib/db.mjs';
import { sendToConnection, sendToConnections } from './lib/broadcast.mjs';

const MAX_MESSAGE_CHARS = 32 * 1024;
const MAX_LOAD_CHUNK_BYTES = 32 * 1024 - 1;
const MAX_STROKES_PER_CHUNK = 50;
const ALLOWED_TYPES = new Set(['progress', 'stroke', 'remove', 'clear', 'loadBoard']);

function makeBoardLoadChunks(strokes, requestId) {
  const maxChunkCount = Math.max(strokes.length, 1);
  const fits = (chunk, chunkIndex = maxChunkCount - 1) =>
    Buffer.byteLength(
      JSON.stringify({
        type: 'loadBoardChunk',
        requestId,
        chunkIndex,
        chunkCount: maxChunkCount,
        strokes: chunk,
      }),
      'utf8',
    ) <= MAX_LOAD_CHUNK_BYTES;

  const chunks = [];
  let chunk = [];
  for (const stroke of strokes) {
    const candidate = [...chunk, stroke];
    if (candidate.length > MAX_STROKES_PER_CHUNK || !fits(candidate)) {
      if (chunk.length === 0) {
        throw new Error('A saved stroke exceeds the WebSocket frame size limit');
      }
      chunks.push(chunk);
      chunk = [stroke];
      if (!fits(chunk)) {
        throw new Error('A saved stroke exceeds the WebSocket frame size limit');
      }
    } else {
      chunk = candidate;
    }
  }
  if (chunk.length > 0 || chunks.length === 0) chunks.push(chunk);

  return chunks.map((strokesInChunk, chunkIndex) => ({
    type: 'loadBoardChunk',
    requestId,
    chunkIndex,
    chunkCount: chunks.length,
    strokes: strokesInChunk,
  }));
}

export async function handler(event) {
  const connectionId = event.requestContext.connectionId;
  const body = event.body ?? '';
  if (body.length > MAX_MESSAGE_CHARS) return { statusCode: 413 };

  let message;
  try {
    message = JSON.parse(body);
  } catch {
    return { statusCode: 400 };
  }
  if (!ALLOWED_TYPES.has(message?.type)) return { statusCode: 400 };

  // We look up the board ourselves instead of trusting the browser, so nobody
  // can send drawings into a board they didn't join.
  const boardId = await getBoardOfConnection(connectionId);
  if (!boardId) return { statusCode: 410 };

  if (message.type === 'loadBoard') {
    if (
      typeof message.requestId !== 'string' ||
      !message.requestId ||
      message.requestId.length > 128
    ) {
      return { statusCode: 400 };
    }
    const strokes = await getBoardStrokes(boardId);
    const chunks = makeBoardLoadChunks(strokes, message.requestId);
    for (const chunk of chunks) {
      if (!(await sendToConnection(event, connectionId, chunk))) break;
    }
    return { statusCode: 200 };
  }

  if (message.type === 'stroke') {
    if (typeof message.stroke?.id !== 'string' || !message.stroke.id) {
      return { statusCode: 400 };
    }
    await saveStroke(boardId, message.stroke);
  } else if (message.type === 'remove') {
    if (typeof message.strokeId !== 'string' || !message.strokeId) {
      return { statusCode: 400 };
    }
    await removeStroke(boardId, message.strokeId);
  } else if (message.type === 'clear') {
    await clearBoardStrokes(boardId);
  }

  const { action, ...payload } = message;
  const others = (await getBoardConnections(boardId)).filter((id) => id !== connectionId);
  await sendToConnections(event, others, payload);

  return { statusCode: 200 };
}
