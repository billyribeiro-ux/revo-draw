// Fix-26 verification — pasteAsPlaintext must still recognize Excalidraw
// clipboard envelopes and paste elements, not raw JSON text. Upstream checks
// data.elements before plaintext handling (components/App.tsx:3762).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9331;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix26',
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
    d.clear();
    d.appState.setState({ zoom: { value: 1 }, scrollX: 0, scrollY: 0 });
    d.setTool('rectangle');
    d.pointerDown(300, 200, mods);
    d.pointerMove(420, 300, mods);
    d.pointerUp();
    const source = d.scene.elements.find((el) => el.type === 'rectangle');
    const payload = JSON.stringify({
      type: 'excalidraw/clipboard',
      elements: [source],
    });
    d.clear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: async () => payload,
      },
    });
    await d.pasteAsPlaintext(600, 250);
    const elements = d.scene.elements;
    const pasted = elements[0];
    return JSON.stringify({
      count: elements.length,
      type: pasted?.type ?? null,
      textCount: elements.filter((el) => el.type === 'text').length,
      x: pasted ? Math.round(pasted.x) : null,
      y: pasted ? Math.round(pasted.y) : null,
      selected: pasted ? d.selectedIds.has(pasted.id) : false,
      ok:
        elements.length === 1 &&
        pasted?.type === 'rectangle' &&
        elements.filter((el) => el.type === 'text').length === 0 &&
        Math.round(pasted.x) === 540 &&
        Math.round(pasted.y) === 200 &&
        d.selectedIds.has(pasted.id),
    });
    })()
  `),
);

console.log('--- Bug #26 differential: plaintext paste preserves Excalidraw envelope ---');
console.log(JSON.stringify(result));
console.log(result.ok ? 'PASS: envelope pasted as element, not raw JSON text' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
