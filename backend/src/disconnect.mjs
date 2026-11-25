// Runs when a browser closes the WebSocket (tab closed, page refreshed, etc.).
// Removes the connection and tells the rest of the board the new online count.

import { broadcastPresence } from './lib/broadcast.mjs';
import { removeConnection } from './lib/db.mjs';

export async function handler(event) {
  const connectionId = event.requestContext.connectionId;
  const boardId = await removeConnection(connectionId);

  if (boardId) {
    try {
      await broadcastPresence(event, boardId, { left: connectionId });
    } catch (err) {
      // The person has left either way; a missed count update is not fatal.
      console.error('Failed to broadcast presence on disconnect', err.name, err.message);
    }
  }

  return { statusCode: 200 };
}
