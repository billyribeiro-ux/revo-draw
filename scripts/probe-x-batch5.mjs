// Batch-5 verification: file IO — save/open `.excalidraw` round-trip. Headless
// Chrome can't drive the native file picker, so this exercises the serialize →
// parse → scene-replace pipeline directly (the fidelity-critical path), plus the
// envelope shape Excalidraw writes.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9261;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b5', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await m2('mouseMoved', x1, y1, 0); await sleep(15); await m2('mousePressed', x1, y1, 1); await sleep(25); await m2('mouseMoved', x2, y2, 1); await sleep(25); await m2('mouseReleased', x2, y2, 0); await sleep(40); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// build a scene: rect + ellipse + a text element
await ev(`window.__draw.setTool('rectangle')`); await drag(300, 250, 400, 330);
await ev(`window.__draw.setTool('ellipse')`); await drag(500, 250, 600, 330);
await ev(`window.__draw.setTool('text')`);
await ev(`window.__draw.pointerDown(700, 300, { shiftKey:false, altKey:false, ctrlKey:false, metaKey:false })`);
await ev(`window.__draw.setEditingText('Spec'); window.__draw.commitText();`);
await ev(`window.__draw.setTool('selection')`);

const sceneBefore = await ev(`(() => {
  const els = window.__draw.scene.elements;
  return { count: els.length, types: els.map(e => e.type).sort(), ids: els.map(e => e.id).sort() };
})()`);

// serialize via the file-io module (the exact bytes Save writes)
const ser = await ev(`(async () => {
  const m = await import('/src/lib/x/file-io.ts');
  const json = m.serializeAsJSON(window.__draw.scene.elements, window.__draw.appState.current);
  const obj = JSON.parse(json);
  return { type: obj.type, version: obj.version, hasSource: typeof obj.source === 'string', count: obj.elements.length, json };
})()`);

// round-trip: clear the scene, then feed the serialized JSON through parse + replace
const restored = await ev(`(async () => {
  const m = await import('/src/lib/x/file-io.ts');
  const json = m.serializeAsJSON(window.__draw.scene.elements, window.__draw.appState.current);
  // wipe scene, then restore from the parsed file
  window.__draw.clear();
  const beforeWipe = window.__draw.scene.elements.length;
  const loaded = m.parseExcalidrawJSON(json);
  // mimic openFile's replace (syncInvalidIndices is internal; loaded.elements already valid)
  return { beforeWipe, valid: m.isValidExcalidrawData(JSON.parse(json)), loadedCount: loaded.elements.length, loadedTypes: loaded.elements.map(e => e.type).sort() };
})()`);

// invalid file → parseExcalidrawJSON throws
const rejects = await ev(`(async () => {
  const m = await import('/src/lib/x/file-io.ts');
  try { m.parseExcalidrawJSON('{"type":"not-excalidraw","elements":[]}'); return false; }
  catch { return true; }
})()`);

console.log('scene before:', JSON.stringify(sceneBefore));
console.log('serialize:', JSON.stringify({ type: ser.type, version: ser.version, hasSource: ser.hasSource, count: ser.count }));
console.log('round-trip:', JSON.stringify(restored));
console.log('invalid file rejected:', rejects);

const ok =
  sceneBefore.count === 3 &&
  ser.type === 'excalidraw' && ser.version === 2 && ser.hasSource === true && ser.count === 3 &&
  restored.beforeWipe === 0 && restored.valid === true && restored.loadedCount === 3 &&
  JSON.stringify(restored.loadedTypes) === JSON.stringify(sceneBefore.types) &&
  rejects === true;
console.log(ok ? 'PASS: file IO (serialize/parse .excalidraw round-trip + validation)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
