// Fix-44 verification — Shift+wheel scrolls horizontally. Upstream App.tsx
// handles shift-wheel as: scrollX = scrollX - (deltaY || deltaX) / zoom.value
// (components/App.tsx:12853).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9324;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix44',
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

await ev(`
  window.__draw.clear();
  window.__draw.appState.setState({
    scrollX: 10,
    scrollY: 20,
    zoom: { value: 2 },
  });
`);
await sleep(100);

const wheel = async (deltaX, deltaY, shiftKey = false) => {
  await ev(`
    document.querySelectorAll('canvas.layer')[1].dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: 720,
        clientY: 450,
        deltaX: ${deltaX},
        deltaY: ${deltaY},
        shiftKey: ${shiftKey},
      })
    );
  `);
  await sleep(80);
};

await wheel(0, 120, true);
const afterShiftDeltaY = await ev(
  `JSON.stringify({ scrollX: window.__draw.appState.current.scrollX, scrollY: window.__draw.appState.current.scrollY })`,
);

await wheel(80, 0, true);
const afterShiftDeltaX = await ev(
  `JSON.stringify({ scrollX: window.__draw.appState.current.scrollX, scrollY: window.__draw.appState.current.scrollY })`,
);

await wheel(40, 60, false);
const afterNormalWheel = await ev(
  `JSON.stringify({ scrollX: window.__draw.appState.current.scrollX, scrollY: window.__draw.appState.current.scrollY })`,
);

const s1 = JSON.parse(afterShiftDeltaY);
const s2 = JSON.parse(afterShiftDeltaX);
const s3 = JSON.parse(afterNormalWheel);

const close = (a, b) => Math.abs(a - b) < 0.0001;
const ok =
  close(s1.scrollX, -50) &&
  close(s1.scrollY, 20) &&
  close(s2.scrollX, -90) &&
  close(s2.scrollY, 20) &&
  close(s3.scrollX, -110) &&
  close(s3.scrollY, -10);

console.log('--- Bug #44 differential: Shift+wheel pans horizontally ---');
console.log(JSON.stringify({ afterShiftDeltaY: s1, afterShiftDeltaX: s2, afterNormalWheel: s3 }));
console.log(ok ? 'PASS: shift-wheel used horizontal delta rule; normal wheel unchanged' : 'FAIL');

ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
