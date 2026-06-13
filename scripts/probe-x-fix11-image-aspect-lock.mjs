// Fix-11 verification — Bug #11: image resize aspect-lock is inverted.
// Upstream App.tsx:12661-12663 passes:
//   selectedElements.some(isImageElement) ? !shouldMaintainAspectRatio(event)
//                                        :  shouldMaintainAspectRatio(event)
// so images keep ratio by default and Shift frees/distorts them. Non-images keep
// the usual Shift-to-lock rule. This probe drives the real controller resize
// handle path and asserts that image behavior matches the upstream branch.
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
  '--user-data-dir=/tmp/lf-fix11-image-aspect',
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
await ev(`if (window.__draw.gridMode) window.__draw.toggleGrid();`);

const geom = () =>
  ev(`(() => {
    const e = window.__draw.scene.elements.find((element) => element.type === 'image');
    return e ? { w: e.width, h: e.height, ratio: e.width / e.height } : null;
  })()`);

const placeImage = async () => {
  await ev(`(async () => {
    window.__draw.clear();
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 150;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e03131';
    ctx.fillRect(0, 0, 300, 150);
    ctx.fillStyle = '#1971c2';
    ctx.fillRect(0, 0, 150, 75);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'ratio-2x1.png', { type: 'image/png' });
    await window.__draw.placeImage(file, 460, 320);
    window.__draw.setTool('selection');
  })()`);
  await sleep(150);
};

const seHandleClient = async () =>
  ev(`(async () => {
    const { getTransformHandles } = await import('/src/lib/element/transformHandles.ts');
    const c = window.__draw;
    const e = c.scene.elements.find((element) => element.type === 'image');
    const handles = getTransformHandles(
      e,
      c.appState.current.zoom,
      c.scene.scene.getNonDeletedElementsMap(),
      'mouse'
    );
    const handle = handles.se;
    if (!handle) {
      return null;
    }
    const a = c.appState.current;
    const sceneX = handle[0] + handle[2] / 2;
    const sceneY = handle[1] + handle[3] / 2;
    return {
      x: Math.round((sceneX + a.scrollX) * a.zoom.value + a.offsetLeft),
      y: Math.round((sceneY + a.scrollY) * a.zoom.value + a.offsetTop)
    };
  })()`);

const resizeImage = async ({ shift }) => {
  await placeImage();
  const before = await geom();
  const handle = await seHandleClient();
  if (!before || !handle) {
    throw new Error('image or SE handle was not available');
  }
  const mods = shift ? '{ shiftKey: true }' : '{}';
  const dx = 120;
  const dy = 20;
  await ev(`window.__draw.pointerDown(${handle.x}, ${handle.y}, ${mods})`);
  await ev(`window.__draw.pointerMove(${handle.x + dx}, ${handle.y + dy}, ${mods})`);
  await ev(`window.__draw.pointerUp()`);
  await sleep(80);
  const after = await geom();
  return { before, after, handle, dx, dy };
};

const noShift = await resizeImage({ shift: false });
const shift = await resizeImage({ shift: true });

const ratioDelta = (sample) => Math.abs(sample.after.ratio - sample.before.ratio);
const noShiftLocked = ratioDelta(noShift) < 0.04 && noShift.after.w > noShift.before.w + 60;
const shiftFreed =
  ratioDelta(shift) > 0.15 &&
  shift.after.w > shift.before.w + 60 &&
  Math.abs(shift.after.h - shift.before.h) < 60;
const matchesUpstream = noShiftLocked && shiftFreed;
const matchesOldBug = !noShiftLocked && !shiftFreed;

console.log('--- Bug #11 differential: image resize aspect-lock inversion ---');
console.log(JSON.stringify(
  {
    upstreamRule: { noShiftShouldMaintainAspect: true, shiftShouldMaintainAspect: false },
    noShift: {
      before: noShift.before,
      after: noShift.after,
      ratioDelta: Number(ratioDelta(noShift).toFixed(4)),
      locked: noShiftLocked
    },
    shift: {
      before: shift.before,
      after: shift.after,
      ratioDelta: Number(ratioDelta(shift).toFixed(4)),
      freed: shiftFreed
    },
    matchesUpstream,
    matchesOldBug
  },
  null,
  2
));
console.log(matchesUpstream ? 'PASS: image resize keeps aspect by default and Shift frees it' : 'FAIL');

ws.close();
chrome.kill();
process.exit(matchesUpstream ? 0 : 1);
