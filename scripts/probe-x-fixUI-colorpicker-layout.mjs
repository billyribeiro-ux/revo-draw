// Tier-5 visual verification: ColorPicker popover uses Excalidraw-like
// top-picks row, large shade grid, and full-width hex input layout.
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9340;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-ui-colorpicker-layout',
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

await ev(`(() => {
  const draw = window.__draw;
  draw.clear();
  draw.setTool('rectangle');
  draw.pointerDown(320, 240, {});
  draw.pointerMove(460, 350, {});
  draw.pointerUp();
  draw.setTool('selection');
  draw.selectAll();
})()`);
await sleep(120);
await ev(`document.querySelector('button[aria-label="custom stroke color"]')?.click()`);
await sleep(150);

const metrics = await ev(`(() => {
  const picker = document.querySelector('.color-picker');
  if (!picker) {
    return { hasPicker: false };
  }

  const pickerStyle = getComputedStyle(picker);
  const topPicks = Array.from(picker.querySelectorAll('.top-picks .swatch.top-pick'));
  const shades = Array.from(picker.querySelectorAll('.shade-ramp .swatch.shade'));
  const firstTopPick = topPicks[0]?.getBoundingClientRect();
  const firstShade = shades[0]?.getBoundingClientRect();
  const shadeRamp = picker.querySelector('.shade-ramp');
  const shadeRampStyle = shadeRamp ? getComputedStyle(shadeRamp) : null;
  const hexRow = picker.querySelector('.hex-row');
  const hexRowStyle = hexRow ? getComputedStyle(hexRow) : null;
  const hexInput = picker.querySelector('.hex-input');
  const activeOutline = picker.querySelector('.swatch.active .swatch-outline');
  const pickerRect = picker.getBoundingClientRect();
  const hexRect = hexRow?.getBoundingClientRect();

  return {
    hasPicker: true,
    role: picker.getAttribute('role'),
    pickerWidth: Math.round(pickerRect.width),
    pickerBackground: pickerStyle.backgroundColor,
    pickerBorderWidth: pickerStyle.borderTopWidth,
    pickerRadius: pickerStyle.borderRadius,
    pickerShadow: pickerStyle.boxShadow,
    oldSwatchesClassPresent: !!picker.querySelector('.swatches'),
    topPickCount: topPicks.length,
    topPickDisplay: getComputedStyle(picker.querySelector('.top-picks')).display,
    topPickWidth: firstTopPick ? Math.round(firstTopPick.width) : 0,
    topPickHeight: firstTopPick ? Math.round(firstTopPick.height) : 0,
    shadeCount: shades.length,
    shadeRampDisplay: shadeRampStyle?.display ?? '',
    shadeRampColumns: shadeRampStyle?.gridTemplateColumns ?? '',
    shadeRampGap: shadeRampStyle?.gap ?? '',
    shadeWidth: firstShade ? Math.round(firstShade.width) : 0,
    shadeHeight: firstShade ? Math.round(firstShade.height) : 0,
    hexDisplay: hexRowStyle?.display ?? '',
    hexWidth: hexRect ? Math.round(hexRect.width) : 0,
    hexInputHeight: hexInput ? Math.round(hexInput.getBoundingClientRect().height) : 0,
    hashText: picker.querySelector('.hash')?.textContent ?? '',
    activeOutlineDisplay: activeOutline ? getComputedStyle(activeOutline).display : '',
  };
})()`);

console.log('color picker layout:', JSON.stringify(metrics));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-colorpicker-layout.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-colorpicker-layout.png');

const ok =
  metrics.hasPicker === true &&
  metrics.role === 'dialog' &&
  metrics.pickerWidth >= 180 &&
  metrics.pickerBackground === 'rgb(255, 255, 255)' &&
  metrics.pickerBorderWidth === '0px' &&
  metrics.pickerRadius === '4px' &&
  metrics.pickerShadow !== 'none' &&
  metrics.oldSwatchesClassPresent === false &&
  metrics.topPickCount === 5 &&
  metrics.topPickDisplay === 'flex' &&
  metrics.topPickWidth === 22 &&
  metrics.topPickHeight === 22 &&
  metrics.shadeCount >= 50 &&
  metrics.shadeRampDisplay === 'grid' &&
  metrics.shadeRampColumns.split(' ').length === 5 &&
  metrics.shadeRampGap === '4px' &&
  metrics.shadeWidth === 30 &&
  metrics.shadeHeight === 30 &&
  metrics.hexDisplay === 'grid' &&
  metrics.hexWidth >= 166 &&
  metrics.hexInputHeight === 32 &&
  metrics.hashText === '#' &&
  metrics.activeOutlineDisplay === 'block';

console.log(
  ok
    ? 'PASS: color picker matches top-picks, shade grid, and hex input layout'
    : 'FAIL',
);
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
