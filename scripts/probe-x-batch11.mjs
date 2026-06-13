// Batch-11 verification: binding-highlight overlay (suggestedBinding while drawing
// an arrow over a shape) + elbow arrows (elbowed flag + orthogonal routing + the
// arrow-type toggle).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9267;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b11', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const m2 = (t, x, y, b) => send('Input.dispatchMouseEvent', { type: t, x, y, button: t === 'mouseMoved' && b === 0 ? 'none' : 'left', buttons: b, clickCount: 1 });
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await m2('mouseMoved', 200, 200, 0);

// --- binding highlight: draw a rect, then start an arrow whose end hovers the rect
await ev(`window.__draw.setTool('rectangle')`); await m2('mouseMoved', 600, 300, 0); await sleep(15); await m2('mousePressed', 600, 300, 1); await sleep(20); await m2('mouseMoved', 720, 400, 1); await sleep(20); await m2('mouseReleased', 720, 400, 0); await sleep(40);
await ev(`window.__draw.setTool('arrow')`);
// start arrow far from the rect, drag its end ONTO the rect → suggestedBinding set
await m2('mouseMoved', 420, 350, 0); await sleep(15);
await m2('mousePressed', 420, 350, 1); await sleep(20);
await m2('mouseMoved', 520, 350, 1); await sleep(20);
await m2('mouseMoved', 660, 350, 1); await sleep(30); // now over the rect
const highlightWhileDrawing = await ev(`!!window.__draw.appState.current.suggestedBinding`);
await m2('mouseReleased', 660, 350, 0); await sleep(40);
const highlightAfterRelease = await ev(`window.__draw.appState.current.suggestedBinding`);
// the arrow should have bound to the rect
const boundEnd = await ev(`(() => { const a = window.__draw.scene.elements.find(e => e.type === 'arrow'); return a ? !!a.endBinding : null; })()`);

// --- elbow arrows: set arrow type elbow, draw an arrow → elbowed + orthogonal
await ev(`window.__draw.clear(); window.__draw.deselect();`);
await ev(`window.__draw.setTool('arrow'); window.__draw.setArrowType('elbow');`);
await m2('mouseMoved', 300, 300, 0); await sleep(15);
await m2('mousePressed', 300, 300, 1); await sleep(20);
await m2('mouseMoved', 500, 420, 1); await sleep(30);
await m2('mouseReleased', 500, 420, 0); await sleep(40);
const elbow = await ev(`(() => {
  const a = window.__draw.scene.elements.find(e => e.type === 'arrow');
  if (!a) return null;
  // an elbow arrow has >2 points, each segment axis-aligned (dx===0 or dy===0)
  const pts = a.points;
  let orthogonal = pts.length >= 2;
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.abs(pts[i][0] - pts[i-1][0]);
    const dy = Math.abs(pts[i][1] - pts[i-1][1]);
    if (dx > 0.5 && dy > 0.5) orthogonal = false;
  }
  return { elbowed: a.elbowed, nPoints: pts.length, orthogonal };
})()`);

// arrow-type getter reflects the selected elbow arrow
await ev(`window.__draw.selectAll()`);
const typeGetter = await ev(`window.__draw.currentArrowType`);

console.log('binding-highlight while drawing:', highlightWhileDrawing, '| cleared after release:', highlightAfterRelease === null, '| arrow bound:', boundEnd);
console.log('elbow arrow:', JSON.stringify(elbow), '| type getter:', typeGetter);

const ok =
  highlightWhileDrawing === true && highlightAfterRelease === null && boundEnd === true &&
  elbow && elbow.elbowed === true && elbow.nPoints >= 2 && elbow.orthogonal === true &&
  typeGetter === 'elbow';
console.log(ok ? 'PASS: binding-highlight + elbow arrows' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
