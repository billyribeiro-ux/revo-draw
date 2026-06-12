// Fix-34 verification — Bug #34: selectAll must exclude locked elements and
// bound-text labels (text bound to a container is selected via its container, not
// directly), matching Excalidraw's actionSelectAll (actionSelectAll.ts:28-38):
//   filter: !isDeleted && !(isTextElement && containerId) && !locked
//
// DIFFERENTIAL PROOF: build a scene with (a) a normal rect, (b) a LOCKED rect, and
// (c) a text element carrying a containerId (a bound label). selectAll must select
// ONLY the normal rect — the locked rect and the bound label are excluded. Pre-fix,
// selectAll selected every element including locked + bound text.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9301;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-fix34', '--window-size=1440,900', URL]);
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

// rect A (normal)
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(200,200,{}); window.__draw.pointerMove(280,260,{}); window.__draw.pointerUp(280,260,{});`);
const rectA = await ev(`window.__draw.scene.elements.find(e=>e.type==='rectangle').id`);
// rect B (will be locked)
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(360,200,{}); window.__draw.pointerMove(440,260,{}); window.__draw.pointerUp(440,260,{});`);
await ev(`window.__draw.setTool('selection');`);
const rectB = await ev(`(() => { const rs = window.__draw.scene.elements.filter(e=>e.type==='rectangle'); return rs[1].id; })()`);
// lock rect B: select only it, then lockSelected
await ev(`window.__draw.clear ? 0 : 0;`); // no-op guard
// select rect B by clicking its edge, then lock
await ev(`window.__draw.pointerDown(360,230,{}); window.__draw.pointerUp(360,230,{});`); await sleep(30);
await ev(`window.__draw.lockSelected();`); await sleep(30);
const bLocked = await ev(`window.__draw.scene.elements.find(e=>e.id==='${rectB}').locked === true`);

// bound text: create a text element and give it a containerId (simulate a bound label)
await ev(`window.__draw.setTool('text'); window.__draw.pointerDown(210,210,{}); window.__draw.setEditingText('label'); window.__draw.commitText(); window.__draw.setTool('selection');`);
const textId = await ev(`(() => { const t = window.__draw.scene.elements.find(e=>e.type==='text'); return t ? t.id : null; })()`);
// bind it to rectA via direct mutate (the binding mechanism isn't under test; the filter is)
await ev(`(() => { const t = window.__draw.scene.elements.find(e=>e.type==='text'); const m = window.__draw.scene.scene.getNonDeletedElementsMap(); window.__draw.scene; const me = m.get(t.id); me.containerId = '${rectA}'; })()`);
const textBound = await ev(`window.__draw.scene.elements.find(e=>e.id==='${textId}').containerId === '${rectA}'`);

// select all → only rect A should be selected
await ev(`window.__draw.deselect(); window.__draw.selectAll();`); await sleep(40);
const selected = JSON.parse(await ev(`JSON.stringify([...window.__draw.selectedIds])`));

const includesA = selected.includes(rectA);
const excludesLockedB = !selected.includes(rectB);
const excludesBoundText = !selected.includes(textId);
const onlyA = selected.length === 1 && selected[0] === rectA;

const ok = bLocked && textBound && includesA && excludesLockedB && excludesBoundText && onlyA;
console.log('--- Bug #34 differential: selectAll skips locked + bound-text ---');
console.log(`  setup: rectB.locked=${bLocked} text.containerId-bound=${textBound}`);
console.log(`  selected=${JSON.stringify(selected)}`);
console.log(`  includes rectA=${includesA} excludes locked rectB=${excludesLockedB} excludes bound text=${excludesBoundText} onlyA=${onlyA}`);
console.log(ok ? 'PASS: selectAll selects only the unlocked, non-bound element' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
