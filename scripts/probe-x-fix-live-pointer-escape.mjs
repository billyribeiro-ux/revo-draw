// Live regression probe: drawing must not lose the gesture when the pointer
// crosses the left properties island, and a freshly drawn shape must stay
// selected so the properties controls remain usable.
import { setTimeout as sleep } from 'node:timers/promises';
import { launchChrome } from './cdp-probe-utils.mjs';

const URL = process.env.TARGET_URL ?? 'http://localhost:1420/';

const { port: PORT, cleanup } = await launchChrome({
  url: URL,
  prefix: 'lf-live-pointer-escape',
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

const mouse = (type, x, y, buttons = 0) =>
  send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    buttons,
    button: type === 'mouseMoved' && buttons === 0 ? 'none' : 'left',
    clickCount: 1,
  });

for (let i = 0; i < 80; i += 1) {
  if ((await ev('!!window.__draw')) === true) break;
  await sleep(250);
}

await ev(`localStorage.clear(); window.__draw.clear(); window.__draw.setTool('selection');`);
await sleep(80);

const initial = await ev(`(() => ({
  activeTool: window.__draw.activeTool,
  stroke: window.__draw.strokeColor,
  background: window.__draw.backgroundColor,
  showProperties: window.__draw.showProperties,
}))()`);

await ev(`window.__draw.setTool('rectangle')`);
await sleep(50);

// Start on the canvas, cross the left properties panel while still pressed,
// then return to the canvas and release. This mirrors the upstream window-level
// pointer lifecycle in App.tsx.
await mouse('mouseMoved', 460, 310);
await mouse('mousePressed', 460, 310, 1);
await sleep(30);
await mouse('mouseMoved', 80, 150, 1);
await sleep(30);
await mouse('mouseMoved', 680, 460, 1);
await sleep(30);
await mouse('mouseReleased', 680, 460);
await sleep(120);

const afterDraw = await ev(`(() => {
  const panel = document.querySelector('.properties');
  const panelRect = panel?.getBoundingClientRect();
  const selected = window.__draw.selectedElements;
  const el = window.__draw.scene.elements[0] ?? null;
  return {
    activeTool: window.__draw.activeTool,
    showProperties: window.__draw.showProperties,
    elementCount: window.__draw.scene.elements.length,
    selectedCount: selected.length,
    selectedType: selected[0]?.type ?? null,
    elementType: el?.type ?? null,
    width: el ? Math.round(el.width) : 0,
    height: el ? Math.round(el.height) : 0,
    background: el?.backgroundColor ?? null,
    panelVisible: panel ? getComputedStyle(panel).display !== 'none' : false,
    panelBox: panelRect
      ? {
          left: Math.round(panelRect.left),
          top: Math.round(panelRect.top),
          width: Math.round(panelRect.width),
          height: Math.round(panelRect.height),
        }
      : null,
  };
})()`);

await mouse('mouseMoved', 42, 102);
await sleep(80);

const afterPanelHover = await ev(`(() => ({
  showProperties: window.__draw.showProperties,
  selectedCount: window.__draw.selectedElements.length,
  hitTag: document.elementFromPoint(42, 102)?.tagName ?? null,
  hitClass: document.elementFromPoint(42, 102)?.className ?? null,
}))()`);

console.log('initial defaults:', JSON.stringify(initial));
console.log('after draw crossing panel:', JSON.stringify(afterDraw));
console.log('after panel hover:', JSON.stringify(afterPanelHover));

const ok =
  initial.activeTool === 'selection' &&
  initial.background === 'transparent' &&
  initial.showProperties === false &&
  afterDraw.activeTool === 'selection' &&
  afterDraw.elementCount === 1 &&
  afterDraw.elementType === 'rectangle' &&
  afterDraw.width > 150 &&
  afterDraw.height > 100 &&
  afterDraw.background === 'transparent' &&
  afterDraw.selectedCount === 1 &&
  afterDraw.selectedType === 'rectangle' &&
  afterDraw.showProperties === true &&
  afterDraw.panelVisible === true &&
  afterPanelHover.showProperties === true &&
  afterPanelHover.selectedCount === 1;

console.log(
  ok
    ? 'PASS: drawing survives left-panel crossing and created shape remains selected'
    : 'FAIL',
);
ws.close();
cleanup();
process.exit(ok ? 0 : 1);
