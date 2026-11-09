// Runs when a browser opens the WebSocket: wss://.../prod?board=team42
// Saves "this connection is on this board" in the Connections table.

import { BOARD_ID_PATTERN, saveConnection } from './lib/db.mjs';

export async function handler(event) {
  const boardId = event.queryStringParameters?.board;
  if (!boardId || !BOARD_ID_PATTERN.test(boardId)) {
    // Returning a non-200 status refuses the connection.
    return { statusCode: 400, body: 'Missing or invalid board name' };
  }

  await saveConnection(event.requestContext.connectionId, boardId);
  return { statusCode: 200 };
}
