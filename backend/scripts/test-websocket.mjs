// End-to-end check of the deployed WebSocket backend, no browser needed.
//
// Usage (Node 20 needs the flag; Node 22+ does not):
//   node --experimental-websocket scripts/test-websocket.mjs wss://xxxx.execute-api.us-east-1.amazonaws.com/prod

const url = process.argv[2];
if (!url?.startsWith('wss://')) {
  console.error('Pass the WebSocketUrl from `sam deploy` as the first argument.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = Math.random().toString(36).slice(2, 7);

function open(board) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${url}?board=${encodeURIComponent(board)}`);
    socket.received = [];
    socket.onmessage = (event) => socket.received.push(JSON.parse(event.data));
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error(`could not connect to board "${board}"`));
  });
}

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures += 1;
}

const a = await open(`test-${run}`);
const b = await open(`test-${run}`);
const c = await open(`other-${run}`);
check('three users connected', true);

await sleep(1500); // let the board index catch up

const stroke = { id: `t-${run}`, tool: 'pen', color: '#000000', size: 3, points: [[1, 1], [5, 5]] };
a.send(JSON.stringify({ action: 'draw', type: 'stroke', stroke }));
await sleep(3000);

check('B (same board) received the stroke', b.received.some((m) => m.stroke?.id === stroke.id));
check('C (other board) received nothing', c.received.length === 0);
check('A (sender) did not get its own stroke back', a.received.length === 0);

let rejected = false;
try {
  const bad = await open('not a valid board!');
  bad.close();
} catch {
  rejected = true;
}
check('invalid board name is refused', rejected);

for (const socket of [a, b, c]) socket.close();
await sleep(500);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
