// Tier-5 visual verification: footer zoom/undo controls match Excalidraw's
// split zoom-actions and undo-redo-buttons groups.
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9339;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-ui-footer-zoom',
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
const mouseClick = (x, y) =>
  send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  }).then(() =>
    send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    }),
  );

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
await ev(`window.__draw.clear(); window.__draw.setTool('selection'); window.__draw.deselect(); window.__draw.resetView();`);
await sleep(100);

const metrics = await ev(`(() => {
  const footer = document.querySelector('.footer');
  if (!footer) {
    return { hasFooter: false };
  }
  const zoom = footer.querySelector('.zoom-actions');
  const undoRedo = footer.querySelector('.undo-redo-buttons');
  const zoomButtons = Array.from(footer.querySelectorAll('.zoom-button'));
  const undoButtons = Array.from(footer.querySelectorAll('.undo-redo-buttons button'));
  const allButtons = Array.from(footer.querySelectorAll('button'));
  const icons = Array.from(footer.querySelectorAll('button svg'));
  const footerStyle = getComputedStyle(footer);
  const zoomStyle = zoom ? getComputedStyle(zoom) : null;
  const undoRedoStyle = undoRedo ? getComputedStyle(undoRedo) : null;
  const footerRect = footer.getBoundingClientRect();
  const buttonData = allButtons.map((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      className: button.className,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      disabled: button.disabled,
      text: button.textContent?.trim() ?? '',
    };
  });
  const iconRects = icons.map((icon) => {
    const rect = icon.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });

  return {
    hasFooter: true,
    footerLeft: Math.round(footerRect.left),
    footerBottomOffset: Math.round(window.innerHeight - footerRect.bottom),
    footerGap: footerStyle.gap,
    footerBackground: footerStyle.backgroundColor,
    footerShadow: footerStyle.boxShadow,
    hasSeparator: !!footer.querySelector('.footer-sep'),
    zoomGroupDisplay: zoomStyle?.display ?? '',
    zoomGroupBackground: zoomStyle?.backgroundColor ?? '',
    zoomGroupRadius: zoomStyle?.borderRadius ?? '',
    zoomGroupShadow: zoomStyle?.boxShadow ?? '',
    undoGroupDisplay: undoRedoStyle?.display ?? '',
    undoGroupBackground: undoRedoStyle?.backgroundColor ?? '',
    undoGroupRadius: undoRedoStyle?.borderRadius ?? '',
    undoGroupShadow: undoRedoStyle?.boxShadow ?? '',
    buttonCount: allButtons.length,
    zoomButtonCount: zoomButtons.length,
    undoButtonCount: undoButtons.length,
    iconCount: icons.length,
    allIcons16: iconRects.every((rect) => rect.width === 16 && rect.height === 16),
    buttonData,
    resetWidth: buttonData.find((button) => button.className.includes('reset-zoom-button'))?.width ?? 0,
    zoomEdgeWidths36: zoomButtons.every((button) => {
      const rect = button.getBoundingClientRect();
      return button.classList.contains('reset-zoom-button') || (Math.round(rect.width) === 36 && Math.round(rect.height) === 36);
    }),
    undoRedoButtons36: undoButtons.every((button) => {
      const rect = button.getBoundingClientRect();
      return Math.round(rect.width) === 36 && Math.round(rect.height) === 36;
    }),
    undoDisabled: footer.querySelector('.undo-button')?.disabled ?? false,
    redoDisabled: footer.querySelector('.redo-button')?.disabled ?? false,
  };
})()`);

const clickPoint = async (selector) => {
  const point = await ev(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  if (!point) {
    return false;
  }
  await mouseClick(point.x, point.y);
  await sleep(80);
  return true;
};

const zoom0 = await ev('window.__draw.zoom');
await clickPoint('.zoom-in-button');
const zoomIn = await ev('window.__draw.zoom');
await clickPoint('.reset-zoom-button');
const zoomReset = await ev('window.__draw.zoom');
await clickPoint('.zoom-out-button');
const zoomOut = await ev('window.__draw.zoom');
await clickPoint('.reset-zoom-button');

console.log('footer zoom:', JSON.stringify(metrics));
console.log('zoom clicks:', JSON.stringify({ zoom0, zoomIn, zoomReset, zoomOut }));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-footer-zoom.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-footer-zoom.png');

const buttonBackgroundsOk = metrics.buttonData.every(
  (button) => button.background === 'rgb(236, 236, 244)',
);
const ok =
  metrics.hasFooter === true &&
  metrics.footerLeft === 16 &&
  metrics.footerBottomOffset === 16 &&
  metrics.footerGap === '8px' &&
  metrics.footerBackground === 'rgba(0, 0, 0, 0)' &&
  metrics.footerShadow === 'none' &&
  metrics.hasSeparator === false &&
  metrics.zoomGroupDisplay === 'flex' &&
  metrics.undoGroupDisplay === 'flex' &&
  metrics.zoomGroupBackground === 'rgb(255, 255, 255)' &&
  metrics.undoGroupBackground === 'rgb(255, 255, 255)' &&
  metrics.zoomGroupRadius === '8px' &&
  metrics.undoGroupRadius === '8px' &&
  metrics.zoomGroupShadow !== 'none' &&
  metrics.undoGroupShadow !== 'none' &&
  metrics.buttonCount === 5 &&
  metrics.zoomButtonCount === 3 &&
  metrics.undoButtonCount === 2 &&
  metrics.iconCount === 4 &&
  metrics.allIcons16 === true &&
  metrics.resetWidth === 60 &&
  metrics.zoomEdgeWidths36 === true &&
  metrics.undoRedoButtons36 === true &&
  metrics.undoDisabled === true &&
  metrics.redoDisabled === true &&
  buttonBackgroundsOk === true &&
  zoomIn > zoom0 &&
  Math.abs(zoomReset - 1) < 0.0001 &&
  zoomOut < zoomReset;

console.log(
  ok
    ? 'PASS: footer zoom/undo controls match Excalidraw split group styling'
    : 'FAIL',
);
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
