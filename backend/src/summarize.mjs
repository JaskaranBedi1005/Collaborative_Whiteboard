// Summarize Lambda:
// 1. Reads the Gemini API key from AWS SSM Parameter Store (with decryption) and caches it.
// 2. Enforces a rate limit (one call per board per 30 seconds).
// 3. Sends the whiteboard image to a free-tier Gemini Flash model.
// 4. Returns the AI-generated summary with CORS headers.

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
const PARAM_NAME = process.env.GEMINI_KEY_PARAM || '/whiteboard/gemini-api-key';
const RATE_LIMIT_MS = 30 * 1000; // 30 seconds cooldown per board

let cachedApiKey = null;
const lastSummaryByBoard = new Map();

async function getGeminiApiKey() {
  if (cachedApiKey) return cachedApiKey;
  const res = await ssm.send(
    new GetParameterCommand({
      Name: PARAM_NAME,
      WithDecryption: true,
    }),
  );
  cachedApiKey = res.Parameter?.Value;
  if (!cachedApiKey) {
    throw new Error(`SSM parameter ${PARAM_NAME} is empty or not found`);
  }
  return cachedApiKey;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { boardId, image } = body;
  if (!image || typeof image !== 'string') {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing image data' }),
    };
  }

  // Rate limit: 1 call per board per 30 seconds
  if (boardId) {
    const lastTime = lastSummaryByBoard.get(boardId) || 0;
    const now = Date.now();
    const elapsed = now - lastTime;
    if (elapsed < RATE_LIMIT_MS) {
      const remainingSeconds = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
      return {
        statusCode: 429,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Please wait ${remainingSeconds}s before summarizing board "${boardId}" again.`,
        }),
      };
    }
    lastSummaryByBoard.set(boardId, now);
  }

  // Parse mime type and base64 data
  let mimeType = 'image/jpeg';
  let base64Data = image;
  const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    base64Data = match[2];
  }

  try {
    const apiKey = await getGeminiApiKey();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const promptText =
      'You are analyzing a collaborative whiteboard drawing. ' +
      'Provide a concise, clear description and summary of what is drawn on this board. ' +
      'Highlight any text, diagrams, shapes, or diagrams present and explain what they represent. ' +
      'Keep your response friendly, clear, and structured.';

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      return {
        statusCode: response.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Gemini API call failed', details: errText }),
      };
    }

    const data = await response.json();
    const summary =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'No description could be generated from this image.';

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ summary }),
    };
  } catch (err) {
    console.error('Summarize error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
}
