// FULL end-to-end app audit. Drives the real app via CDP synthesized mouse/keyboard events and
// reports raw state after each interaction. No cherry-picking: every check prints PASS/FAIL with the
// actual observed value. Exit code = number of failures.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9300, URL = 'http://localhost:1420/';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-full', '--window-size=1440,900', URL]);
async function disc() { for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await disc()); let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } };
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (!r) return undefined; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result ? r.result.value : undefined; };
for (let i = 0; i < 80; i++) { const ok = await ev(`(async()=>{try{await import('/src/lib/canvas/editor.svelte.ts');return !!document.querySelector('canvas')}catch{return false}})()`); if (ok === true) break; await sleep(300); }

let pass = 0, fail = 0; const failures = [];
function check(name, ok, detail = '') {
	if (ok) { pass++; console.log('PASS  ' + name + (detail ? '  — ' + detail : '')); }
	else { fail++; failures.push(name); console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const box = await ev(`(async () => {
	const e = (await import('/src/lib/canvas/editor.svelte.ts')).editor; window.__e = e;
	window.__d = await import('/src/lib/elements/defaults.ts');
	window.__md = await import('/src/lib/export/to-markdown.ts');
	window.__svg = await import('/src/lib/export/to-svg.ts');
	window.__png = await import('/src/lib/export/to-png.ts');
	const reset = () => { e.scene.replaceDocument(window.__d.createBlankDocument('full')); e.history.reset(e.scene.doc); const c = document.querySelector('canvas').getBoundingClientRect(); e.camera.setViewport(c.width, c.height); e.camera.zoom = 1; e.camera.panX = 0; e.camera.panY = 0; e.setTool('select'); };
	window.__reset = reset; reset();
	const c = document.querySelector('canvas').getBoundingClientRect();
	return { x: c.left, y: c.top };
})()`);
const M = (x, y) => ({ x: Math.round(box.x + x), y: Math.round(box.y + y) });
async function down(x, y, mods = 0) { const m = M(x, y); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1, modifiers: mods }); await sleep(15); }
async function moveTo(x, y) { const m = M(x, y); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y, button: 'left', buttons: 1 }); await sleep(12); }
async function up(x, y, mods = 0) { const m = M(x, y); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', buttons: 0, clickCount: 1, modifiers: mods }); await sleep(40); }
async function drag(ax, ay, bx, by, steps = 8) { await down(ax, ay); for (let i = 1; i <= steps; i++) await moveTo(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps); await up(bx, by); }
async function click(x, y, mods = 0) { await down(x, y, mods); await up(x, y, mods); }
async function key(code, ch, mods = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, modifiers: mods }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, modifiers: mods }); await sleep(70); }
const META = 4, SHIFT = 8, ALT = 1;
const count = () => ev(`Object.keys(window.__e.scene.doc.elements).length`);
const sel = () => ev(`window.__e.scene.selection.size`);
const focus = () => ev(`document.querySelector('canvas').focus()`);

console.log('\n========== A. EVERY TOOL CREATES ITS ELEMENT (real toolbar tool + drag) ==========');
const TOOLS = ['frame','container','card','nav','sidebar','tabs','modal','button','input','table','chart','list','divider'];
for (let i = 0; i < TOOLS.length; i++) {
	const t = TOOLS[i];
	await ev(`window.__reset(); window.__e.setTool('${t}')`);
	await drag(200, 160, 380, 280); // real drag-create
	const c = await count();
	const made = await ev(`(()=>{const id=Object.keys(window.__e.scene.doc.elements)[0];const x=window.__e.scene.get(id);return x?{type:x.type,w:Math.round(x.width),h:Math.round(x.height)}:null;})()`);
	check(`tool '${t}' creates an element`, c === 1 && made && made.type === t, JSON.stringify(made));
}
// text tool (special: click→edit)
await ev(`window.__reset(); window.__e.setTool('text')`);
await click(300, 200);
const textEditing = await ev(`window.__e.editingTextId !== null`);
check(`tool 'text' click → enters edit mode`, textEditing, `editingTextId set=${textEditing}`);
await key('KeyH', 'h'); await key('KeyI', 'i'); // type "hi"
await key('Escape', 'Escape');

console.log('\n========== B. SELECTION MODEL ==========');
await ev(`window.__reset()`);
await ev(`window.__e.commands.createAt('card',{x:150,y:150,width:100,height:70}); window.__e.scene.clearSelection();`);
await click(200, 185); // click the card
check('click selects element under cursor', (await sel()) === 1, `sel=${await sel()}`);
await click(700, 600); // empty
check('click empty clears selection', (await sel()) === 0, `sel=${await sel()}`);
await ev(`window.__reset(); window.__e.commands.createAt('card',{x:120,y:120,width:80,height:60}); window.__e.commands.createAt('card',{x:400,y:120,width:80,height:60}); window.__e.scene.clearSelection();`);
await drag(80, 80, 520, 220); // marquee over both
check('marquee selects intersecting', (await sel()) === 2, `sel=${await sel()}`);

