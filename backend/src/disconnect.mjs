// Runs when a browser closes the WebSocket (tab closed, page refreshed, etc.).

import { removeConnection } from './lib/db.mjs';

export async function handler(event) {
  await removeConnection(event.requestContext.connectionId);
  return { statusCode: 200 };
}
