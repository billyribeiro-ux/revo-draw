// Batch-2b verification: group / ungroup + deep-select (clicking a grouped element
// selects the whole group). Runtime evidence via headless Chrome + synthesized pointer.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9258;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b2b', '--window-size=1440,900', URL]);
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
const click = async (x, y) => { await m2('mouseMoved', x, y, 0); await sleep(15); await m2('mousePressed', x, y, 1); await sleep(25); await m2('mouseReleased', x, y, 0); await sleep(50); };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0); // warm pointer

// two rects, select both, group
await ev(`window.__draw.setTool('rectangle')`); await drag(300, 250, 380, 330);
await ev(`window.__draw.setTool('rectangle')`); await drag(500, 250, 580, 330);
await ev(`window.__draw.setTool('selection')`);
await ev(`window.__draw.selectAll()`);
const selBeforeGroup = await ev(`window.__draw.selectedIds.size`);
await ev(`window.__draw.groupSelected()`);
// both elements now share exactly one group id
const groupIds = await ev(`window.__draw.scene.elements.map(e => e.groupIds)`);
const sharedGroup = await ev(`(() => {
  const els = window.__draw.scene.elements;
  const a = els[0].groupIds, b = els[1].groupIds;
  return a.length === 1 && b.length === 1 && a[0] === b[0];
})()`);

// deep-select: click ONE rect → both selected (whole group)
await ev(`window.__draw.deselect()`);
await click(300, 290); // on the left outline of the first rect (transparent fill → only stroke hits)
const selAfterDeepClick = await ev(`window.__draw.selectedIds.size`);

// ungroup: select all, ungroup → groupIds emptied
await ev(`window.__draw.selectAll(); window.__draw.ungroupSelected()`);
const groupsAfterUngroup = await ev(`window.__draw.scene.elements.every(e => e.groupIds.length === 0)`);
// after ungroup, clicking one rect selects only that one
await ev(`window.__draw.deselect()`);
await m2('mouseMoved', 200, 200, 0); await sleep(30); // warm pointer
await click(300, 290);
const selAfterUngroupClick = await ev(`window.__draw.selectedIds.size`);

console.log('selBeforeGroup=', selBeforeGroup, '| groupIds=', JSON.stringify(groupIds), 'shared=', sharedGroup);
console.log('deep-select (click one of grouped) selected=', selAfterDeepClick);
console.log('after ungroup: groupsEmpty=', groupsAfterUngroup, '| click selects=', selAfterUngroupClick);

const ok = selBeforeGroup === 2 && sharedGroup === true && selAfterDeepClick === 2
  && groupsAfterUngroup === true && selAfterUngroupClick === 1;
console.log(ok ? 'PASS: group + deep-select + ungroup' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
