// Fix-17 verification: eraser strokes must erase every element intersected by
// the segment between pointer samples, and stationary clicks erase all hits.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix17-eraser',
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
    return `ERR ${result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails)}`;
  }
  return result.result.value;
};

for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`);
await sleep(1500);
for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}

const result = await ev(`(() => {
  const draw = window.__draw;
  draw.appState.setState({ scrollX: 0, scrollY: 0, zoom: { value: 1 } });

  const rect = (x, y, w, h) => {
    draw.setTool('rectangle');
    draw.pointerDown(x, y, {});
    draw.pointerMove(x + w, y + h, {});
    draw.pointerUp();
  };

  draw.clear();
  draw.setFillStyle('hachure');
  draw.setBackgroundColor('transparent');
  rect(320, 320, 40, 40);
  rect(430, 320, 40, 40);
  rect(540, 320, 40, 40);
  const strokeBefore = draw.scene.elements.length;
  draw.setTool('eraser');
  draw.pointerDown(260, 340, {});
  draw.pointerMove(620, 340, {});
  const strokeDuring = draw.scene.elements.length;
  draw.pointerUp();
  const strokeAfter = draw.scene.elements.length;
  draw.undo();
  const strokeUndo = draw.scene.elements.length;

  draw.clear();
  draw.setFillStyle('solid');
  draw.setBackgroundColor('#a5d8ff');
  rect(360, 360, 120, 80);
  rect(400, 380, 120, 80);
  const clickBefore = draw.scene.elements.length;
  draw.setTool('eraser');
  draw.pointerDown(430, 410, {});
  draw.pointerUp();
  const clickAfter = draw.scene.elements.length;

  return { strokeBefore, strokeDuring, strokeAfter, strokeUndo, clickBefore, clickAfter };
})()`);

console.log('eraser result:', JSON.stringify(result));
const ok =
  result.strokeBefore === 3 &&
  result.strokeDuring === 3 &&
  result.strokeAfter === 0 &&
  result.strokeUndo === 3 &&
  result.clickBefore === 2 &&
  result.clickAfter === 0;

console.log(
  ok
    ? 'PASS: eraser trail segments delete crossed elements and click erases all hits'
    : 'FAIL',
);
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
