// Fix-39 verification — actionAlign predicate gates on selected groups and
// excludes frames (actions/actionAlign.tsx:43-52). The visible regression is
// frame selections: alignment must no-op when any selected element is frame-like.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix39',
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

let ready = false;
for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    ready = true;
    break;
  }
  await sleep(250);
}
if (!ready) {
  throw new Error('window.__draw did not initialize');
}

const result = JSON.parse(
  await ev(`
    (() => {
      const d = window.__draw;
      const mods = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
      const draw = (tool, x1, y1, x2, y2) => {
        d.setTool(tool);
        d.pointerDown(x1, y1, mods);
        d.pointerMove(x2, y2, mods);
        d.pointerUp(x2, y2);
        return d.scene.elements.at(-1);
      };

      d.clear();
      d.appState.setState({
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        offsetLeft: 0,
        offsetTop: 0,
        width: 1440,
        height: 900,
      });
      const a = draw('rectangle', 100, 220, 180, 300);
      const b = draw('rectangle', 420, 220, 520, 300);
      d.selectAll();
      const aBefore = { x: a.x, width: a.width };
      d.alignSelected('end', 'x');
      const positiveOk =
        Math.round(a.x + a.width) === Math.round(b.x + b.width) &&
        Math.round(a.x) !== Math.round(aBefore.x);

      d.clear();
      d.appState.setState({
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
        offsetLeft: 0,
        offsetTop: 0,
        width: 1440,
        height: 900,
      });
      const frame = draw('frame', 200, 180, 360, 340);
      const rect = draw('rectangle', 520, 220, 600, 300);
      d.selectAll();
      const frameBefore = { x: frame.x, y: frame.y, version: frame.version };
      const rectBefore = { x: rect.x, y: rect.y, version: rect.version };
      d.alignSelected('start', 'x');
      const frameGuardOk =
        Math.round(frame.x) === Math.round(frameBefore.x) &&
        Math.round(frame.y) === Math.round(frameBefore.y) &&
        frame.version === frameBefore.version &&
        Math.round(rect.x) === Math.round(rectBefore.x) &&
        Math.round(rect.y) === Math.round(rectBefore.y) &&
        rect.version === rectBefore.version;

      return JSON.stringify({
        positive: {
          leftRectBeforeX: Math.round(aBefore.x),
          leftRectAfterX: Math.round(a.x),
          alignedRight: Math.round(a.x + a.width),
          targetRight: Math.round(b.x + b.width),
          ok: positiveOk,
        },
        frameGuard: {
          frameX: Math.round(frame.x),
          frameVersion: frame.version,
          rectX: Math.round(rect.x),
          rectVersion: rect.version,
          ok: frameGuardOk,
        },
        ok: positiveOk && frameGuardOk,
      });
    })()
  `),
);

console.log('--- Bug #39 differential: align predicate guards groups/frames ---');
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? 'PASS: align guard matches upstream predicate' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