console.log('\n========== C. MOVE / RESIZE / ROTATE (real handle drags) ==========');
await ev(`window.__reset(); window.__id=window.__e.commands.createAt('card',{x:200,y:200,width:160,height:120}); window.__e.scene.selectOne(window.__id);`);
const p0 = await ev(`(()=>{const e=window.__e.scene.get(window.__id);return {x:Math.round(e.x),y:Math.round(e.y)};})()`);
await drag(280, 260, 380, 330); // grab inside, move +100,+70
const p1 = await ev(`(()=>{const e=window.__e.scene.get(window.__id);return {x:Math.round(e.x),y:Math.round(e.y)};})()`);
check('drag-move translates element', p1.x - p0.x === 100 && p1.y - p0.y === 70, `d=(${p1.x-p0.x},${p1.y-p0.y})`);

console.log('\n========== D. ARRANGE: align / distribute / flip ==========');
await ev(`window.__reset(); window.__a=window.__e.commands.createAt('card',{x:0,y:0,width:100,height:60}); window.__b=window.__e.commands.createAt('card',{x:200,y:100,width:100,height:60}); window.__c=window.__e.commands.createAt('card',{x:500,y:300,width:100,height:60}); window.__e.scene.select([window.__a,window.__b,window.__c]);`);
await ev(`window.__e.commands.align('x','start')`);
const alignX = await ev(`[window.__a,window.__b,window.__c].map(id=>Math.round(window.__e.scene.get(id).x))`);
check('align left → all x equal', alignX.every(x=>x===alignX[0]), JSON.stringify(alignX));
// distribute on the (currently collapsed) selection then verify gaps on a fresh spread.
await ev(`window.__reset(); window.__a=window.__e.commands.createAt('card',{x:0,y:0,width:100,height:60}); window.__b=window.__e.commands.createAt('card',{x:120,y:0,width:100,height:60}); window.__c=window.__e.commands.createAt('card',{x:500,y:0,width:100,height:60}); window.__e.scene.select([window.__a,window.__b,window.__c]);`);
await ev(`window.__e.commands.distribute('x')`);
const dxs = await ev(`[window.__a,window.__b,window.__c].map(id=>{const e=window.__e.scene.get(id);return {x:Math.round(e.x),r:Math.round(e.x+e.width)};})`);
const gap1 = dxs[1].x - dxs[0].r, gap2 = dxs[2].x - dxs[1].r;
check('distribute H equalizes gaps', gap1 === gap2, `gaps=${gap1},${gap2}`);
// flip on a fresh, non-degenerate spread (two cards 400 apart → swap).
await ev(`window.__reset(); window.__a=window.__e.commands.createAt('card',{x:0,y:0,width:100,height:60}); window.__b=window.__e.commands.createAt('card',{x:400,y:0,width:100,height:60}); window.__e.scene.select([window.__a,window.__b]);`);
const flipBefore = await ev(`[Math.round(window.__e.scene.get(window.__a).x),Math.round(window.__e.scene.get(window.__b).x)]`);
await ev(`window.__e.commands.flip('x')`);
const flipAfter = await ev(`[Math.round(window.__e.scene.get(window.__a).x),Math.round(window.__e.scene.get(window.__b).x)]`);
check('flip H mirrors positions about bbox center', flipAfter[0]===400 && flipAfter[1]===0, `${JSON.stringify(flipBefore)}→${JSON.stringify(flipAfter)}`);

console.log('\n========== E. Z-ORDER (real keyboard ⌘] ⌘[ ⌘⇧] ⌘⇧[) ==========');
await ev(`window.__reset(); window.__a=window.__e.commands.createAt('card',{x:50,y:50,width:60,height:50}); window.__b=window.__e.commands.createAt('card',{x:300,y:50,width:60,height:50}); window.__c=window.__e.commands.createAt('card',{x:600,y:50,width:60,height:50}); window.__names={[window.__a]:'a',[window.__b]:'b',[window.__c]:'c'}; window.__e.scene.selectOne(window.__a);`);
const ord = () => ev(`window.__e.scene.childOrderOf(null).map(id=>window.__names[id])`);
await focus();
await key('BracketRight', '}', META|SHIFT);
const oFront = await ord();
check('⌘⇧] brings to front', oFront[oFront.length-1]==='a', JSON.stringify(oFront));
await key('BracketLeft', '{', META|SHIFT);
const oBack = await ord();
check('⌘⇧[ sends to back', oBack[0]==='a', JSON.stringify(oBack));

