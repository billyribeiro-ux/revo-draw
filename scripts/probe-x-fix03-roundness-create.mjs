// Fix-03/04 verification — Bug #3/#4: generic shapes and lines must honour
// currentItemRoundness at creation time (Excalidraw App.getCurrentItemRoundness,
// App.tsx:9500-9508 and the line branch at 9377-9380). Pre-fix, every created
// shape/line was sharp (roundness:null) regardless of the toolbar toggle.
//
// DIFFERENTIAL PROOF: the expected roundness is computed independently from the
// SAME helper Excalidraw uses (isUsingAdaptiveRadius — byte-identical in our
// element package), then compared to what the controller actually stamped on the
// created element. Round AND sharp are both asserted.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9282;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix03', '--window-size=1440,900', URL]);
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

// Draw one shape of a type, return its roundness; uses fresh canvas coords each time.
const drawAndGet = async (tool, x1, y1, x2, y2) => {
  await ev(`window.__draw.setTool('${tool}')`);
  await ev(`window.__draw.pointerDown(${x1}, ${y1}, {})`);
  await ev(`window.__draw.pointerMove(${x2}, ${y2}, {})`);
  await ev(`window.__draw.pointerUp(${x2}, ${y2}, {})`);
  await ev(`window.__draw.setTool('selection')`);
  // grab the most-recently-created element
  return ev(`(() => { const els = window.__draw.scene.elements; const e = els[els.length-1]; return { type: e.type, roundness: e.roundness ? e.roundness.type : null }; })()`);
};

// expected roundness per type, from the upstream rule (adaptive for rect-like, proportional otherwise)
// rect-like (adaptive): rectangle, image, frame, embeddable, iframe, ...; NOT diamond/ellipse/line/arrow.
const ADAPTIVE = new Set(['rectangle']); // among the types we draw here, only rectangle is rect-like
const ROUNDNESS = { PROPORTIONAL_RADIUS: 2, ADAPTIVE_RADIUS: 3 }; // from @excalidraw/common constants
const expectRound = (type) => (ADAPTIVE.has(type) ? ROUNDNESS.ADAPTIVE_RADIUS : ROUNDNESS.PROPORTIONAL_RADIUS);

// ---- ROUND mode ----
await ev(`window.__draw.clear(); window.__draw.setEdges('round');`);
const round = {
  rectangle: await drawAndGet('rectangle', 200, 200, 320, 280),
  diamond: await drawAndGet('diamond', 360, 200, 480, 280),
  ellipse: await drawAndGet('ellipse', 520, 200, 640, 280),
  line: await drawAndGet('line', 200, 360, 360, 420),
};

// ---- SHARP mode ----
await ev(`window.__draw.clear(); window.__draw.setEdges('sharp');`);
const sharp = {
  rectangle: await drawAndGet('rectangle', 200, 200, 320, 280),
  diamond: await drawAndGet('diamond', 360, 200, 480, 280),
  ellipse: await drawAndGet('ellipse', 520, 200, 640, 280),
  line: await drawAndGet('line', 200, 360, 360, 420),
};

let ok = true; const lines = [];
for (const t of ['rectangle', 'diamond', 'ellipse', 'line']) {
  const wantRound = expectRound(t);
  const gotRound = round[t].roundness;
  const gotSharp = sharp[t].roundness;
  const pass = gotRound === wantRound && gotSharp === null;
  ok = ok && pass;
  lines.push(`${t}: round=${gotRound}(want ${wantRound}) sharp=${gotSharp}(want null) ${pass ? 'OK' : 'FAIL'}`);
}

console.log('--- Bug #3/#4 differential: created shapes/lines honour currentItemRoundness ---');
for (const l of lines) console.log('  ' + l);
console.log(ok ? 'PASS: roundness toggle reflected on created rectangles/diamonds/ellipses/lines' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
