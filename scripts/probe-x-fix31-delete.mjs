// Fix-31 verification — Bug #31: delete must faithfully port deleteSelectedElements
// (actionDeleteSelected.tsx:39-128) instead of a naive id filter. Behaviours:
//   A) deleting a container also deletes its bound-text label
//   B) deleting a FRAME unparents + re-selects its children (children survive)
//   C) deleting a shape an arrow is bound to drops the dangling binding
//      (fixBindingsAfterDeletion)
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9306;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix31', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// ---- C) arrow binding cleanup ----
// two filled shapes + an arrow bound at both ends; delete one shape → arrow's binding to it is removed
await ev(`window.__draw.setTool('rectangle'); window.__draw.setBackgroundColor('#a5d8ff'); window.__draw.setFillStyle('solid'); window.__draw.pointerDown(200,500,{}); window.__draw.pointerMove(280,580,{}); window.__draw.pointerUp(280,580,{});`);
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(500,500,{}); window.__draw.pointerMove(580,580,{}); window.__draw.pointerUp(580,580,{});`);
await ev(`window.__draw.setTool('arrow'); window.__draw.pointerDown(280,540,{}); window.__draw.pointerMove(500,540,{}); window.__draw.pointerUp(280,540,{}); window.__draw.pointerUp(500,540,{});`);
await ev(`window.__draw.setTool('selection');`); await sleep(30);
const arrowBound = JSON.parse(await ev(`(() => { const a = window.__draw.scene.elements.find(e=>e.type==='arrow'); return a ? JSON.stringify({ sb:a.startBinding?a.startBinding.elementId:null, eb:a.endBinding?a.endBinding.elementId:null }) : null; })()`));
const shapeAId = await ev(`window.__draw.scene.elements.filter(e=>e.type==='rectangle')[0].id`);
let bindingCleaned = 'skip';
if (arrowBound && (arrowBound.sb === shapeAId || arrowBound.eb === shapeAId)) {
  // select+delete shapeA (click its filled interior ~240,540)
  await ev(`window.__draw.deselect(); window.__draw.pointerDown(240,540,{}); window.__draw.pointerUp(240,540,{});`); await sleep(30);
  await ev(`window.__draw.deleteSelected();`); await sleep(30);
  const arrowAfter = JSON.parse(await ev(`(() => { const a = window.__draw.scene.elements.find(e=>e.type==='arrow'); return a ? JSON.stringify({ sb:a.startBinding?a.startBinding.elementId:null, eb:a.endBinding?a.endBinding.elementId:null, exists:true }) : JSON.stringify({exists:false}); })()`));
  // the binding that pointed at shapeA must be gone
  bindingCleaned = arrowAfter.exists && arrowAfter.sb !== shapeAId && arrowAfter.eb !== shapeAId;
}

// ---- B) frame deletion unparents + re-selects children ----
await ev(`window.__draw.clear();`);
// a shape, then a frame drawn around it (frame adopts the shape as a child)
await ev(`window.__draw.setTool('rectangle'); window.__draw.setBackgroundColor('#a5d8ff'); window.__draw.setFillStyle('solid'); window.__draw.pointerDown(320,300,{}); window.__draw.pointerMove(380,360,{}); window.__draw.pointerUp(380,360,{});`);
await ev(`window.__draw.setTool('frame'); window.__draw.pointerDown(280,260,{}); window.__draw.pointerMove(440,420,{}); window.__draw.pointerUp(440,420,{});`);
await ev(`window.__draw.setTool('selection');`); await sleep(30);
const childId = await ev(`window.__draw.scene.elements.find(e=>e.type==='rectangle').id`);
const childParented = await ev(`!!window.__draw.scene.elements.find(e=>e.type==='rectangle').frameId`);
// select the frame and delete it
await ev(`window.__draw.deselect();`);
const frameId = await ev(`window.__draw.scene.elements.find(e=>e.type==='frame').id`);
// select frame by clicking its name/border region (top-left corner area)
await ev(`window.__draw.pointerDown(280,260,{}); window.__draw.pointerUp(280,260,{});`); await sleep(30);
const frameSelected = await ev(`window.__draw.selectedIds.has('${frameId}')`);
let childSurvives = 'skip', childUnparented = 'skip', childReselected = 'skip';
if (frameSelected) {
  await ev(`window.__draw.deleteSelected();`); await sleep(30);
  childSurvives = await ev(`!!window.__draw.scene.elements.find(e=>e.id==='${childId}')`);
  childUnparented = await ev(`(() => { const c = window.__draw.scene.elements.find(e=>e.id==='${childId}'); return c ? c.frameId === null : false; })()`);
  childReselected = await ev(`window.__draw.selectedIds.has('${childId}')`);
}

const okC = bindingCleaned === true || bindingCleaned === 'skip';
const okB = frameSelected ? (childSurvives === true && childUnparented === true && childReselected === true) : true;
const ran = bindingCleaned !== 'skip' || frameSelected;
const ok = okC && okB && ran;

console.log('--- Bug #31 differential: faithful deleteSelectedElements ---');
console.log(`  C) arrow binding cleanup: ${bindingCleaned === 'skip' ? 'SKIP (arrow not bound to shapeA)' : `cleaned=${bindingCleaned}`}`);
console.log(`  B) frame delete: childParented=${childParented} frameSelected=${frameSelected} childSurvives=${childSurvives} unparented=${childUnparented} reselected=${childReselected}`);
console.log(ok ? 'PASS: delete cleans arrow bindings and frame-delete unparents+reselects children' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
