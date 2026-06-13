// Fix-52 verification — setBackgroundColor must enable polygon fill for
// closeable selected lines. Upstream actionProperties.tsx:397-421 computes:
//   !isTransparent(color) && selectedElements.every(isLine && canBecomePolygon)
// and applies toggleLinePolygonState(line, true) together with backgroundColor.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9340;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix52-line-polygon',
  '--window-size=1440,900',
  URL
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) {
        return t.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('no cdp');
}

const ws = new WebSocket(await discover());
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const messageId = ++id;
    pending.set(messageId, resolve);
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });

await new Promise((resolve) => (ws.onopen = resolve));
ws.onmessage = (event) => {
  const message = JSON.parse(event.data.toString());
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
};
await send('Runtime.enable');

const ev = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails);
    throw new Error(description);
  }
  return result.result.value;
};

for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`);
await sleep(1500);
for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}

const runCase = async ({ points, color }) =>
  ev(`(async () => {
    const { newLinearElement } = await import('/src/lib/element/newElement.ts');
    const { canBecomePolygon } = await import('/src/lib/element/typeChecks.ts');
    const c = window.__draw;
    c.clear();
    const line = newLinearElement({
      type: 'line',
      x: 320,
      y: 240,
      width: 140,
      height: 90,
      points: ${JSON.stringify(points)},
      polygon: false,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      fillStyle: 'hachure',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100
    });
    c.scene.replaceAllElements([line]);
    c.selectedIds.clear();
    c.selectedIds.add(line.id);
    c.appState.setState({
      selectedElementIds: { [line.id]: true },
      selectedGroupIds: {},
      selectedLinearElement: null
    });
    c.setBackgroundColor(${JSON.stringify(color)});
    const e = c.scene.elements[0];
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    return {
      color: ${JSON.stringify(color)},
      canBecomePolygonBefore: canBecomePolygon(${JSON.stringify(points)}),
      backgroundColor: e.backgroundColor,
      polygon: e.polygon,
      pointsLength: e.points.length,
      first,
      last,
      closed: first[0] === last[0] && first[1] === last[1],
      appStateColor: c.appState.current.currentItemBackgroundColor
    };
  })()`);

const closeableFill = await runCase({
  points: [
    [0, 0],
    [140, 0],
    [140, 90],
    [0, 90]
  ],
  color: '#a5d8ff'
});
const closeableTransparent = await runCase({
  points: [
    [0, 0],
    [140, 0],
    [140, 90],
    [0, 90]
  ],
  color: 'transparent'
});
const openLineFill = await runCase({
  points: [
    [0, 0],
    [140, 90]
  ],
  color: '#a5d8ff'
});

const closeableFillOk =
  closeableFill.canBecomePolygonBefore === true &&
  closeableFill.backgroundColor === '#a5d8ff' &&
  closeableFill.polygon === true &&
  closeableFill.pointsLength === 5 &&
  closeableFill.closed === true;
const transparentOk =
  closeableTransparent.backgroundColor === 'transparent' &&
  closeableTransparent.polygon === false &&
  closeableTransparent.pointsLength === 4;
const openLineOk =
  openLineFill.canBecomePolygonBefore === false &&
  openLineFill.backgroundColor === '#a5d8ff' &&
  openLineFill.polygon === false &&
  openLineFill.pointsLength === 2;
const ok = closeableFillOk && transparentOk && openLineOk;

console.log('--- Bug #52 differential: background color enables closeable line polygon fill ---');
console.log(JSON.stringify(
  {
    closeableFill,
    closeableFillOk,
    closeableTransparent,
    transparentOk,
    openLineFill,
    openLineOk,
    ok
  },
  null,
  2
));
console.log(ok ? 'PASS: closeable lines become filled polygons only for non-transparent background colors' : 'FAIL');

ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
