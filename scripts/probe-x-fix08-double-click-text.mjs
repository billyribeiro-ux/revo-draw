// Fix-08 verification — double-click in selection mode should edit existing
// text or create/bind text, matching App.handleCanvasDoubleClick
// (App.tsx:6406-6620).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9336;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix08',
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
      const texts = () => d.scene.elements.filter((el) => el.type === 'text');

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
      d.pointerDown(260, 240, mods);
      const free = d.editingText;
      d.setEditingText('Free label');
      d.commitText();
      d.deselect();
      d.setTool('selection');
      d.doubleClickAt(free.x + free.width / 2, free.y + free.height / 2);
      const editExisting = {
        textCount: texts().length,
        editingTextId: d.editingText?.id ?? null,
        sameText: d.editingText?.id === free.id,
      };
      const editExistingOk =
        editExisting.textCount === 1 && editExisting.sameText;

      d.commitText();
      d.deselect();
      d.doubleClickAt(720, 420);
      const createdFree = d.editingText;
      const createFree = {
        textCount: texts().length,
        editingTextId: createdFree?.id ?? null,
        containerId: createdFree?.containerId ?? null,
      };
      const createFreeOk =
        createFree.textCount === 2 &&
        !!createdFree &&
        createdFree.containerId === null;

      d.commitText();
      d.deselect();
      d.setBackgroundColor('#a5d8ff');
      d.setFillStyle('solid');
      const rect = draw('rectangle', 360, 260, 560, 380);
      d.setTool('selection');
      d.deselect();
      d.doubleClickAt(460, 320);
      const boundText = texts().find((el) => el.containerId === rect.id);
      const bound = {
        textCount: texts().length,
        boundTextId: boundText?.id ?? null,
        containerId: boundText?.containerId ?? null,
        boundElementId:
          rect.boundElements?.find((entry) => entry.type === 'text')?.id ?? null,
        editingTextId: d.editingText?.id ?? null,
        selectedRect: d.selectedIds.has(rect.id),
      };
      const boundOk =
        bound.containerId === rect.id &&
        bound.boundElementId === boundText.id &&
        bound.editingTextId === boundText.id &&
        bound.selectedRect;

      return JSON.stringify({
        editExisting,
        createFree,
        bound,
        ok: editExistingOk && createFreeOk && boundOk,
      });
    })()
  `),
);

console.log('--- Bug #8 differential: double-click edits/creates text ---');
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? 'PASS: double-click text flow matches upstream rule' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
