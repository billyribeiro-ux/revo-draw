// Batch-4 verification: clipboard parity — OS clipboard copy/paste (excalidraw
// envelope), paste-as-plaintext, copy/paste styles, copy-to-clipboard-as-PNG.
// Runtime evidence via headless Chrome with clipboard permissions granted.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9260;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b4', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t; } catch {} await sleep(250); } throw new Error('no cdp'); }
const target = await discover();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
// grant clipboard read/write so navigator.clipboard works headless
await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
const drag = async (x1, y1, x2, y2) => { await m2('mouseMoved', x1, y1, 0); await sleep(15); await m2('mousePressed', x1, y1, 1); await sleep(25); await m2('mouseMoved', x2, y2, 1); await sleep(25); await m2('mouseReleased', x2, y2, 0); await sleep(40); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0); // warm pointer

// --- OS clipboard copy: draw a rect, select, copy → clipboard holds the envelope
await ev(`window.__draw.setTool('rectangle')`); await drag(300, 250, 400, 330);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll();`);
await ev(`(async () => { await window.__draw.copySelected(); })()`);
const clipText = await ev(`(async () => await navigator.clipboard.readText())()`);
let envelopeOk = false, envCount = 0;
try { const j = JSON.parse(clipText); envelopeOk = j.type === 'excalidraw/clipboard' && Array.isArray(j.elements); envCount = j.elements.length; } catch {}

// --- paste: count grows by the pasted element count
const before = await ev(`window.__draw.scene.elements.length`);
await ev(`(async () => { await window.__draw.paste(700, 400); })()`);
const afterPaste = await ev(`window.__draw.scene.elements.length`);

// --- paste-as-plaintext: put plain text on the clipboard, paste → a text element appears
await ev(`(async () => { await navigator.clipboard.writeText('hello from clipboard'); })()`);
const textBefore = await ev(`window.__draw.scene.elements.filter(e => e.type === 'text').length`);
await ev(`(async () => { await window.__draw.pasteAsPlaintext(500, 500); })()`);
const pastedText = await ev(`(() => { const t = window.__draw.scene.elements.filter(e => e.type === 'text'); return t.length ? t[t.length-1].text : null; })()`);

// --- copy/paste styles: source rect red stroke, target rect default → paste-styles copies stroke
await ev(`window.__draw.clear(); window.__draw.deselect();`);
await ev(`window.__draw.setTool('rectangle')`); await drag(300, 250, 380, 320);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll();`);
await ev(`window.__draw.setStrokeColor('#e03131'); window.__draw.setStrokeWidth(4);`);
const srcId = await ev(`window.__draw.scene.elements[0].id`);
await ev(`window.__draw.copyStyles()`);
// second rect, default style
await ev(`window.__draw.deselect(); window.__draw.setTool('rectangle')`); await drag(500, 250, 580, 320);
await ev(`window.__draw.setTool('selection')`);
const tgtId = await ev(`window.__draw.scene.elements[1].id`);
await ev(`window.__draw.selectAll()`); // select both; paste-styles applies to selection
// re-select only the second by clicking its left edge
await ev(`window.__draw.deselect()`);
await m2('mouseMoved', 200, 200, 0); await sleep(20);
await m2('mouseMoved', 500, 290, 0); await sleep(15); await m2('mousePressed', 500, 290, 1); await sleep(25); await m2('mouseReleased', 500, 290, 0); await sleep(50);
const selectedTgt = await ev(`window.__draw.selectedId === ${JSON.stringify(tgtId)}`);
await ev(`window.__draw.pasteStyles()`);
const tgtStyle = await ev(`(() => { const e = window.__draw.scene.elements.find(x => x.id === ${JSON.stringify(tgtId)}); return e ? { sc: e.strokeColor, sw: e.strokeWidth } : null; })()`);

// --- copy-to-clipboard as PNG → image/png present on the clipboard
const pngCopied = await ev(`(async () => await window.__draw.copyToClipboardAsPng())()`);
const hasPng = await ev(`(async () => { try { const items = await navigator.clipboard.read(); return items.some(i => i.types.includes('image/png')); } catch { return 'ERR'; } })()`);

console.log('copy: envelopeOk=', envelopeOk, 'count=', envCount);
console.log('paste:', before, '->', afterPaste);
console.log('paste-as-plaintext: textBefore=', textBefore, 'pastedText=', JSON.stringify(pastedText));
console.log('paste-styles: selectedTarget=', selectedTgt, 'targetStyle=', JSON.stringify(tgtStyle), 'srcId!=tgtId:', srcId !== tgtId);
console.log('copy-as-png: returned=', pngCopied, 'clipboardHasPng=', hasPng);

const ok =
  envelopeOk && envCount === 1 &&
  afterPaste === before + 1 &&
  pastedText === 'hello from clipboard' &&
  selectedTgt === true && tgtStyle && tgtStyle.sc === '#e03131' && tgtStyle.sw === 4 &&
  pngCopied === true && hasPng === true;
console.log(ok ? 'PASS: clipboard parity (OS copy/paste + plaintext + styles + PNG)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
