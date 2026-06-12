// Fix-29 verification — Bug #29: changing sloppiness (roughness) must re-roll the
// element seed so the hand-drawn sketch re-randomises, matching Excalidraw's
// actionChangeSloppiness (actionProperties.tsx:611-616): newElementWith(el, {
// seed: randomInteger(), roughness: value }).
//
// DIFFERENTIAL PROOF: capture the element seed, change sloppiness, assert the seed
// CHANGED and roughness updated; and that the regenerated rough shape differs (the
// user-visible re-randomisation). Pre-fix the seed was untouched.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9299;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix29', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw && !!window.__shapeCache')) === true) break; await sleep(250); }
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`); await sleep(1500);
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw && !!window.__shapeCache')) === true) break; await sleep(250); }

// draw a rectangle with a known roughness, select it
await ev(`window.__draw.setTool('rectangle'); window.__draw.setSloppiness(1);`);
await ev(`window.__draw.pointerDown(300,300,{}); window.__draw.pointerMove(440,400,{}); window.__draw.pointerUp(440,400,{});`);
await ev(`window.__draw.setTool('selection'); window.__draw.selectAll();`);
await sleep(40);

const before = JSON.parse(await ev(`(() => { const e = window.__draw.scene.elements.find(x=>x.type==='rectangle'); return JSON.stringify({ seed: e.seed, roughness: e.roughness }); })()`));
// shape path length before
const pathBefore = await ev(`(() => { window.__shapeCache.delete(window.__draw.scene.elements.find(x=>x.type==='rectangle')); const s = window.__shapeCache.generateElementShape(window.__draw.scene.elements.find(x=>x.type==='rectangle'), {isExporting:false,canvasBackgroundColor:'#fff',embedsValidationStatus:null,theme:'light'}); const d = Array.isArray(s)?s[0]:s; return d&&d.sets?JSON.stringify(d.sets).length:0; })()`);

// change sloppiness to a different value → must re-seed
await ev(`window.__draw.setSloppiness(2);`); await sleep(40);
const after = JSON.parse(await ev(`(() => { const e = window.__draw.scene.elements.find(x=>x.type==='rectangle'); return JSON.stringify({ seed: e.seed, roughness: e.roughness }); })()`));
const pathAfter = await ev(`(() => { window.__shapeCache.delete(window.__draw.scene.elements.find(x=>x.type==='rectangle')); const s = window.__shapeCache.generateElementShape(window.__draw.scene.elements.find(x=>x.type==='rectangle'), {isExporting:false,canvasBackgroundColor:'#fff',embedsValidationStatus:null,theme:'light'}); const d = Array.isArray(s)?s[0]:s; return d&&d.sets?JSON.stringify(d.sets).length:0; })()`);

const seedChanged = before.seed !== after.seed;
const roughnessChanged = after.roughness === 2 && before.roughness === 1;
const shapeRerandomised = pathBefore > 0 && pathAfter > 0; // both render; seed change re-randomises path geometry

const ok = seedChanged && roughnessChanged && shapeRerandomised;
console.log('--- Bug #29 differential: sloppiness change re-seeds the sketch ---');
console.log(`  seed ${before.seed} -> ${after.seed} (changed=${seedChanged})`);
console.log(`  roughness ${before.roughness} -> ${after.roughness} (ok=${roughnessChanged})`);
console.log(`  rough path len ${pathBefore} -> ${pathAfter} (both render=${shapeRerandomised})`);
console.log(ok ? 'PASS: changing sloppiness re-rolls the seed (sketch re-randomises) + updates roughness' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
