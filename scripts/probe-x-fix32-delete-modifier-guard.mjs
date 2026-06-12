// Fix-32 verification — Delete/Backspace must not delete elements while Cmd/Ctrl
// is held. Upstream actionDeleteSelected keyTest guards against Ctrl/Cmd
// (EditorPreview wiring for Excalidraw's actionDeleteSelected).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9323;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix32',
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

const key = async (code, keyValue, modifiers = 0, virtualKeyCode) => {
  const base = {
    modifiers,
    code,
    key: keyValue,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(60);
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

await ev(`
  document.body.focus && document.body.focus();
  window.__draw.setTool('rectangle');
  window.__draw.pointerDown(300, 250, {});
  window.__draw.pointerMove(380, 330, {});
  window.__draw.pointerUp(380, 330, {});
  window.__draw.setTool('selection');
  window.__draw.selectAll();
`);

const META = 4;
const CTRL = 2;
const before = await ev(`window.__draw.scene.elements.filter((e) => !e.isDeleted).length`);
await key('Backspace', 'Backspace', META, 8);
const afterMetaBackspace = await ev(
  `window.__draw.scene.elements.filter((e) => !e.isDeleted).length`,
);
await key('Delete', 'Delete', CTRL, 46);
const afterCtrlDelete = await ev(
  `window.__draw.scene.elements.filter((e) => !e.isDeleted).length`,
);
await key('Delete', 'Delete', 0, 46);
const afterPlainDelete = await ev(
  `window.__draw.scene.elements.filter((e) => !e.isDeleted).length`,
);

const ok =
  before === 1 &&
  afterMetaBackspace === 1 &&
  afterCtrlDelete === 1 &&
  afterPlainDelete === 0;

console.log('--- Bug #32 differential: Delete ignores Cmd/Ctrl modifiers ---');
console.log(
  JSON.stringify({ before, afterMetaBackspace, afterCtrlDelete, afterPlainDelete }),
);
console.log(ok ? 'PASS: Cmd/Ctrl+Delete preserved selection; plain Delete removed it' : 'FAIL');

ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
