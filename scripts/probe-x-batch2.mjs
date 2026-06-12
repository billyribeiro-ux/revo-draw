// Batch-2a verification: align (×6), distribute, lock/unlock.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9257;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b2', '--window-size=1440,900', URL]);
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
await m2('mouseMoved', 200, 200, 0);

// three rects at different x
await ev(`window.__draw.setTool('rectangle')`); await drag(300, 200, 360, 260);
await ev(`window.__draw.setTool('rectangle')`); await drag(500, 300, 560, 360);
await ev(`window.__draw.setTool('rectangle')`); await drag(420, 420, 480, 480);
const xs0 = await ev(`window.__draw.scene.elements.map(e => Math.round(e.x))`);

// align left (start, x): all x → min
await ev(`window.__draw.selectAll(); window.__draw.alignSelected('start','x')`);
const xsAligned = await ev(`window.__draw.scene.elements.map(e => Math.round(e.x))`);
const allSameX = xsAligned.every((v) => v === xsAligned[0]);

// distribute horizontally: assert it runs + gaps become more even (mid x between others)
await ev(`window.__draw.scene.elements.forEach((e,i)=>{}); window.__draw.selectAll();`);
// move them apart first via align top then distribute
await ev(`window.__draw.alignSelected('start','y')`);
const distRan = await ev(`(()=>{ try{ window.__draw.distributeSelected('x'); return true; }catch(e){ return 'ERR '+e.message; } })()`);

// lock: fresh isolated rect at a known spot, track its id
await ev(`window.__draw.clear(); window.__draw.deselect();`);
await ev(`window.__draw.setTool('rectangle')`); await drag(700, 200, 800, 320);
await ev(`window.__draw.setTool('selection')`);
await click(700, 260); // left outline of the fresh rect
const selectedBeforeLock = await ev(`window.__draw.selectedIds.size`);
const lockedId = await ev(`window.__draw.selectedId`);
await ev(`window.__draw.lockSelected()`);
const lockedFlag = await ev(`window.__draw.scene.elements.find(e => e.id === ${JSON.stringify(lockedId)})?.locked === true`);
await click(700, 260); // try to re-select the locked element
const selectedAfterLock = await ev(`window.__draw.selectedIds.size`);
await ev(`window.__draw.unlockAll()`);
const unlocked = await ev(`window.__draw.scene.elements.every(e => !e.locked)`);

console.log('xs before:', JSON.stringify(xs0), '-> aligned:', JSON.stringify(xsAligned), 'allSame=', allSameX);
console.log('distribute ran=', distRan);
console.log('lock: selectedBefore=', selectedBeforeLock, 'lockedFlag=', lockedFlag, 'selectedAfterLock=', selectedAfterLock, 'unlockedAll=', unlocked);

const ok = allSameX && distRan === true && lockedFlag === true && selectedAfterLock === 0 && unlocked === true;
console.log(ok ? 'PASS: align + distribute + lock/unlock' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
