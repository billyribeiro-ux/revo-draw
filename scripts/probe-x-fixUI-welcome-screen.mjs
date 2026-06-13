// Tier-5 visual verification: empty-canvas welcome screen uses the richer
// Excalidraw-style center/menu/hint treatment instead of the sparse legacy
// title + emoji links.
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9337;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-ui-welcome-screen',
  '--window-size=1440,1000',
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
await ev(`window.__draw.clear(); window.__draw.setTool('selection'); localStorage.clear(); location.reload()`);
await sleep(1500);
for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}
await ev(`window.__draw.clear(); window.__draw.setTool('selection'); window.__draw.deselect();`);
await sleep(100);

const result = await ev(`(() => {
  const welcome = document.querySelector('.welcome');
  if (!welcome) {
    return { hasWelcome: false };
  }

  const text = welcome.textContent ?? '';
  const legacyGlyphs = [
    String.fromCodePoint(0x270f),
    String.fromCodePoint(0x1f4c2),
    String.fromCodePoint(0x2196),
    String.fromCodePoint(0x2191),
  ].some((glyph) => text.includes(glyph));
  const logo = welcome.querySelector('.logo-wordmark');
  const heading = welcome.querySelector('.heading');
  const localNote = welcome.querySelector('.local-note');
  const menuItems = Array.from(welcome.querySelectorAll('.welcome-item'));
  const firstItem = menuItems[0];
  const firstStyle = firstItem ? getComputedStyle(firstItem) : null;
  const firstRect = firstItem?.getBoundingClientRect();
  const logoRect = welcome.querySelector('.logo')?.getBoundingClientRect();
  const toolbarRect = document.querySelector('.toolbar')?.getBoundingClientRect();

  return {
    hasWelcome: true,
    showWelcome: window.__draw.showWelcome,
    brand: logo?.textContent?.trim() ?? '',
    heading: heading?.textContent?.trim() ?? '',
    localNote: localNote?.textContent?.trim() ?? '',
    hints: welcome.querySelectorAll('.hint').length,
    hintSvgs: welcome.querySelectorAll('.hint svg').length,
    menuItems: menuItems.length,
    menuGridColumns: firstStyle?.gridTemplateColumns ?? '',
    firstItemWidth: firstRect ? Math.round(firstRect.width) : 0,
    visibleContentBelowToolbar: toolbarRect && logoRect ? logoRect.top > toolbarRect.bottom : false,
    legacyGlyphs,
  };
})()`);

console.log('welcome screen:', JSON.stringify(result));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-welcome-screen.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-welcome-screen.png');

const ok =
  result.hasWelcome === true &&
  result.showWelcome === true &&
  result.brand === 'revo-draw' &&
  result.heading === 'Diagrams. Made. Simple.' &&
  result.localNote.includes('All your data is saved locally') &&
  result.hints === 3 &&
  result.hintSvgs === 3 &&
  result.menuItems === 2 &&
  result.firstItemWidth >= 300 &&
  result.menuGridColumns.includes('24px') &&
  result.visibleContentBelowToolbar === true &&
  result.legacyGlyphs === false;

console.log(
  ok
    ? 'PASS: welcome screen has rich center/menu/hints and no legacy emoji arrows'
    : 'FAIL',
);
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
