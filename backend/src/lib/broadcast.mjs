// Sends a message to a list of open WebSocket connections.

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { removeConnection } from './db.mjs';

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
