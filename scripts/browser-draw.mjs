import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9226, URL='http://localhost:1420/';
const chrome=spawn(CHROME,['--headless','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/lf-draw','--window-size=1440,900',URL]);
async function disc(){for(let i=0;i<40;i++){try{const r=await fetch(`http://localhost:${PORT}/json`);const t=(await r.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(t)return t.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error('no cdp');}
const ws=new WebSocket(await disc());let id=0;const p=new Map();
const send=(m,pr={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:pr}))});
await new Promise(r=>ws.onopen=r);
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
await send('Runtime.enable'); await sleep(2500);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception));return r.result.value};
// Reset doc + identity camera, select card tool with lock so both creates use it.
const box = await ev(`(async()=>{
  const {editor}=await import('/src/lib/canvas/editor.svelte.ts');
  window.__e=editor;
  editor.scene.replaceDocument((await import('/src/lib/elements/defaults.ts')).createBlankDocument('D'));
  editor.history.reset(editor.scene.doc); editor.currentStyle={};
  const c=document.querySelector('canvas').getBoundingClientRect();
  editor.camera.setViewport(c.width,c.height); editor.camera.zoom=1; editor.camera.panX=0; editor.camera.panY=0;
  editor.toolLocked=true; editor.setTool('card');
  return {x:c.left,y:c.top};
})()`);
async function drag(ax,ay,bx,by,steps=6){
  const sx=Math.round(box.x+ax), sy=Math.round(box.y+ay), ex=Math.round(box.x+bx), ey=Math.round(box.y+by);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:sx,y:sy,button:'left',buttons:1,clickCount:1}); await sleep(20);
  for(let i=1;i<=steps;i++){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:Math.round(sx+(ex-sx)*i/steps),y:Math.round(sy+(ey-sy)*i/steps),button:'left',buttons:1}); await sleep(15);}
  // sample panel visibility mid-drag (before release)
  const mid = await ev(`(() => { const e=window.__e; return { gestureActive: e.gestureActive }; })()`);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:ex,y:ey,button:'left',buttons:0,clickCount:1}); await sleep(40);
  return mid;
}
// 1) DRAG-create from (200,150)->(440,310) => ~240x160 at (200,150)
const mid1 = await drag(200,150,440,310);
const created = await ev(`(() => { const e=window.__e; const a=Object.values(e.scene.doc.elements).filter(x=>x.type==='card'); const c=a[a.length-1]; return c?{x:Math.round(c.x),y:Math.round(c.y),w:Math.round(c.width),h:Math.round(c.height)}:null; })()`);
// panel visible now (gesture ended)?
const afterDragPanel = await ev(`(() => ({ gestureActive: window.__e.gestureActive }))()`);
// 2) plain CLICK at (700,500) => default-size card centered there
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:Math.round(box.x+700),y:Math.round(box.y+500),button:'left',buttons:1,clickCount:1}); await sleep(20);
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:Math.round(box.x+700),y:Math.round(box.y+500),button:'left',buttons:0,clickCount:1}); await sleep(40);
const clicked = await ev(`(() => { const e=window.__e; const a=Object.values(e.scene.doc.elements).filter(x=>x.type==='card'); const c=a[a.length-1]; const cx=c.x+c.width/2, cy=c.y+c.height/2; return {w:Math.round(c.width),h:Math.round(c.height),cx:Math.round(cx),cy:Math.round(cy),worldX:Math.round(e.camera.toWorld({x:700,y:500}).x),worldY:Math.round(e.camera.toWorld({x:700,y:500}).y)}; })()`);
console.log('MID-DRAG gestureActive (panel hidden when true):', JSON.stringify(mid1));
console.log('CREATED by drag:', JSON.stringify(created));
console.log('AFTER drag gestureActive (panel shows when false):', JSON.stringify(afterDragPanel));
console.log('CREATED by click:', JSON.stringify(clicked));
const near=(a,b,t=8)=>Math.abs(a-b)<=t;
const dragOK = created && near(created.x,200)&&near(created.y,150)&&near(created.w,240)&&near(created.h,160);
const hideOK = mid1.gestureActive===true && afterDragPanel.gestureActive===false;
const clickOK = clicked.w>0 && clicked.h>0 && near(clicked.cx,clicked.worldX)&&near(clicked.cy,clicked.worldY);
console.log('drag-create:', dragOK?'PASS':'FAIL', '| style-gated-during-draw:', hideOK?'PASS':'FAIL', '| click-default-at-point:', clickOK?'PASS':'FAIL');
console.log((dragOK&&hideOK&&clickOK)?'RESULT: ALL PASS':'RESULT: FAIL');
ws.close(); chrome.kill(); process.exit((dragOK&&hideOK&&clickOK)?0:1);
