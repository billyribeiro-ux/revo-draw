// Fix-09 verification — in-place text editor overlay must use camera
// scene→viewport coordinates and zoom-scaled font/box dimensions. Mirrors
// App.handleTextWysiwyg getViewportCoords (App.tsx:5745-5755).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9337;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix09',
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
    (async () => {
      const d = window.__draw;
      const mods = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
      const within = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;

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
      d.setTool('text');
      d.pointerDown(300, 200, mods);
      const text = d.editingText;
      d.setEditingText('Camera text');
      d.commitText();

      d.appState.setState({
        zoom: { value: 2 },
        scrollX: 100,
        scrollY: 50,
        offsetLeft: 12,
        offsetTop: 8,
      });
      d.editingTextId = text.id;
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));

      const latest = d.editingText;
      const textarea = document.querySelector('textarea.text-editor');
      const style = textarea ? getComputedStyle(textarea) : null;
      const actual = style
        ? {
            left: Number.parseFloat(style.left),
            top: Number.parseFloat(style.top),
            width: Number.parseFloat(style.width),
            height: Number.parseFloat(style.height),
            fontSize: Number.parseFloat(style.fontSize),
          }
        : null;
      const expected = {
        left: (latest.x + 100) * 2 + 12,
        top: (latest.y + 50) * 2 + 8,
        width: latest.width * 2,
        height: latest.height * 2,
        fontSize: latest.fontSize * 2,
      };
      const ok =
        actual !== null &&
        within(actual.left, expected.left) &&
        within(actual.top, expected.top) &&
        within(actual.width, expected.width) &&
        within(actual.height, expected.height) &&
        within(actual.fontSize, expected.fontSize);

      return JSON.stringify({
        actual,
        expected: {
          left: Math.round(expected.left),
          top: Math.round(expected.top),
          width: Math.round(expected.width),
          height: Math.round(expected.height),
          fontSize: Math.round(expected.fontSize),
        },
        rawSceneWouldHaveBeen: {
          left: Math.round(latest.x),
          top: Math.round(latest.y),
          fontSize: latest.fontSize,
        },
        ok,
      });
    })()
  `),
);

console.log('--- Bug #9 differential: text editor overlay follows camera ---');
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? 'PASS: textarea is positioned/scaled in viewport space' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
