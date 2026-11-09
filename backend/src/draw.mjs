// Runs for every message with "action": "draw".
// Finds everyone else on the sender's board and forwards the message to them.
//
// Message types (the "type" field):
//   progress - part of a line that is still being drawn (for live preview)
//   stroke   - a finished line
//   remove   - undo: delete one line by id
//   clear    - wipe the board

import { getBoardConnections, getBoardOfConnection } from './lib/db.mjs';
import { sendToConnections } from './lib/broadcast.mjs';

const MAX_MESSAGE_CHARS = 32 * 1024;
const ALLOWED_TYPES = new Set(['progress', 'stroke', 'remove', 'clear']);

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

  const { action, ...payload } = message;
  const others = (await getBoardConnections(boardId)).filter((id) => id !== connectionId);
  await sendToConnections(event, others, payload);

  return { statusCode: 200 };
}
