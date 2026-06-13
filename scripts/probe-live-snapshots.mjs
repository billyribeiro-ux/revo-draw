// Live playground probe for the root web app. Drives visible interaction paths
// and records screenshots + state snapshots for forensic review.
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchChrome } from './cdp-probe-utils.mjs';

const URL = process.env.TARGET_URL ?? 'http://localhost:1420/';
const OUT_DIR = process.env.SNAPSHOT_DIR ?? '/tmp/revo-draw-live-snapshots';

mkdirSync(OUT_DIR, { recursive: true });

const { port: PORT, cleanup } = await launchChrome({ url: URL, prefix: 'lf-live-snapshots' });

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
await send('Page.enable');

const consoleMessages = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data.toString());
  if (message.method === 'Runtime.consoleAPICalled') {
    consoleMessages.push({
      type: message.params.type,
      text: message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
    });
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleMessages.push({
      type: 'exception',
      text: message.params.exceptionDetails.text,
    });
  }
});

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

const key = async (keyName, code, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, modifiers });
};

async function waitForController() {
  for (let i = 0; i < 80; i += 1) {
    if ((await ev('!!window.__draw')) === true) return;
    await sleep(250);
  }
  throw new Error('window.__draw not available');
}

const snapshots = [];
async function capture(label) {
  const index = String(snapshots.length + 1).padStart(2, '0');
  const screenshotPath = `${OUT_DIR}/${index}-${label}.png`;
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  const state = await ev(`(() => {
    const toolbar = document.querySelector('.toolbar');
    const activeButton = toolbar?.querySelector('button.active');
    const selected = window.__draw?.selectedElements ?? [];
    return {
      href: location.href,
      text: document.body.innerText.slice(0, 400),
      activeTool: window.__draw?.activeTool,
      zoom: window.__draw?.zoom,
      strokeColor: window.__draw?.strokeColor,
      backgroundColor: window.__draw?.backgroundColor,
      showProperties: window.__draw?.showProperties,
      elementCount: window.__draw?.scene.elements.length,
      selectedCount: selected.length,
      selectedTypes: selected.map((element) => element.type),
      toolbarButtons: toolbar ? toolbar.querySelectorAll('button').length : 0,
      activeButtonLabel: activeButton?.getAttribute('aria-label') ?? null,
      hasContextMenu: !!document.querySelector('.context-menu'),
      hasMainMenu: !!document.querySelector('.main-menu'),
      hasDialog: !!document.querySelector('[role="dialog"]'),
      consoleMessages: ${JSON.stringify(consoleMessages)}.slice(-10),
    };
  })()`);
  snapshots.push({ label, screenshotPath, state });
  console.log(`${index} ${label}: ${JSON.stringify(state)}`);
}

await waitForController();
await ev(`window.__draw.clear(); window.__draw.setTool('selection'); localStorage.clear();`);
await mouse('mouseMoved', 200, 200);
await sleep(150);
await capture('root-loaded');

await ev(`window.__draw.setTool('rectangle')`);
await mouse('mouseMoved', 420, 260);
await mouse('mousePressed', 420, 260, 1);
await mouse('mouseMoved', 660, 410, 1);
await mouse('mouseReleased', 660, 410);
await sleep(120);
await capture('rectangle-created');

await mouse('mouseMoved', 42, 102);
await sleep(80);
await capture('left-panel-hover');

await ev(`window.__draw.setTool('selection')`);
await mouse('mouseMoved', 420, 335);
await mouse('mousePressed', 420, 335, 1);
await mouse('mouseMoved', 500, 390, 1);
await mouse('mouseReleased', 500, 390);
await sleep(120);
await capture('selection-moved');

await ev(`window.__draw.setTool('text'); window.__draw.pointerDown(760, 285);`);
await sleep(180);
await send('Input.insertText', { text: 'Live E2E text' });
await ev(`document.querySelector('.text-editor')?.blur()`);
await key('Escape', 'Escape');
await sleep(180);
await capture('text-created');

await ev(`window.__draw.setTool('arrow')`);
await mouse('mouseMoved', 360, 520);
await mouse('mousePressed', 360, 520, 1);
await mouse('mouseMoved', 760, 600, 1);
await mouse('mouseReleased', 760, 600);
await sleep(120);
await capture('arrow-created');

await ev(`document.querySelectorAll('.toolbar button')[0].click()`);
await sleep(120);
await capture('main-menu-open');
await mouse('mouseMoved', 1200, 740);
await mouse('mousePressed', 1200, 740, 1);
await mouse('mouseReleased', 1200, 740);
await sleep(80);

await ev(`document.querySelectorAll('canvas')[1].dispatchEvent(new MouseEvent('contextmenu', { clientX: 620, clientY: 390, bubbles: true }))`);
await sleep(120);
await capture('context-menu-open');
await key('Escape', 'Escape');
await sleep(80);

const zoomBefore = await ev(`window.__draw.zoom`);
await send('Input.dispatchMouseEvent', {
  type: 'mouseWheel',
  x: 720,
  y: 450,
  deltaX: 0,
  deltaY: -240,
  modifiers: 2,
});
await sleep(120);
await capture('zoomed');

const reportPath = `${OUT_DIR}/report.json`;
writeFileSync(reportPath, `${JSON.stringify({ url: URL, snapshots }, null, 2)}\n`);
console.log(`live snapshots report -> ${reportPath}`);
console.log(`live snapshots dir -> ${OUT_DIR}`);

const finalState = snapshots.at(-1)?.state;
const rootState = snapshots.find((snapshot) => snapshot.label === 'root-loaded')?.state;
const rectState = snapshots.find((snapshot) => snapshot.label === 'rectangle-created')?.state;
const panelHoverState = snapshots.find((snapshot) => snapshot.label === 'left-panel-hover')?.state;
const ok =
  finalState?.elementCount >= 3 &&
  finalState?.zoom > zoomBefore &&
  rootState?.backgroundColor === 'transparent' &&
  rootState?.showProperties === false &&
  rectState?.selectedCount === 1 &&
  rectState?.showProperties === true &&
  panelHoverState?.selectedCount === 1 &&
  panelHoverState?.showProperties === true &&
  snapshots.every((snapshot) => snapshot.state.toolbarButtons >= 15) &&
  snapshots.find((snapshot) => snapshot.label === 'context-menu-open')?.state.hasContextMenu === true &&
  finalState?.hasContextMenu === false &&
  consoleMessages.every((message) => message.type !== 'exception');

console.log(ok ? 'PASS: live interaction snapshot path completed' : 'FAIL');
ws.close();
cleanup();
process.exit(ok ? 0 : 1);
