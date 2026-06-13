// Fix-25 verification — Q toggles tool lock and drawing honors it. Upstream
// checks activeTool.locked before resetting to selection (App.tsx:10934,
// actionFinalize.tsx) and Q invokes toggleLock (App.tsx:5104).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9330;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix25',
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
    const q = () => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'q',
        code: 'KeyQ',
        bubbles: true,
        cancelable: true,
      }));
    };
    const drawRect = (x1, y1, x2, y2) => {
      d.pointerDown(x1, y1, mods);
      d.pointerMove(x2, y2, mods);
      d.pointerUp();
    };
    const rectCount = () => d.scene.elements.filter((el) => el.type === 'rectangle').length;

    d.clear();
    d.appState.setState({ zoom: { value: 1 }, scrollX: 0, scrollY: 0 });
    d.setTool('rectangle');
    drawRect(200, 200, 280, 260);
    const unlockedAfterDraw = {
      activeTool: d.activeTool,
      locked: d.activeToolLocked,
      rects: rectCount(),
    };

    d.setTool('rectangle');
    q();
    const afterLockKey = { activeTool: d.activeTool, locked: d.activeToolLocked };
    drawRect(320, 200, 400, 260);
    const lockedAfterFirstDraw = {
      activeTool: d.activeTool,
      locked: d.activeToolLocked,
      rects: rectCount(),
    };
    drawRect(440, 200, 520, 260);
    const lockedAfterSecondDraw = {
      activeTool: d.activeTool,
      locked: d.activeToolLocked,
      rects: rectCount(),
    };
    q();
    const afterUnlockKey = { activeTool: d.activeTool, locked: d.activeToolLocked };

    JSON.stringify({
      unlockedAfterDraw,
      afterLockKey,
      lockedAfterFirstDraw,
      lockedAfterSecondDraw,
      afterUnlockKey,
      ok:
        unlockedAfterDraw.activeTool === 'selection' &&
        unlockedAfterDraw.locked === false &&
        unlockedAfterDraw.rects === 1 &&
        afterLockKey.activeTool === 'rectangle' &&
        afterLockKey.locked === true &&
        lockedAfterFirstDraw.activeTool === 'rectangle' &&
        lockedAfterFirstDraw.locked === true &&
        lockedAfterFirstDraw.rects === 2 &&
        lockedAfterSecondDraw.activeTool === 'rectangle' &&
        lockedAfterSecondDraw.locked === true &&
        lockedAfterSecondDraw.rects === 3 &&
        afterUnlockKey.activeTool === 'selection' &&
        afterUnlockKey.locked === false,
    });
  `),
);

console.log('--- Bug #25 differential: Q tool lock gates post-create reset ---');
console.log(JSON.stringify(result));
console.log(result.ok ? 'PASS: unlocked draw resets; locked draw keeps tool; Q unlocks' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
