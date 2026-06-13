// Tier-5 visual verification: selected shape properties render as one continuous
// island. The style controls must not draw their own nested card/shadow.
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { launchChrome } from './cdp-probe-utils.mjs';

const URL = 'http://localhost:1420/x';

const { port: PORT, cleanup } = await launchChrome({ url: URL, prefix: 'lf-ui-single-props' });

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

await ev(`(() => {
  const draw = window.__draw;
  draw.appState.setState({ scrollX: 0, scrollY: 0, zoom: { value: 1 } });
  draw.clear();
  draw.setFillStyle('solid');
  draw.setBackgroundColor('#a5d8ff');
  draw.setTool('rectangle');
  draw.pointerDown(320, 260, {});
  draw.pointerMove(460, 360, {});
  draw.pointerUp();
  draw.selectAll();
})()`);
await sleep(80);

const result = await ev(`(() => {
  const panel = document.querySelector('.properties');
  const styleControls = document.querySelector('.style-controls');
  if (!panel || !styleControls) {
    return { hasPanel: !!panel, hasStyleControls: !!styleControls };
  }

  const panelStyle = getComputedStyle(panel);
  const styleStyle = getComputedStyle(styleControls);
  const panelRect = panel.getBoundingClientRect();
  const styleRect = styleControls.getBoundingClientRect();

  return {
    hasPanel: true,
    hasStyleControls: true,
    panelDisplay: panelStyle.display,
    panelShadow: panelStyle.boxShadow,
    panelWidth: Math.round(panelRect.width),
    styleBackground: styleStyle.backgroundColor,
    styleBorderWidth: styleStyle.borderTopWidth,
    styleShadow: styleStyle.boxShadow,
    contained:
      styleRect.left >= panelRect.left &&
      styleRect.right <= panelRect.right &&
      styleRect.top >= panelRect.top &&
      styleRect.bottom <= panelRect.bottom,
  };
})()`);

console.log('single properties panel:', JSON.stringify(result));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-single-properties-panel.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot -> /tmp/x-single-properties-panel.png');

const ok =
  result.hasPanel === true &&
  result.hasStyleControls === true &&
  result.panelDisplay !== 'none' &&
  result.panelShadow !== 'none' &&
  result.panelWidth >= 180 &&
  result.styleBackground === 'rgba(0, 0, 0, 0)' &&
  result.styleBorderWidth === '0px' &&
  result.styleShadow === 'none' &&
  result.contained === true;

console.log(
  ok
    ? 'PASS: properties render as one continuous island without nested style-card'
    : 'FAIL',
);
ws.close();
cleanup();
process.exit(ok ? 0 : 1);
