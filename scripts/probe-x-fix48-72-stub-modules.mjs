// Fix-48-72 verification: the former excalidraw module stubs now expose
// concrete runtime/type-compatible behavior for the local web editor.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9335;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix48-72-stubs',
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

const result = await ev(`(async () => {
  const clients = await import('/src/lib/excalidraw/clients.ts');
  const i18n = await import('/src/lib/excalidraw/i18n.ts');
  const libraryModule = await import('/src/lib/excalidraw/data/library.ts');
  const clipboard = await import('/src/lib/excalidraw/clipboard.ts');

  const colorA = clients.getClientColor('socket-a', undefined);
  const colorB = clients.getClientColor('socket-b', undefined);
  const initial = clients.getNameInitial(' layout');

  await i18n.setLanguage({ code: 'ar-test', label: 'Arabic test', rtl: true });
  const rtl = i18n.getLanguage().rtl === true && document.documentElement.dir === 'rtl';
  const translated = i18n.t('alerts.confirmAddLibrary', { numShapes: 3 }, 'Add {{numShapes}} shapes');
  await i18n.setLanguage(i18n.defaultLang);

  const draw = window.__draw;
  draw.clear();
  draw.setTool('rectangle');
  draw.pointerDown(300, 300, {});
  draw.pointerMove(380, 360, {});
  draw.pointerUp();
  const element = draw.scene.elements[0];
  const item = {
    id: 'lib-a',
    status: 'unpublished',
    elements: [element],
    created: 1,
    name: 'A',
  };
  const duplicate = {
    id: 'lib-b',
    status: 'unpublished',
    elements: [element],
    created: 2,
    name: 'B',
  };
  const merged = libraryModule.mergeLibraryItems([item], [duplicate]);
  const distributed = libraryModule.distributeLibraryItemsOnSquareGrid([item]);
  let notified = 0;
  const library = new libraryModule.default({
    props: { onLibraryChange: (items) => { notified = items.length; } },
  });
  const updated = await library.updateLibrary({ libraryItems: [item] });
  const latest = await library.getLatestLibrary();
  const notifiedAfterUpdate = notified;
  const hash = libraryModule.getLibraryItemsHash(latest);
  await library.resetLibrary();
  const reset = await library.getLatestLibrary();

  const serialized = clipboard.serializeAsClipboardJSON({ elements: [element], files: null });
  const parsed = await clipboard.parseClipboard(serialized);

  return {
    colorA,
    colorB,
    initial,
    rtl,
    translated,
    mergedLength: merged.length,
    distributedLength: distributed.length,
    distributedMoved: distributed[0].x === 0 && distributed[0].y === 0,
    updatedLength: updated.length,
    latestLength: latest.length,
    notifiedAfterUpdate,
    hashType: typeof hash,
    resetLength: reset.length,
    parsedElements: parsed.elements?.length ?? 0,
    parsedText: parsed.text ?? null,
  };
})()`);

console.log('stub module result:', JSON.stringify(result));
const ok =
  typeof result.colorA === 'string' &&
  result.colorA.startsWith('hsl(') &&
  result.colorA !== result.colorB &&
  result.initial === 'L' &&
  result.rtl === true &&
  result.translated === 'Add 3 shapes' &&
  result.mergedLength === 1 &&
  result.distributedLength === 1 &&
  result.distributedMoved === true &&
  result.updatedLength === 1 &&
  result.latestLength === 1 &&
  result.notifiedAfterUpdate === 1 &&
  result.hashType === 'number' &&
  result.resetLength === 0 &&
  result.parsedElements === 1 &&
  result.parsedText === null;

console.log(
  ok
    ? 'PASS: former stub modules expose concrete local editor behavior'
    : 'FAIL',
);
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
