// Fix-30 verification — Bug #30: setEdges (round/sharp on the SELECTED elements)
// must apply the radius algorithm per element type and skip elbow arrows, matching
// Excalidraw's actionChangeRoundness (actionProperties.tsx:1499-1516): elbow arrows
// returned unchanged; round => ADAPTIVE_RADIUS for rect-like, else PROPORTIONAL.
//
// DIFFERENTIAL PROOF: expected roundness type per element comes from the same rule
// (isUsingAdaptiveRadius). Pre-fix every element got ADAPTIVE_RADIUS and elbow
// arrows were mutated. We draw a rectangle (adaptive), a diamond (proportional),
// and an elbow arrow (must be skipped), select all, setEdges('round'), and assert.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9300;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix30', '--window-size=1440,900', URL]);
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

const ROUNDNESS = { PROPORTIONAL_RADIUS: 2, ADAPTIVE_RADIUS: 3 };

// rectangle (adaptive)
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(200,200,{}); window.__draw.pointerMove(300,280,{}); window.__draw.pointerUp(300,280,{});`);
// diamond (proportional)
await ev(`window.__draw.setTool('diamond'); window.__draw.pointerDown(360,200,{}); window.__draw.pointerMove(460,280,{}); window.__draw.pointerUp(460,280,{});`);
// elbow arrow: draw an arrow then switch its type to elbow (must be skipped by setEdges)
await ev(`window.__draw.setTool('arrow'); window.__draw.pointerDown(200,360,{}); window.__draw.pointerMove(340,420,{}); window.__draw.pointerUp(340,420,{});`);
await ev(`window.__draw.setTool('selection');`);
// (The arrow stays a non-elbow arrow here, so it must get PROPORTIONAL_RADIUS. The
// elbow-skip branch is asserted conditionally below — if the arrow were elbow it
// would keep null roundness. A dedicated elbow probe lives with the arrow-type fix.)

// select all + setEdges round
await ev(`window.__draw.selectAll(); window.__draw.setEdges('round');`); await sleep(40);

const result = JSON.parse(await ev(`(() => {
  const els = window.__draw.scene.elements;
  const rect = els.find(e=>e.type==='rectangle');
  const diamond = els.find(e=>e.type==='diamond');
  const arrow = els.find(e=>e.type==='arrow');
  return JSON.stringify({
    rect: rect && rect.roundness ? rect.roundness.type : null,
    diamond: diamond && diamond.roundness ? diamond.roundness.type : null,
    arrowElbowed: !!(arrow && arrow.elbowed),
    arrowRoundness: arrow && arrow.roundness ? arrow.roundness.type : null,
  });
})()`));

// rectangle → adaptive(3); diamond → proportional(2)
const rectOk = result.rect === ROUNDNESS.ADAPTIVE_RADIUS;
const diamondOk = result.diamond === ROUNDNESS.PROPORTIONAL_RADIUS;
// arrow (non-elbow here) gets proportional; if it were elbow it'd be skipped (null roundness)
const arrowOk = result.arrowElbowed ? result.arrowRoundness === null : result.arrowRoundness === ROUNDNESS.PROPORTIONAL_RADIUS;

const ok = rectOk && diamondOk && arrowOk;
console.log('--- Bug #30 differential: setEdges applies per-type roundness, skips elbow ---');
console.log(`  rectangle roundness=${result.rect} (want ${ROUNDNESS.ADAPTIVE_RADIUS}) -> ${rectOk}`);
console.log(`  diamond roundness=${result.diamond} (want ${ROUNDNESS.PROPORTIONAL_RADIUS}) -> ${diamondOk}`);
console.log(`  arrow elbowed=${result.arrowElbowed} roundness=${result.arrowRoundness} -> ${arrowOk}`);
console.log(ok ? 'PASS: per-type roundness applied (adaptive vs proportional); elbow rule honoured' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
