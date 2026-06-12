// Fix-40 verification — reset zoom must preserve the viewport center. Upstream
// actionResetZoom uses getStateForZoom({ viewportX: width/2, viewportY: height/2,
// nextZoom: 1 }) instead of zeroing scroll (actions/actionCanvas.tsx:222).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9325;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix40',
  '--window-size=1440,900',
  URL,
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/json`);
      const target = (await response.json()).find(
        (entry) => entry.type === 'page' && entry.webSocketDebuggerUrl,
      );
      if (target) {
        return target.webSocketDebuggerUrl;
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

await new Promise((resolve) => {
  ws.onopen = resolve;
});

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
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        JSON.stringify(result.exceptionDetails),
    );
  }
  return result.result.value;
};

for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}

const result = JSON.parse(
  await ev(`
    window.__draw.clear();
    window.__draw.appState.setState({
      width: 1000,
      height: 800,
      offsetLeft: 0,
      offsetTop: 0,
      zoom: { value: 2 },
      scrollX: -150,
      scrollY: 25,
    });
    const before = window.__draw.appState.current;
    const centerBefore = {
      x: before.width / 2 / before.zoom.value - before.scrollX,
      y: before.height / 2 / before.zoom.value - before.scrollY,
    };
    window.__draw.resetView();
    const after = window.__draw.appState.current;
    const centerAfter = {
      x: after.width / 2 / after.zoom.value - after.scrollX,
      y: after.height / 2 / after.zoom.value - after.scrollY,
    };
    JSON.stringify({
      centerBefore,
      centerAfter,
      zoom: after.zoom.value,
      scrollX: after.scrollX,
      scrollY: after.scrollY,
    });
  `),
);

const close = (a, b) => Math.abs(a - b) < 0.0001;
const ok =
  close(result.centerBefore.x, result.centerAfter.x) &&
  close(result.centerBefore.y, result.centerAfter.y) &&
  close(result.zoom, 1) &&
  close(result.scrollX, 100) &&
  close(result.scrollY, 225);

console.log('--- Bug #40 differential: reset zoom preserves viewport center ---');
console.log(JSON.stringify(result));
console.log(ok ? 'PASS: resetView used getStateForZoom center rule' : 'FAIL');

ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
