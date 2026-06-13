// Tier-5 visual verification: top toolbar uses Excalidraw island/button
// dimensions and theme tokens instead of widened hard-coded buttons.
import { writeFileSync } from 'node:fs';
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
  '--user-data-dir=/tmp/lf-ui-toolbar-island',
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
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) {
    return { hasToolbar: false };
  }

  const buttons = Array.from(toolbar.querySelectorAll('button'));
  const icons = Array.from(toolbar.querySelectorAll('button svg'));
  const toolbarStyle = getComputedStyle(toolbar);
  const buttonRects = buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      paddingLeft: style.paddingLeft,
      borderRadius: style.borderRadius,
      text: button.textContent?.trim() ?? '',
    };
  });
  const iconRects = icons.map((icon) => {
    const rect = icon.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  const active = toolbar.querySelector('button.active');
  const activeStyle = active ? getComputedStyle(active) : null;
  const menuButton = buttons[0];
  const themeButton = buttons[buttons.length - 1];

  return {
    hasToolbar: true,
    buttonCount: buttons.length,
    iconCount: icons.length,
    toolbarTop: Math.round(toolbar.getBoundingClientRect().top),
    toolbarPaddingLeft: toolbarStyle.paddingLeft,
    toolbarGap: toolbarStyle.gap,
    toolbarBackground: toolbarStyle.backgroundColor,
    toolbarShadow: toolbarStyle.boxShadow,
    toolbarBorderWidth: toolbarStyle.borderTopWidth,
    toolbarRadius: toolbarStyle.borderRadius,
    allButtonsSquare36: buttonRects.every((rect) => rect.width === 36 && rect.height === 36),
    allButtonsPaddingZero: buttonRects.every((rect) => rect.paddingLeft === '0px'),
    allButtonsRadius8: buttonRects.every((rect) => rect.borderRadius === '8px'),
    allIcons16: iconRects.every((rect) => rect.width === 16 && rect.height === 16),
    activeBackground: activeStyle?.backgroundColor ?? '',
    activeBorderWidth: activeStyle?.borderTopWidth ?? '',
    activeColor: activeStyle?.color ?? '',
    menuHasNoTextGlyph: (menuButton?.textContent?.trim() ?? '') === '',
    themeHasNoTextGlyph: (themeButton?.textContent?.trim() ?? '') === '',
  };
})()`);

console.log('toolbar island:', JSON.stringify(result));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-toolbar-island.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-toolbar-island.png');

const ok =
  result.hasToolbar === true &&
  result.buttonCount >= 16 &&
  result.iconCount === result.buttonCount &&
  result.toolbarTop === 16 &&
  result.toolbarPaddingLeft === '4px' &&
  result.toolbarGap === '2px' &&
  result.toolbarBackground === 'rgb(255, 255, 255)' &&
  result.toolbarShadow !== 'none' &&
  result.toolbarBorderWidth === '0px' &&
  result.toolbarRadius === '8px' &&
  result.allButtonsSquare36 === true &&
  result.allButtonsPaddingZero === true &&
  result.allButtonsRadius8 === true &&
  result.allIcons16 === true &&
  result.activeBackground === 'rgb(224, 223, 255)' &&
  result.activeBorderWidth === '1px' &&
  result.menuHasNoTextGlyph === true &&
  result.themeHasNoTextGlyph === true;

console.log(
  ok
    ? 'PASS: toolbar matches Excalidraw island/button spacing and sizing tokens'
    : 'FAIL',
);
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
