// Batch-18 verification: Mermaid → diagram (built-in flowchart converter). Insert a
// graph → rectangles + arrows + labels; an unsupported diagram returns an error.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9274;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b18', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', buttons: b, clickCount: 1 });
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// 1) convert a flowchart with 4 nodes + edge labels (pass source as a JS array joined
// with newlines to avoid quoting/brace issues in the eval string)
const err = await ev(`(async () => {
  const src = ['graph TD','  A[Start] --> B{Is it working?}','  B -->|Yes| C[Ship it]','  B -->|No| D[Debug]','  D --> A'].join(String.fromCharCode(10));
  return await window.__draw.insertMermaid(src);
})()`);
await sleep(80);
const summary = await ev(`(() => {
  const els = window.__draw.scene.elements;
  const rects = els.filter(e => e.type === 'rectangle').length;
  const arrows = els.filter(e => e.type === 'arrow').length;
  const texts = els.filter(e => e.type === 'text').map(e => e.text);
  return { total: els.length, rects, arrows, texts };
})()`);
// node labels present
const hasStart = summary.texts.includes('Start');
const hasEdgeLabel = summary.texts.includes('Yes') || summary.texts.includes('No');
const selectedAll = await ev(`window.__draw.selectedIds.size`);

// 2) unsupported diagram → error string, nothing inserted
await ev(`window.__draw.clear()`);
const seqErr = await ev(`(async () => {
  const src = ['sequenceDiagram','  Alice->>John: Hi'].join(String.fromCharCode(10));
  return await window.__draw.insertMermaid(src);
})()`);
const afterErr = await ev(`window.__draw.scene.elements.length`);

console.log('flowchart: err=', JSON.stringify(err), '| summary=', JSON.stringify(summary));
console.log('labels: Start=', hasStart, 'edge=', hasEdgeLabel, '| selected=', selectedAll);
console.log('unsupported: err=', JSON.stringify(seqErr), '| inserted=', afterErr);

const ok =
  err === null &&
  summary.rects === 4 && summary.arrows === 4 && hasStart && hasEdgeLabel &&
  selectedAll === summary.total &&
  typeof seqErr === 'string' && seqErr.length > 0 && afterErr === 0;
console.log(ok ? 'PASS: mermaid → diagram (flowchart convert + error on unsupported)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
