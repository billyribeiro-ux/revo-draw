// Fix-01 verification — Bug #1: style edits must bust the ShapeCache so the
// rough shape regenerates with the new style (Excalidraw applies styles via
// newElementWith → fresh ref → WeakMap miss; our port mutates in place, so it
// must call ShapeCache.delete explicitly).
//
// DIFFERENTIAL PROOF (not self-consistency):
//   1. Prime the cache: generateElementShape(el) → stash the rough Drawable's
//      options.stroke (the colour roughjs actually drew with).
//   2. Change strokeColor via the controller.
//   3. Assert the cache entry is GONE (ShapeCache.get → undefined) — i.e. the
//      fix ran. (Pre-fix: get() returns the stale cached shape.)
//   4. Regenerate and assert the new Drawable's options.stroke === new colour.
//      (Pre-fix: it would still be the OLD colour because the cache was reused.)
// Same checks for backgroundColor (fill), strokeWidth, roughness, and roundness.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9281;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix01', '--window-size=1440,900', URL]);
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

// Helper installed in-page: prime cache, read the rough Drawable's stroke/fill,
// run a controller mutation, then assert cache-bust + regenerated style.
const setup = await ev(`(() => {
  const d = window.__draw, SC = window.__shapeCache;
  // create a rectangle with a known initial style
  d.setTool('rectangle');
  d.setStrokeColor('#1e1e1e');
  d.setBackgroundColor('#ffc9c9');
  d.setFillStyle('solid');
  d.pointerDown(300, 300, {});
  d.pointerMove(420, 380, {});
  d.pointerUp(420, 380, {});
  d.setTool('selection');
  const el = d.scene.elements.find(e => e.type === 'rectangle');
  if (!el) return { ok:false, why:'no rectangle created' };
  d.selectAll();
  // expose handle + a primer for the probe
  window.__el = el;
  window.__prime = () => SC.generateElementShape(el, { isExporting:false, canvasBackgroundColor:'#fff', embedsValidationStatus:null, theme:'light' });
  window.__opts = () => { const s = SC.get(el, 'light'); if (!s) return null; const dr = Array.isArray(s) ? s[0] : s; return dr && dr.options ? { stroke: dr.options.stroke, fill: dr.options.fill, strokeWidth: dr.options.strokeWidth, roughness: dr.options.roughness } : null; };
  return { ok:true, id: el.id, initStroke: el.strokeColor, initBg: el.backgroundColor };
})()`);

if (!setup || setup.ok !== true) { console.log('SETUP FAIL:', JSON.stringify(setup)); ws.close(); chrome.kill(); process.exit(1); }

// Race-free differential assertion. The render loop legitimately re-primes the
// cache after triggerUpdate(), so "is the cache empty right now?" is unreliable.
// Instead we prove the user-visible signal directly: the rough Drawable that
// will be PAINTED carries the OLD style before the edit and the NEW style after.
//   before = the rough opts roughjs drew with PRE-edit  (must equal oldVal)
//   after  = the rough opts roughjs draws with POST-edit (must equal newVal)
// Pre-fix, the cache is reused so `after` would STILL equal oldVal — that is the
// exact stale-render bug. Post-fix the cache is busted so `after` flips to newVal.
const probe = async (mutateExpr, field, oldVal, newVal, optKey) => {
  await ev(`window.__shapeCache.delete(window.__el); window.__prime();`); // clean prime at old style
  const before = await ev(`window.__opts()`);                     // rough opts roughjs would PAINT, pre-edit
  await ev(mutateExpr);                                            // controller style mutation (busts cache via fix)
  await ev(`window.__prime()`);                                   // renderer regenerates next frame
  const after = await ev(`window.__opts()`);                      // rough opts roughjs would PAINT, post-edit
  const dataField = await ev(`window.__el.${field}`);
  return { field, oldVal, newVal, optKey, before, after, dataField };
};

const results = [];
results.push(await probe(`window.__draw.setStrokeColor('#e03131')`,    'strokeColor',     '#1e1e1e', '#e03131', 'stroke'));
results.push(await probe(`window.__draw.setBackgroundColor('#a5d8ff')`,'backgroundColor', '#ffc9c9', '#a5d8ff', 'fill'));
results.push(await probe(`window.__draw.setStrokeWidth(4)`,            'strokeWidth',     2,         4,         'strokeWidth'));
results.push(await probe(`window.__draw.setSloppiness(2)`,            'roughness',       1,         2,         'roughness'));
// roundness path (setEdges): rough opts don't carry roundness, so prove the
// regenerated Drawable itself differs (round vs sharp produce different paths)
// and the element data flipped.
await ev(`window.__shapeCache.delete(window.__el); window.__prime();`);
const sharpShape = await ev(`(() => { const s = window.__shapeCache.get(window.__el,'light'); const d = Array.isArray(s)?s[0]:s; return d && d.sets ? JSON.stringify(d.sets).length : 0; })()`);
await ev(`window.__draw.setEdges('round')`);
await ev(`window.__prime()`);
const roundShape = await ev(`(() => { const s = window.__shapeCache.get(window.__el,'light'); const d = Array.isArray(s)?s[0]:s; return d && d.sets ? JSON.stringify(d.sets).length : 0; })()`);
const roundData = await ev(`window.__el.roundness && window.__el.roundness.type ? 'round' : 'sharp'`);

let ok = true; const lines = [];
for (const r of results) {
  // PRE-edit the painted rough opts carry the OLD style
  const beforeOk = r.before && r.before[r.optKey] === r.oldVal;
  // element data updated to the new value
  const dataOk = r.dataField === r.newVal;
  // POST-edit the regenerated (= to-be-painted) rough opts carry the NEW style.
  // This is the bug's user-visible signal: pre-fix it would STILL be oldVal.
  const afterOk = r.after && r.after[r.optKey] === r.newVal;
  const flipped = beforeOk && afterOk; // proves the transition old→new actually happened
  const pass = flipped && dataOk;
  ok = ok && pass;
  lines.push(`${r.field}: rough.${r.optKey} ${r.before ? r.before[r.optKey] : 'n/a'}→${r.after ? r.after[r.optKey] : 'n/a'} (want ${r.oldVal}→${r.newVal}) data=${r.dataField}(${dataOk}) ${pass ? 'OK' : 'FAIL'}`);
}
// round produces a different path geometry than sharp → regenerated shape differs
const roundOk = roundData === 'round' && roundShape > 0 && roundShape !== sharpShape;
ok = ok && roundOk;
lines.push(`roundness(setEdges): data=${roundData} pathLen ${sharpShape}→${roundShape} (differs=${roundShape !== sharpShape}) ${roundOk ? 'OK' : 'FAIL'}`);

console.log('--- Bug #1 differential: style edit regenerates the PAINTED rough shape ---');
for (const l of lines) console.log('  ' + l);
console.log(ok ? 'PASS: style edits regenerate the rough shape (new style is what gets painted)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
