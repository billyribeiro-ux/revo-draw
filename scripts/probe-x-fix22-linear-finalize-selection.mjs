// Fix-22 verification — completed line/arrow creation should auto-select the
// element and populate selectedLinearElement. Upstream does this on finalize
// with selectedElementIds + new LinearElementEditor (components/App.tsx:10934).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9329;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix22',
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
    const d = window.__draw;
    const mods = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
    const drawLinear = (tool, x1, y1, x2, y2) => {
      d.clear();
      d.appState.setState({ zoom: { value: 1 }, scrollX: 0, scrollY: 0 });
      d.setTool(tool);
      d.pointerDown(x1, y1, mods);
      d.pointerMove(x2, y2, mods);
      d.pointerUp();
      const el = d.scene.elements.find((element) => element.type === tool);
      const editor = d.appState.current.selectedLinearElement;
      return {
        id: el?.id ?? null,
        selected: el ? d.selectedIds.has(el.id) : false,
        selectedElementIds: el ? d.appState.current.selectedElementIds[el.id] === true : false,
        editorElementId: editor?.elementId ?? null,
        isEditing: editor?.isEditing ?? null,
        activeTool: d.activeTool,
      };
    };
    const line = drawLinear('line', 240, 220, 420, 300);
    const arrow = drawLinear('arrow', 260, 260, 460, 360);
    JSON.stringify({
      line,
      arrow,
      ok:
        line.id &&
        line.selected &&
        line.selectedElementIds &&
        line.editorElementId === line.id &&
        line.isEditing === false &&
        line.activeTool === 'selection' &&
        arrow.id &&
        arrow.selected &&
        arrow.selectedElementIds &&
        arrow.editorElementId === arrow.id &&
        arrow.isEditing === false &&
        arrow.activeTool === 'selection',
    });
  `),
);

console.log('--- Bug #22 differential: created linear elements finalize selected ---');
console.log(JSON.stringify(result));
console.log(result.ok ? 'PASS: line and arrow finalize with selection + LinearElementEditor' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
