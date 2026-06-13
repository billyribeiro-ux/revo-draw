// Fix-07 verification — text tool pointer-down must bind to an eligible
// container or edit existing bound text instead of always creating free text.
// Mirrors App.handleTextOnPointerDown (App.tsx:8965-9002).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9335;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix07',
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
      d.setBackgroundColor('#a5d8ff');
      d.setFillStyle('solid');
      const rect = draw('rectangle', 300, 240, 500, 360);

      d.setTool('text');
      d.pointerDown(400, 300, mods);
      const boundText = texts()[0];
      const created = {
        textCount: texts().length,
        containerId: boundText?.containerId ?? null,
        boundElementId:
          rect.boundElements?.find((entry) => entry.type === 'text')?.id ?? null,
        editingTextId: d.editingText?.id ?? null,
        selectedRect: d.selectedIds.has(rect.id),
        textAlign: boundText?.textAlign ?? null,
        verticalAlign: boundText?.verticalAlign ?? null,
      };
      const createOk =
        created.textCount === 1 &&
        created.containerId === rect.id &&
        created.boundElementId === boundText.id &&
        created.editingTextId === boundText.id &&
        created.selectedRect &&
        created.textAlign === 'center' &&
        created.verticalAlign === 'middle';

      d.setEditingText('Label');
      d.commitText();
      d.setTool('text');
      d.pointerDown(400, 300, mods);
      const reopened = {
        textCount: texts().length,
        editingTextId: d.editingText?.id ?? null,
        sameText: texts()[0]?.id === boundText.id,
        selectedRect: d.selectedIds.has(rect.id),
      };
      const reopenOk =
        reopened.textCount === 1 &&
        reopened.editingTextId === boundText.id &&
        reopened.sameText &&
        reopened.selectedRect;

      d.commitText();
      d.deselect();
      d.setTool('text');
      d.pointerDown(760, 420, mods);
      const freeText = texts().find((el) => !el.containerId);
      const freeOk =
        texts().length === 2 &&
        !!freeText &&
        freeText.containerId === null &&
        d.editingText?.id === freeText.id;

      return JSON.stringify({
        created,
        reopened,
        free: {
          textCount: texts().length,
          freeTextId: freeText?.id ?? null,
          editingTextId: d.editingText?.id ?? null,
        },
        ok: createOk && reopenOk && freeOk,
      });
    })()
  `),
);

console.log('--- Bug #7 differential: text tool binds/edits container text ---');
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? 'PASS: text tool binds to containers and reopens existing text' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
