// Fix-27/28 verification — pasted text follows upstream App.addTextFromPaste:
// regular paste splits on "\n", plain paste keeps one text blob, and both
// paths center/wrap around the cursor (components/App.tsx:4158-4193).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9332;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix27-28',
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
      const pasteX = 600;
      const pasteY = 250;
      const sample = 'Alpha\\nBeta\\n\\nGamma';
      const within = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
      const center = (el) => ({
        x: el.x + el.width / 2,
        y: el.y + el.height / 2,
      });
      const textElements = () =>
        d.scene.elements
          .filter((el) => el.type === 'text')
          .slice()
          .sort((a, b) => a.y - b.y);
      const setClipboard = (value) => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { readText: async () => value },
        });
      };
      const reset = () => {
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
      };

      reset();
      setClipboard(sample);
      await d.paste(pasteX, pasteY);
      const regular = textElements();
      const regularCenters = regular.map(center);
      const regularLineHeightPx =
        regular[0] ? regular[0].fontSize * regular[0].lineHeight : 0;
      const expectedCentersY = regular.length === 3
        ? [
            pasteY,
            pasteY + regular[0].height + 10,
            pasteY +
              regular[0].height +
              10 +
              regular[1].height +
              10 +
              regularLineHeightPx +
              10,
          ]
        : [];
      const regularSelectedCount = regular.filter((el) =>
        d.selectedIds.has(el.id),
      ).length;
      const regularOk =
        regular.length === 3 &&
        regular.map((el) => el.originalText).join('|') === 'Alpha|Beta|Gamma' &&
        regularSelectedCount === regular.length &&
        regularCenters.every((point) => within(point.x, pasteX)) &&
        regularCenters.every((point, index) =>
          within(point.y, expectedCentersY[index]),
        );

      reset();
      setClipboard(sample);
      await d.pasteAsPlaintext(pasteX, pasteY);
      const plain = textElements();
      const plainCenter = plain[0] ? center(plain[0]) : null;
      const plainOk =
        plain.length === 1 &&
        plain[0].originalText === sample &&
        plain[0].text === sample &&
        d.selectedIds.has(plain[0].id) &&
        plainCenter !== null &&
        within(plainCenter.x, pasteX) &&
        within(plainCenter.y, pasteY);

      reset();
      const longText = Array.from({ length: 90 }, () => 'wrap').join(' ');
      setClipboard(longText);
      await d.pasteAsPlaintext(pasteX, pasteY);
      const wrapped = textElements();
      const wrappedEl = wrapped[0];
      const wrappedCenter = wrappedEl ? center(wrappedEl) : null;
      const visibleSceneWidth =
        d.appState.current.width / d.appState.current.zoom.value;
      const maxTextWidth = Math.max(
        Math.min(visibleSceneWidth * 0.5, 800),
        200,
      );
      const wrapOk =
        wrapped.length === 1 &&
        wrappedEl.autoResize === false &&
        wrappedEl.originalText === longText &&
        wrappedEl.text.includes('\\n') &&
        wrappedEl.width <= maxTextWidth + 1 &&
        wrappedCenter !== null &&
        within(wrappedCenter.x, pasteX) &&
        within(wrappedCenter.y, pasteY);

      return JSON.stringify({
        regular: {
          count: regular.length,
          originalText: regular.map((el) => el.originalText),
          centers: regularCenters.map((point) => ({
            x: Math.round(point.x),
            y: Math.round(point.y),
          })),
          expectedCentersY: expectedCentersY.map(Math.round),
          selectedCount: regularSelectedCount,
          ok: regularOk,
        },
        plain: {
          count: plain.length,
          originalText: plain[0]?.originalText ?? null,
          text: plain[0]?.text ?? null,
          center: plainCenter
            ? { x: Math.round(plainCenter.x), y: Math.round(plainCenter.y) }
            : null,
          ok: plainOk,
        },
        wrap: {
          count: wrapped.length,
          autoResize: wrappedEl?.autoResize ?? null,
          width: wrappedEl ? Math.round(wrappedEl.width) : null,
          maxTextWidth: Math.round(maxTextWidth),
          lineCount: wrappedEl ? wrappedEl.text.split('\\n').length : 0,
          center: wrappedCenter
            ? { x: Math.round(wrappedCenter.x), y: Math.round(wrappedCenter.y) }
            : null,
          ok: wrapOk,
        },
        ok: regularOk && plainOk && wrapOk,
      });
    })()
  `),
);

console.log('--- Bug #27/#28 differential: text paste split/plain/center/wrap ---');
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? 'PASS: text paste matches upstream rule' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
