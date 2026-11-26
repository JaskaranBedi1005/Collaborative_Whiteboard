// Joins a board as a pretend second person ("Demo Friend") and draws a star,
// then waves the laser pointer, so you can see name tags and the
// "Demo Friend is drawing" activity line with only one browser window open.
// Handy for testing and for recording a demo.
//
// Usage (Node 20 needs the flag; Node 22+ does not):
//   node --experimental-websocket scripts/demo-friend.mjs <WebSocketUrl> <boardId> [name]
// e.g.
//   node --experimental-websocket scripts/demo-friend.mjs wss://xxxx.execute-api.us-east-1.amazonaws.com/prod u41063
//
// The star is saved like any other line (undo can't remove it for you, since
// it isn't yours; use Clear if you want it gone). The laser is never saved.

const [url, boardId, name = 'Demo Friend'] = process.argv.slice(2);
if (!url?.startsWith('wss://') || !boardId) {
  console.error('Usage: node --experimental-websocket scripts/demo-friend.mjs <WebSocketUrl> <boardId> [name]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const socket = new WebSocket(`${url}?board=${encodeURIComponent(boardId)}`);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = () => reject(new Error('Could not connect. Check the URL and board name.'));
});
const send = (message) => socket.send(JSON.stringify({ action: 'draw', ...message }));
const id = (kind) => `${Date.now()}-${kind}${Math.random().toString(36).slice(2, 6)}`;
console.log(`Joined board "${boardId}" as "${name}".`);

// Sends points in small batches every 50 ms, like the app does while drawing.
async function streamPoints(info, points) {
  for (let from = 0; from < points.length; from += 4) {
    send({ type: 'progress', stroke: info, from, points: points.slice(from, from + 4) });
    await sleep(50);
  }
}

// A five-pointed star, drawn slowly.
const cx = 420, cy = 300, outer = 140, inner = 60;
const corners = Array.from({ length: 11 }, (_, i) => {
  const r = i % 2 === 0 ? outer : inner;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});
const star = [];
for (let i = 0; i < corners.length - 1; i++) {
  const [x0, y0] = corners[i];
  const [x1, y1] = corners[i + 1];
  for (let t = 0; t < 1; t += 0.1) star.push([+(x0 + (x1 - x0) * t).toFixed(1), +(y0 + (y1 - y0) * t).toFixed(1)]);
}
star.push(corners.at(-1).map((v) => +v.toFixed(1)));

const pen = { id: id('star'), tool: 'pen', color: '#a855f7', size: 5, name };
console.log('Drawing a star...');
await streamPoints(pen, star);
const { name: _omit, ...saved } = pen; // the saved line carries no name, like the app
send({ type: 'stroke', stroke: { ...saved, points: star } });
await sleep(1500);

// Laser: a circle around the star.
console.log('Pointing with the laser...');
const laser = { id: id('laser'), tool: 'laser', color: '#ef4444', size: 4, name };
const circle = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 59) * Math.PI * 2;
  return [+(cx + 190 * Math.cos(a)).toFixed(1), +(cy + 190 * Math.sin(a)).toFixed(1)];
});
await streamPoints(laser, circle);

await sleep(2000);
socket.close();
console.log('Done.');
