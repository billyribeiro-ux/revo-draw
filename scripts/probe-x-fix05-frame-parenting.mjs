// Fix-05 verification — newly created elements inside a frame get that frameId.
// Upstream create paths call getTopLayerFrameAtSceneCoords at pointer-down and
// pass frameId into new elements (components/App.tsx:9021, 9321, 9522).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9327;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix05',
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
    d.clear();
    localStorage.clear();
    d.appState.setState({ zoom: { value: 1 }, scrollX: 0, scrollY: 0 });
    if (d.gridMode) d.toggleGrid();

    const drag = (tool, x1, y1, x2, y2) => {
      d.setTool(tool);
      d.pointerDown(x1, y1, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      d.pointerMove(x2, y2, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      d.pointerUp();
      return d.scene.elements.at(-1);
    };

    const frame = drag('frame', 200, 200, 600, 500);
    const insideRect = drag('rectangle', 280, 280, 360, 340);
    const insideLine = drag('line', 300, 360, 420, 420);
    const insideFreeDraw = (() => {
      d.setTool('freedraw');
      d.pointerDown(330, 310, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      d.pointerMove(350, 325, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      d.pointerMove(370, 335, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      d.pointerUp();
      return d.scene.elements.at(-1);
    })();
    const insideText = (() => {
      d.setTool('text');
      d.pointerDown(390, 310, { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      d.setEditingText('inside frame');
      d.commitText();
      return d.scene.elements.at(-1);
    })();
    const outsideRect = drag('rectangle', 700, 260, 780, 340);

    JSON.stringify({
      frameId: frame.id,
      insideRect: insideRect.frameId,
      insideLine: insideLine.frameId,
      insideFreeDraw: insideFreeDraw.frameId,
      insideText: insideText.frameId,
      outsideRect: outsideRect.frameId,
      ok:
        insideRect.frameId === frame.id &&
        insideLine.frameId === frame.id &&
        insideFreeDraw.frameId === frame.id &&
        insideText.frameId === frame.id &&
        outsideRect.frameId === null,
    });
  `),
);

console.log('--- Bug #5 differential: new elements inherit top frame under cursor ---');
console.log(JSON.stringify(result));
console.log(result.ok ? 'PASS: inside creations got frameId; outside creation stayed unframed' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
