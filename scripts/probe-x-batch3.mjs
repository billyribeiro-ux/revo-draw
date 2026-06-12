// Batch-3 verification: text styling — font family / font size / text align,
// applied to a selected text element and persisted on the element. Runtime
// evidence via headless Chrome + synthesized pointer.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9259;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b3', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const click = async (x, y) => { await m2('mouseMoved', x, y, 0); await sleep(15); await m2('mousePressed', x, y, 1); await sleep(25); await m2('mouseReleased', x, y, 0); await sleep(50); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0); // warm pointer

// place a text element via the text tool, type some text, commit.
// Drive pointerDown directly with canvas-local coords (the click→canvas mapping is
// already covered by other probes; this probe isolates text *styling*).
await ev(`window.__draw.setTool('text')`);
await ev(`window.__draw.pointerDown(400, 300, { shiftKey:false, altKey:false, ctrlKey:false, metaKey:false })`);
await ev(`window.__draw.setEditingText('Hello'); window.__draw.commitText();`);
await ev(`window.__draw.setTool('selection')`);

// new text inherits app defaults: Excalifont(5) / 20 / left
const created = await ev(`(() => {
  const t = window.__draw.scene.elements.find(e => e.type === 'text');
  return t ? { ff: t.fontFamily, fs: t.fontSize, ta: t.textAlign, text: t.text } : null;
})()`);

// select the text element by id, then change family / size / align
const textId = await ev(`window.__draw.scene.elements.find(e => e.type === 'text').id`);
await ev(`window.__draw.selectAll()`); // text is the only element
const selHasText = await ev(`window.__draw.showTextProperties`);

await ev(`window.__draw.setFontFamily(8)`);   // Code / Comic Shanns
await ev(`window.__draw.setFontSize(36)`);    // Extra large
await ev(`window.__draw.setTextAlign('center')`);

const after = await ev(`(() => {
  const t = window.__draw.scene.elements.find(e => e.type === 'text');
  return { ff: t.fontFamily, fs: t.fontSize, ta: t.textAlign, lh: t.lineHeight };
})()`);

// the getters reflect the selected element's values
const getters = await ev(`({
  ff: window.__draw.currentFontFamily,
  fs: window.__draw.currentFontSize,
  ta: window.__draw.currentTextAlign,
})`);

// undo reverts the last change (align='center' → previous 'left')
await ev(`window.__draw.undo()`);
const taAfterUndo = await ev(`window.__draw.scene.elements.find(e => e.type === 'text').textAlign`);

console.log('created:', JSON.stringify(created));
console.log('selHasText=', selHasText, '| after change:', JSON.stringify(after));
console.log('getters:', JSON.stringify(getters), '| textId set:', !!textId);
console.log('align after undo:', taAfterUndo);

const ok =
  created && created.ff === 5 && created.fs === 20 && created.ta === 'left' && created.text === 'Hello' &&
  selHasText === true &&
  after.ff === 8 && after.fs === 36 && after.ta === 'center' && after.lh > 0 &&
  getters.ff === 8 && getters.fs === 36 && getters.ta === 'center' &&
  taAfterUndo === 'left'; // undo reverts the last align change back to 'left'
console.log(ok ? 'PASS: text styling (family/size/align + getters + undo)' : `FAIL (undo align -> ${taAfterUndo})`);
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
