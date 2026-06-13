// UI regression probe: active property buttons should use Excalidraw's
// surface-container active state, not the old solid brand blue/purple fill.
import { setTimeout as sleep } from 'node:timers/promises';
import { launchChrome } from './cdp-probe-utils.mjs';

const URL = process.env.TARGET_URL ?? 'http://localhost:1420/';

const { port: PORT, cleanup } = await launchChrome({
  url: URL,
  prefix: 'lf-property-active-colors',
});

async function discover() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://localhost:${PORT}/json`);
      const target = (await response.json()).find(
        (entry) => entry.type === 'page' && entry.webSocketDebuggerUrl,
      );
      if (target) return target.webSocketDebuggerUrl;
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
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method, params }));
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
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
};

for (let i = 0; i < 80; i += 1) {
  if ((await ev('!!window.__draw')) === true) break;
  await sleep(250);
}

const readActive = (selector) => ev(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((node) => {
  const style = getComputedStyle(node);
  return {
    label: node.getAttribute('aria-label') ?? node.getAttribute('title') ?? '',
    background: style.backgroundColor,
    color: style.color,
    borderColor: style.borderTopColor,
  };
})`);

await ev(`(() => {
  const d = window.__draw;
  const mods = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  d.clear();
  d.setTool('rectangle');
  d.pointerDown(360, 240, mods);
  d.pointerMove(500, 360, mods);
  d.pointerUp();
})()`);
await sleep(80);
const shape = await readActive('.style-controls .square.active');

await ev(`(() => {
  const d = window.__draw;
  const mods = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  d.clear();
  d.setTool('text');
  d.pointerDown(620, 250, mods);
  d.setEditingText('Probe');
  d.commitText();
  d.selectAll();
})()`);
await sleep(80);
const text = await readActive('.text-controls .square.active');

await ev(`(() => {
  const d = window.__draw;
  const mods = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  d.clear();
  d.setTool('arrow');
  d.pointerDown(360, 520, mods);
  d.pointerMove(620, 580, mods);
  d.pointerUp();
  d.selectAll();
})()`);
await sleep(80);
const arrow = await readActive('.arrowhead-controls .square.active');

const result = { shape, text, arrow };

console.log('property active colors:', JSON.stringify(result));

const oldSolid = new Set(['rgb(105, 101, 219)', '#6965db']);
const groups = [result.shape, result.text, result.arrow];
const ok =
  groups.every((group) => group.length > 0) &&
  groups.flat().every((item) => !oldSolid.has(item.background));

console.log(
  ok
    ? 'PASS: property active buttons do not use solid brand fill'
    : 'FAIL',
);
ws.close();
cleanup();
process.exit(ok ? 0 : 1);