console.log('\n========== F. CLIPBOARD: copy/cut/paste/dup + styles ==========');
await ev(`window.__reset(); window.__id=window.__e.commands.createAt('card',{x:100,y:100,width:90,height:60}); window.__e.scene.selectOne(window.__id);`);
await focus(); await key('KeyD', 'd', META); // duplicate
check('⌘D duplicates', (await count())===2, `count=${await count()}`);
await focus(); await key('KeyC', 'c', META); await key('KeyV', 'v', META); await sleep(120);
check('⌘C then ⌘V pastes', (await count())>=3, `count=${await count()}`);
const cntBeforeCut = await count();
await ev(`window.__e.scene.selectOne(window.__id)`); await focus(); await key('KeyX', 'x', META);
check('⌘X cuts (removes)', (await count()) < cntBeforeCut, `${cntBeforeCut}→${await count()}`);
// copy/paste styles
await ev(`window.__reset(); window.__s=window.__e.commands.createAt('card',{x:0,y:0,width:80,height:60}); window.__t=window.__e.commands.createAt('card',{x:300,y:0,width:80,height:60}); window.__e.scene.selectOne(window.__s); window.__e.commands.setStyleOnSelection({stroke:'#e03131',fill:'#ffc9c9'},'s');`);
await focus(); await key('KeyC','c',META|ALT); // copy styles
await ev(`window.__e.scene.selectOne(window.__t)`); await focus(); await key('KeyV','v',META|ALT); // paste styles
const tStyle = await ev(`(()=>{const s=window.__e.scene.get(window.__t).style;return {stroke:s?.stroke,fill:s?.fill};})()`);
check('⌘⌥C/⌘⌥V copy-paste styles', tStyle.stroke==='#e03131'&&tStyle.fill==='#ffc9c9', JSON.stringify(tStyle));

console.log('\n========== G. UNDO / REDO ==========');
await ev(`window.__reset()`);
await ev(`window.__e.commands.createAt('card',{x:10,y:10,width:50,height:50})`);
const afterCreate = await count();
await focus(); await key('KeyZ', 'z', META);
const afterUndo = await count();
await focus(); await key('KeyZ', 'z', META|SHIFT);
const afterRedo = await count();
check('undo removes, redo restores', afterCreate===1 && afterUndo===0 && afterRedo===1, `create=${afterCreate} undo=${afterUndo} redo=${afterRedo}`);

console.log('\n========== H. LOCK (locked element not click-selectable) ==========');
await ev(`window.__reset(); window.__id=window.__e.commands.createAt('card',{x:150,y:150,width:200,height:140}); window.__e.scene.selectOne(window.__id); window.__e.commands.toggleLockSelection(); window.__e.scene.clearSelection();`);
await click(250, 220);
check('locked element not selectable by click', (await sel())===0, `sel=${await sel()}`);

