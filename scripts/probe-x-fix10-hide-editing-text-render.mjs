// Fix-10 verification — while a text element is being edited, the static
// canvas must not also render that same text below the textarea. Mirrors the
// upstream editingTextElement render exclusion.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9338;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix10',
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
    (async () => {
      const d = window.__draw;
      const mods = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const darkPixelCount = (text) => {
        const canvas = document.querySelector('.canvas-wrap canvas.layer');
        const rect = canvas.getBoundingClientRect();
        const ratioX = canvas.width / rect.width;
        const ratioY = canvas.height / rect.height;
        const x = Math.max(0, Math.floor((text.x - 4) * ratioX));
        const y = Math.max(0, Math.floor((text.y - 4) * ratioY));
        const width = Math.min(
          canvas.width - x,
          Math.ceil((text.width + 8) * ratioX),
        );
        const height = Math.min(
          canvas.height - y,
          Math.ceil((text.height + 8) * ratioY),
        );
        const data = canvas
          .getContext('2d')
          .getImageData(x, y, width, height).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 0 && data[i] < 120 && data[i + 1] < 120 && data[i + 2] < 120) {
            count += 1;
          }
        }
        return count;
      };

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
      d.pointerDown(300, 220, mods);
      const text = d.editingText;
      d.setEditingText('Visible text');
      d.commitText();
      await nextFrame();
      await nextFrame();
      const committedPixels = darkPixelCount(text);

      d.editingTextId = text.id;
      await nextFrame();
      await nextFrame();
      const editingPixels = darkPixelCount(text);
      const textareaPresent = !!document.querySelector('textarea.text-editor');
      const ok =
        committedPixels > 20 &&
        editingPixels < Math.max(5, committedPixels * 0.1) &&
        textareaPresent;

      return JSON.stringify({
        committedPixels,
        editingPixels,
        textareaPresent,
        ok,
      });
    })()
  `),
);

console.log('--- Bug #10 differential: editing text is hidden from static canvas ---');
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? 'PASS: static canvas omits the text being edited' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
