// Bound-text style propagation verification. Upstream style actions call
// changeProperty(..., includeBoundText=true) for stroke color, opacity, and
// text-style actions, so selecting a container must also restyle its bound text.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9341;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-bound-text-style',
  '--window-size=1440,900',
  URL
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) {
        return t.webSocketDebuggerUrl;
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

await new Promise((resolve) => (ws.onopen = resolve));
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
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails);
    throw new Error(description);
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
  const d = window.__draw;
  const draw = (tool, x1, y1, x2, y2) => {
    d.setTool(tool);
    d.pointerDown(x1, y1, {});
    d.pointerMove(x2, y2, {});
    d.pointerUp(x2, y2, {});
    return d.scene.elements.at(-1);
  };
  const selectOnly = (element) => {
    d.selectedIds.clear();
    d.selectedIds.add(element.id);
    d.appState.setState({
      selectedElementIds: { [element.id]: true },
      selectedGroupIds: {},
      selectedLinearElement: null
    });
  };
  const snapshot = (rect, text) => ({
    rect: {
      id: rect.id,
      strokeColor: rect.strokeColor,
      opacity: rect.opacity,
      selected: d.selectedIds.has(rect.id)
    },
    text: {
      id: text.id,
      containerId: text.containerId,
      strokeColor: text.strokeColor,
      opacity: text.opacity,
      fontFamily: text.fontFamily,
      fontSize: text.fontSize,
      textAlign: text.textAlign,
      width: Math.round(text.width),
      height: Math.round(text.height)
    },
    showTextProperties: d.showTextProperties,
    currentFontFamily: d.currentFontFamily,
    currentFontSize: d.currentFontSize,
    currentTextAlign: d.currentTextAlign
  });

  d.clear();
  d.appState.setState({
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    width: 1440,
    height: 900
  });
  d.setBackgroundColor('#a5d8ff');
  d.setFillStyle('solid');
  const rect = draw('rectangle', 300, 240, 520, 380);

  d.setTool('text');
  d.pointerDown(410, 310, {});
  d.setEditingText('Bound label');
  d.commitText();
  const text = d.scene.elements.find((element) => element.type === 'text');
  selectOnly(rect);

  const before = snapshot(rect, text);
  d.setStrokeColor('#e03131');
  d.setOpacity(62);
  d.setFontFamily(6);
  d.setFontSize(36);
  d.setTextAlign('right');
  const after = snapshot(rect, text);

  const ok =
    before.text.containerId === rect.id &&
    before.showTextProperties === true &&
    before.currentFontSize === before.text.fontSize &&
    after.rect.strokeColor === '#e03131' &&
    after.rect.opacity === 62 &&
    after.text.strokeColor === '#e03131' &&
    after.text.opacity === 62 &&
    after.text.fontFamily === 6 &&
    after.text.fontSize === 36 &&
    after.text.textAlign === 'right' &&
    after.showTextProperties === true &&
    after.currentFontFamily === 6 &&
    after.currentFontSize === 36 &&
    after.currentTextAlign === 'right';

  return {
    before,
    after,
    ok
  };
})()`);

console.log('--- Bound-text differential: selected container restyles its bound text ---');
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? 'PASS: bound text follows container stroke/opacity and text-style controls' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
