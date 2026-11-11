// DynamoDB helpers for connection membership and persisted board strokes.
//
// Table: one row per open browser tab
//   connectionId (key) | boardId | connectedAt | expiresAt
// Connections index "byBoard": lets us ask "which connections are on board X?".
// BoardState stores one item per stroke, keyed by its timestamp-first ID.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.CONNECTIONS_TABLE;
const BOARD_STATE_TABLE = process.env.BOARD_STATE_TABLE;

export const BOARD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;

// API Gateway closes every WebSocket after 2 hours at most, so any row older
// than 3 hours is a leftover. DynamoDB deletes it automatically (TTL, free).
const CONNECTION_TTL_SECONDS = 3 * 60 * 60;

// Lambda keeps these in memory between calls (while the same worker stays
// warm). This stops us reading DynamoDB on every single drawing message and
// keeps us inside the always-free capacity.
const BOARD_MEMBERS_CACHE_MS = 2000;
const boardOfConnection = new Map(); // connectionId -> boardId (never changes)
const boardMembers = new Map(); // boardId -> { ids: string[], expires: number }

export async function saveConnection(connectionId, boardId) {
  const now = Date.now();
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        connectionId,
        boardId,
        connectedAt: now,
        expiresAt: Math.floor(now / 1000) + CONNECTION_TTL_SECONDS,
      },
    }),
  );
}

export async function removeConnection(connectionId) {
  boardOfConnection.delete(connectionId);
  for (const entry of boardMembers.values()) {
    entry.ids = entry.ids.filter((id) => id !== connectionId);
  }
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { connectionId } }));
}

export async function getBoardOfConnection(connectionId) {
  const cached = boardOfConnection.get(connectionId);
  if (cached) return cached;

  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { connectionId } }));
  if (Item) boardOfConnection.set(connectionId, Item.boardId);
  return Item?.boardId;
}

export async function getBoardConnections(boardId) {
  const cached = boardMembers.get(boardId);
  if (cached && cached.expires > Date.now()) return cached.ids;

  const ids = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: 'byBoard',
        KeyConditionExpression: 'boardId = :boardId',
        ExpressionAttributeValues: { ':boardId': boardId },
        ExclusiveStartKey,
      }),
    );
    for (const item of page.Items ?? []) ids.push(item.connectionId);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  boardMembers.set(boardId, { ids, expires: Date.now() + BOARD_MEMBERS_CACHE_MS });
  return ids;
}

export async function saveStroke(boardId, stroke) {
  await ddb.send(
    new PutCommand({
      TableName: BOARD_STATE_TABLE,
      Item: { boardId, strokeId: stroke.id, stroke },
    }),
  );
}

export async function getBoardStrokes(boardId) {
  const strokes = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: BOARD_STATE_TABLE,
        KeyConditionExpression: 'boardId = :boardId',
        ExpressionAttributeValues: { ':boardId': boardId },
        ProjectionExpression: 'stroke',
        ConsistentRead: true,
        ExclusiveStartKey,
      }),
    );
    for (const item of page.Items ?? []) strokes.push(item.stroke);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return strokes;
}

export async function removeStroke(boardId, strokeId) {
  await ddb.send(
    new DeleteCommand({
      TableName: BOARD_STATE_TABLE,
      Key: { boardId, strokeId },
    }),
  );
}

async function deleteStrokeBatch(requests) {
  let pending = requests;
  for (let attempt = 0; pending.length > 0 && attempt < 6; attempt += 1) {
    const result = await ddb.send(
      new BatchWriteCommand({
        RequestItems: { [BOARD_STATE_TABLE]: pending },
      }),
    );
    pending = result.UnprocessedItems?.[BOARD_STATE_TABLE] ?? [];
    if (pending.length > 0 && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
  if (pending.length > 0) {
    throw new Error(`Failed to delete ${pending.length} board strokes after retries`);
  }
}

export async function clearBoardStrokes(boardId) {
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: BOARD_STATE_TABLE,
        KeyConditionExpression: 'boardId = :boardId',
        ExpressionAttributeValues: { ':boardId': boardId },
        ProjectionExpression: 'boardId, strokeId',
        ExclusiveStartKey,
      }),
    );
    const items = page.Items ?? [];
    for (let offset = 0; offset < items.length; offset += 25) {
      const requests = items.slice(offset, offset + 25).map((item) => ({
        DeleteRequest: { Key: { boardId: item.boardId, strokeId: item.strokeId } },
      }));
      await deleteStrokeBatch(requests);
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