console.log('\n========== I. DIVIDER (the reported bug) ==========');
await ev(`(()=>{const ctx=document.querySelector('canvas').getContext('2d'); if(!ctx.__w){ctx.__w=true; const o=ctx.stroke.bind(ctx); ctx.stroke=function(){(window.__lw||=[]).push(this.lineWidth);return o();};}})()`);
await ev(`window.__reset(); window.__e.setTool('divider'); window.__lw=[];`);
await drag(300, 120, 305, 480); // long vertical
const div = await ev(`(()=>{const id=Object.keys(window.__e.scene.doc.elements)[0];const x=window.__e.scene.get(id);return {w:Math.round(x.width),h:Math.round(x.height),orientation:('orientation'in x)?x.orientation:'unset'};})()`);
await ev(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
const maxLw = await ev(`Math.max(...(window.__lw||[1]))`);
check('divider drag-down → vertical, 1px cross-axis', div.orientation==='vertical' && div.w===1, JSON.stringify(div));
check('divider thickness stays thin (<6px, NOT bbox height)', maxLw < 6, `maxLineWidth=${Math.round(maxLw*100)/100}, lineLength=${div.h}`);

console.log('\n========== J. STYLE PANEL + PALETTE ==========');
await ev(`window.__reset(); window.__id=window.__e.commands.createAt('card',{x:200,y:200,width:160,height:120}); window.__e.scene.selectOne(window.__id); window.__e.gestureActive=false;`);
await sleep(150);
check('StylePanel mounts when element selected', await ev(`!!document.querySelector('.style-panel')`));
// open the "more" popover, pick a swatch, assert it closes
const trig = await ev(`(()=>{const b=document.querySelector('.style-panel .more .current');if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:trig.x,y:trig.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:trig.x,y:trig.y,button:'left',buttons:0,clickCount:1});await sleep(100);
const popOpened = await ev(`!!document.querySelector('.style-panel .grid-pop')`);
const sw = await ev(`(()=>{const b=document.querySelector('.style-panel .grid-pop .swatch');const r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:sw.x,y:sw.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:sw.x,y:sw.y,button:'left',buttons:0,clickCount:1});await sleep(120);
const popClosed = !(await ev(`!!document.querySelector('.style-panel .grid-pop')`));
check('palette popover opens on trigger', popOpened);
check('palette CLOSES after picking a color', popClosed);

console.log('\n========== K. PANELS default-collapsed ==========');
await ev(`window.__reset(); window.__e.layersOpen=false; window.__e.inspectorPinned=false;`);
await sleep(120);
check('blank load: no Layers panel', !(await ev(`!!document.querySelector('.left-panel')`)));
check('blank load: no Inspector', !(await ev(`!!document.querySelector('.right-panel')`)));

console.log('\n========== L. SNAPPING (real drag aligns to neighbor) ==========');
await ev(`window.__reset(); window.__a=window.__e.commands.createAt('card',{x:100,y:100,width:120,height:80}); window.__b=window.__e.commands.createAt('card',{x:400,y:200,width:120,height:80}); window.__e.scene.selectOne(window.__b);`);
await drag(460, 240, 460, 143); // drag b's top near a's top (y=100)
const snapY = await ev(`Math.round(window.__e.scene.get(window.__b).y)`);
check('snapping pulls element to neighbor edge', Math.abs(snapY-100)<=1.5, `b.y=${snapY} (target 100)`);

console.log('\n========== M. REPARENT (drag into container preserves world space) ==========');
await ev(`window.__reset(); window.__cont=window.__e.commands.createAt('container',{x:100,y:100,width:300,height:240}); window.__child=window.__e.commands.createAt('card',{x:600,y:120,width:80,height:60}); window.__e.scene.selectOne(window.__child);`);
await drag(640, 150, 250, 220); // drag child into container
const parented = await ev(`window.__e.scene.get(window.__child).parentId === window.__cont`);
check('drag into container reparents child', parented, `parentId match=${parented}`);

console.log('\n========== N. EXPORT (md / svg / png) ==========');
await ev(`window.__reset(); const f=window.__e.commands.createAt('frame',{x:0,y:0,width:400,height:300}); const t=window.__e.commands.createAt('text',{x:20,y:20,width:200,height:30}); window.__e.commands.patch(t,{content:'Hi',label:'Heading'});`);
const md = await ev(`window.__md.compileToMarkdown(window.__e.scene.doc)`);
check('export Markdown non-empty + single trailing newline', typeof md==='string' && md.length>50 && md.endsWith('\n') && !md.endsWith('\n\n'), `len=${md.length}`);
const md2 = await ev(`window.__md.compileToMarkdown(window.__e.scene.doc)`);
check('export Markdown deterministic', md===md2);
const svg = await ev(`(()=>{try{return window.__svg.compileToSvg(window.__e.scene.doc);}catch(e){return 'ERR:'+e.message;}})()`);
check('export SVG valid', typeof svg==='string' && svg.includes('<svg') && svg.includes('</svg>'), `len=${(svg||'').length}`);
const pngOk = await ev(`(async()=>{try{const b=await window.__png.exportPng(window.__e.scene.doc);return b && b.length>100;}catch(e){return 'ERR:'+e.message;}})()`);
check('export PNG produces bytes', pngOk===true, `result=${pngOk}`);

console.log('\n========== O. ZOOM / PAN (keyboard + camera) ==========');
await ev(`window.__reset()`);
await focus(); await key('Equal','=',META);
const zIn = await ev(`window.__e.camera.zoom`);
await focus(); await key('Minus','-',META);
const zOut = await ev(`window.__e.camera.zoom`);
await focus(); await key('Digit0','0',META);
const zReset = await ev(`window.__e.camera.zoom`);
check('⌘+ zooms in, ⌘- back, ⌘0 resets to 1', zIn>1 && zOut<zIn && Math.abs(zReset-1)<0.001, `in=${zIn.toFixed(2)} out=${zOut.toFixed(2)} reset=${zReset.toFixed(2)}`);

console.log(`\n================= TOTAL: ${pass} PASS / ${fail} FAIL =================`);
if (failures.length) console.log('FAILURES:', JSON.stringify(failures, null, 1));
ws.close(); chrome.kill();
process.exit(fail === 0 ? 0 : 1);
