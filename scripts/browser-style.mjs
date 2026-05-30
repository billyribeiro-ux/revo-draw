import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9225, URL='http://localhost:1420/';
const chrome=spawn(CHROME,['--headless','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/lf-style','--window-size=1440,900',URL]);
async function disc(){for(let i=0;i<40;i++){try{const r=await fetch(`http://localhost:${PORT}/json`);const t=(await r.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(t)return t.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error('no cdp');}
const ws=new WebSocket(await disc());let id=0;const p=new Map();
const send=(m,pr={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:pr}))});
await new Promise(r=>ws.onopen=r);
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
await send('Runtime.enable'); await sleep(2500);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception));return r.result.value};
// Create a card via the editor + apply style on selection, read result back.
const res=await ev(`(async()=>{
  const {editor}=await import('/src/lib/canvas/editor.svelte.ts');
  editor.camera.setViewport(1440,854); editor.camera.zoom=1; editor.camera.panX=0; editor.camera.panY=0;
  editor.scene.replaceDocument((await import('/src/lib/elements/defaults.ts')).createBlankDocument('S'));
  editor.history.reset(editor.scene.doc);
  const id=editor.commands.createAt('card',{x:300,y:200});
  editor.scene.selectOne(id);
  // apply style via the same command the panel uses
  editor.commands.setStyleOnSelection({stroke:'#e03131', strokeWidth:'extra', strokeStyle:'dashed', fill:'#a5d8ff', opacity:0.5}, 'Style');
  const el=editor.scene.get(id);
  return {stroke:el.style.stroke, width:el.style.strokeWidth, line:el.style.strokeStyle, fill:el.style.fill, opacity:el.style.opacity, currentStyleStroke: editor.currentStyle.stroke ?? null};
})()`);
console.log('STYLE RESULT:', JSON.stringify(res));
const ok = res.stroke==='#e03131'&&res.width==='extra'&&res.line==='dashed'&&res.fill==='#a5d8ff'&&res.opacity===0.5;
console.log(ok?'RESULT: PASS — style applied to selection':'RESULT: FAIL');
ws.close(); chrome.kill(); process.exit(ok?0:1);
