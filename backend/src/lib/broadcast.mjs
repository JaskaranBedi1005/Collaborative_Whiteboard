// Sends a message to a list of open WebSocket connections.

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { getBoardConnections, removeConnection } from './db.mjs';

const clients = new Map();

// The "send to a connection" address is the WebSocket API's own URL, which
// API Gateway tells us in every event.
function clientFor(event) {
  const { domainName, stage } = event.requestContext;
  const endpoint = `https://${domainName}/${stage}`;
  if (!clients.has(endpoint)) {
    clients.set(endpoint, new ApiGatewayManagementApiClient({ endpoint }));
  }
  return clients.get(endpoint);
}

function isGone(err) {
  return err?.name === 'GoneException' || err?.$metadata?.httpStatusCode === 410;
}

export async function sendToConnection(event, connectionId, message) {
  const client = clientFor(event);
  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(message),
      }),
    );
    return true;
  } catch (err) {
    if (isGone(err)) {
      await removeConnection(connectionId);
      return false;
    }
    throw err;
  }
}

// Tells everyone on a board how many people are on it: {type:'presence', count}.
// The board index can lag a moment behind writes, so the person joining is
// added and the person leaving is removed by hand.
export async function broadcastPresence(event, boardId, { joined, left } = {}) {
  let ids = await getBoardConnections(boardId, { fresh: true });
  if (left) ids = ids.filter((id) => id !== left);
  if (joined && !ids.includes(joined)) ids = [...ids, joined];
  await sendToConnections(event, ids, { type: 'presence', count: ids.length });
}

export async function sendToConnections(event, connectionIds, message) {
  const client = clientFor(event);
  const data = JSON.stringify(message);

  await Promise.all(
    connectionIds.map(async (connectionId) => {
      try {
        await client.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: data }));
      } catch (err) {
        if (isGone(err)) {
          // The user disappeared without a clean disconnect (closed laptop,
          // lost Wi-Fi). Forget them so we stop trying.
          await removeConnection(connectionId);
        } else {
          console.error('Failed to send to connection', connectionId, err.name, err.message);
        }
      }
    }),
  );
}
