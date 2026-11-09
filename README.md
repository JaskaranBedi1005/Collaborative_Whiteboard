# Serverless Real-Time Collaborative Whiteboard

Several people open the same link, draw on one canvas, and see each other's lines appear **while they are being drawn**. Built with React and a fully serverless AWS backend (API Gateway WebSockets, Lambda, DynamoDB), deployed with AWS SAM, and designed to run inside AWS free tiers.

## Status

| Phase | What it delivers | Status |
| --- | --- | --- |
| 1 | Whiteboard in the browser: pen, eraser, colours, size, undo, clear | Done |
| 2 | Live drawing between users over a WebSocket | Backend deployed and tested |
| 3 | Boards saved in DynamoDB and restored on join/refresh | Next |
| 4 | Public hosting on S3 + CloudFront | Planned |
| 5 | "Summarize" button using the Gemini API | Planned |
| 6 | Polish, demo video | Planned |

## How it works

```
Browser (React + Canvas)
   │  wss://…/prod?board=<name>
   ▼
API Gateway WebSocket API ── $connect ──► Connect Lambda ──► DynamoDB "Connections"
                          ── $disconnect ► Disconnect Lambda
                          ── draw ───────► Draw Lambda ──► PostToConnection to everyone else on the board
```

- While drawing, the browser sends small `progress` messages every 50 ms and a full `stroke` on mouse-up.
- The Draw Lambda looks up the sender's board itself (never trusts the client), finds the other connections on that board through the `byBoard` index, and forwards the message.
- Undo (`remove`) and `clear` are broadcast the same way. Undo only removes your own lines.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, HTML Canvas, pointer events |
| Real-time | API Gateway WebSocket API |
| Backend | AWS Lambda, Node.js 22 (arm64), AWS SDK v3 |
| Database | DynamoDB (provisioned capacity, free tier) |
| Infrastructure as code | AWS SAM / CloudFormation |
| Planned | S3 + CloudFront hosting, Gemini API, SSM Parameter Store |

## Project structure

```
backend/
  template.yaml            all AWS resources (SAM)
  samconfig.toml           deploy settings (stack name, region)
  src/connect.mjs          $connect: validate board name, save connection
  src/disconnect.mjs       $disconnect: remove connection
  src/draw.mjs             draw: forward messages to the rest of the board
  src/lib/db.mjs           Connections table access (+ 2 s cache)
  src/lib/broadcast.mjs    send to connections, drop ones that are gone
  scripts/test-websocket.mjs   end-to-end test with three fake users
frontend/
  src/components/Whiteboard.jsx   canvases, drawing, live progress
  src/components/Toolbar.jsx      tools, colours, status, copy link
  src/hooks/useBoard.js           board state + message handling
  src/hooks/useBoardSocket.js     WebSocket with auto-reconnect
  src/lib/strokes.js              stroke model and smooth drawing
  src/lib/boardId.js              board name in the URL
```

## Run it locally

Requirements: Node.js 20.19+, and for the backend the AWS CLI v2 and AWS SAM CLI.

```bash
cd frontend
npm install
cp .env.example .env.local      # then set VITE_WS_URL to your WebSocket URL
npm run dev                     # http://localhost:5173
```

Without `VITE_WS_URL` the board still works, locally only ("Offline").
To test collaboration, click **Copy link** and open it in a second window.

## Deploy the backend

```bash
aws configure                   # region us-east-1
cd backend
sam validate --lint
sam build
sam deploy                      # prints WebSocketUrl under Outputs
node --experimental-websocket scripts/test-websocket.mjs <WebSocketUrl>   # flag only needed on Node 20
```

The account must be standalone or allow Lambda, DynamoDB and CloudFormation. An AWS Organizations service control policy can block deploys.

## Cost rules (keep it at $0)

- DynamoDB stays on **provisioned** capacity. The free 25 read + 25 write units cover all tables and indexes together. 10/10 is used now.
- Do not use Secrets Manager, NAT gateways, EC2, or on-demand DynamoDB.
- The WebSocket API is throttled (50 req/s, burst 100). Lambda logs are kept for 7 days.

## Known limitations

- Positions are in screen pixels, so drawings near the edge of a large screen may fall outside a smaller one.
- The eraser paints the white background colour.
- No login: anyone with a board link can draw on and clear that board.
- Boards are not saved yet (Phase 3).
