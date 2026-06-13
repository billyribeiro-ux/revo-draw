// Root-route smoke probe: verifies the deployed landing path exposes the same
// interactive web editor as /x.
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchChrome } from './cdp-probe-utils.mjs';

const URL = process.env.TARGET_URL ?? 'http://localhost:1420/';

const { port: PORT, cleanup } = await launchChrome({ url: URL, prefix: 'lf-web-root' });

async function discover() {
  for (let i = 0; i < 60; i += 1) {
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
    return `ERR ${
      result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails)
    }`;
  }
  return result.result.value;
};

for (let i = 0; i < 80; i += 1) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}

await ev(`localStorage.clear(); location.reload();`);
await sleep(1000);
for (let i = 0; i < 80; i += 1) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}
await ev(`window.__draw?.clear(); window.__draw?.setTool('selection');`);
await sleep(100);

const result = await ev(`(() => {
  const toolbar = document.querySelector('.toolbar');
  const canvases = document.querySelectorAll('canvas');
  const buttons = toolbar ? Array.from(toolbar.querySelectorAll('button')) : [];
  return {
    url: location.href,
    hasController: !!window.__draw,
    hasToolbar: !!toolbar,
    buttonCount: buttons.length,
    canvasCount: canvases.length,
    activeTool: window.__draw?.activeTool,
    strokeColor: window.__draw?.strokeColor,
    backgroundColor: window.__draw?.backgroundColor,
    showProperties: window.__draw?.showProperties,
    hasWelcome: document.body.innerText.includes('Create a new drawing'),
    bodyText: document.body.innerText.slice(0, 240),
  };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/web-root.png', Buffer.from(shot.data, 'base64'));
console.log('root smoke:', JSON.stringify(result));
console.log('screenshot -> /tmp/web-root.png');

const ok =
  result.hasController === true &&
  result.hasToolbar === true &&
  result.buttonCount >= 15 &&
  result.canvasCount >= 2 &&
  result.activeTool === 'selection' &&
  result.backgroundColor === 'transparent' &&
  result.showProperties === false;

console.log(ok ? 'PASS: root route loads the web editor' : 'FAIL');
ws.close();
cleanup();
process.exit(ok ? 0 : 1);
