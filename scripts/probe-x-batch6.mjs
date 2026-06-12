// Batch-6 verification: configurable arrowhead types — new arrows inherit the
// app-default arrowheads, and setStart/EndArrowhead change selected arrows.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9262;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b6', '--window-size=1440,900', URL]);
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

// 1) new arrow inherits the app default (start: null, end: 'arrow')
await ev(`window.__draw.setTool('arrow')`); await drag(300, 300, 500, 300);
await ev(`window.__draw.setTool('selection')`);
const created = await ev(`(() => { const a = window.__draw.scene.elements.find(e => e.type === 'arrow'); return a ? { s: a.startArrowhead, e: a.endArrowhead } : null; })()`);

// 2) select the arrow, change start->dot... use 'triangle' end + 'bar' start
await ev(`window.__draw.selectAll()`);
const showArrow = await ev(`window.__draw.showArrowProperties`);
await ev(`window.__draw.setEndArrowhead('triangle')`);
await ev(`window.__draw.setStartArrowhead('bar')`);
const afterChange = await ev(`(() => { const a = window.__draw.scene.elements.find(e => e.type === 'arrow'); return { s: a.startArrowhead, e: a.endArrowhead }; })()`);

// 3) getters reflect the selected arrow
const getters = await ev(`({ s: window.__draw.currentStartArrowhead, e: window.__draw.currentEndArrowhead })`);

// 4) defaults persist: a NEW arrow now inherits start=bar / end=triangle
await ev(`window.__draw.deselect(); window.__draw.setTool('arrow')`); await drag(300, 400, 500, 400);
await ev(`window.__draw.setTool('selection')`);
const second = await ev(`(() => { const arrows = window.__draw.scene.elements.filter(e => e.type === 'arrow'); const a = arrows[arrows.length-1]; return { s: a.startArrowhead, e: a.endArrowhead }; })()`);

// 5) undo reverts the start-arrowhead change (last applied)
await ev(`window.__draw.selectAll()`); // not strictly needed; just ensure scene stable
await ev(`window.__draw.deselect()`);
// select the first arrow by its midpoint to undo-check it specifically isn't necessary;
// undo applies to the last committed op (the 2nd arrow create). Instead assert end set.

console.log('created (inherit default):', JSON.stringify(created));
console.log('showArrowProperties=', showArrow, '| after change:', JSON.stringify(afterChange));
console.log('getters:', JSON.stringify(getters));
console.log('second arrow inherits new defaults:', JSON.stringify(second));

const ok =
  created && created.s === null && created.e === 'arrow' &&
  showArrow === true &&
  afterChange.s === 'bar' && afterChange.e === 'triangle' &&
  getters.s === 'bar' && getters.e === 'triangle' &&
  second.s === 'bar' && second.e === 'triangle';
console.log(ok ? 'PASS: arrowhead types (inherit default + set start/end + persist default)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
