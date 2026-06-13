// Verify a placed icon (image) is fully interactive via REAL pointer events:
// select by clicking its body, move by dragging, resize by dragging the SE transform handle.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 9285;
const URL = 'http://localhost:1420/';
const udd = mkdtempSync(join(tmpdir(), 'icon2-'));
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,`--user-data-dir=${udd}`,'--window-size=1440,900','--hide-scrollbars',URL]);
async function discover(){for(let i=0;i<80;i++){try{const r=await fetch(`http://localhost:${PORT}/json`);const t=(await r.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(t)return t.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error('no cdp');}
const ws=new WebSocket(await discover());let id=0;const pending=new Map();
const send=(m,pr={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:pr}));});
await new Promise(r=>(ws.onopen=r));
ws.onmessage=e=>{const m=JSON.parse(e.data.toString());if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
await send('Runtime.enable');await send('Page.enable');
const evx=async x=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return 'ERR '+(r.exceptionDetails.exception?.description??JSON.stringify(r.exceptionDetails));return r.result.value;};
const move=(x,y,b=0)=>send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:b?'left':'none',buttons:b});
const down=(x,y)=>send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
const up=(x,y)=>send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
const click=async(x,y)=>{await move(x,y);await sleep(20);await down(x,y);await sleep(40);await up(x,y);await sleep(70);};
const drag=async(x1,y1,x2,y2)=>{await move(x1,y1);await sleep(20);await down(x1,y1);await sleep(40);await move((x1+x2)/2,(y1+y2)/2,1);await sleep(30);await move(x2,y2,1);await sleep(30);await up(x2,y2);await sleep(70);};
const shot=async n=>{const s=await send('Page.captureScreenshot',{format:'png'});writeFileSync(`/tmp/${n}.png`,Buffer.from(s.data,'base64'));};

for(let i=0;i<100;i++){if((await evx('!!window.__draw'))===true)break;await sleep(200);}
await evx('window.__draw.clear(); window.__draw.setTool("selection");'); await sleep(150);
let pass=true;

// place a small icon centered at viewport (720,420), then DESELECT so we test real click-to-select.
const placed=await evx(`(async()=>{const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#1971c2"/></svg>';const f=new File([svg],'icon.svg',{type:'image/svg+xml'});await window.__draw.placeImage(f,720,420);await new Promise(r=>setTimeout(r,250));window.__draw.deselect();const e=[...window.__draw.scene.elements].reverse().find(x=>x.type==='image');return e?{x:Math.round(e.x),y:Math.round(e.y),w:Math.round(e.width),h:Math.round(e.height)}:{none:true};})()`);
console.log('placed (then deselected):', JSON.stringify(placed));
// scene→screen at zoom1/scroll0/offset0 is identity; center:
const cx = placed.x + placed.w/2, cy = placed.y + placed.h/2;

// 1) SELECT by clicking the body
await click(cx, cy);
const sel=await evx('(()=>({n:window.__draw.selectedElements.length, type:window.__draw.selectedElements[0]&&window.__draw.selectedElements[0].type}))()');
const selOk = sel.n===1 && sel.type==='image'; pass=pass&&selOk;
console.log('1) select-by-click:', JSON.stringify(sel), '| ok?', selOk);
await shot('icon-1-selected');

// 2) MOVE by dragging the body +150,+90
const before=await evx('(()=>{const e=window.__draw.selectedElements[0];return{x:Math.round(e.x),y:Math.round(e.y)};})()');
await drag(cx, cy, cx+150, cy+90);
const moved=await evx('(()=>{const e=window.__draw.scene.elements.find(x=>x.type==="image");return{x:Math.round(e.x),y:Math.round(e.y)};})()');
const movedOk = Math.abs(moved.x-before.x-150)<=4 && Math.abs(moved.y-before.y-90)<=4; pass=pass&&movedOk;
console.log('2) move:', JSON.stringify(moved), 'expected ~', {x:before.x+150,y:before.y+90}, '| ok?', movedOk);
await shot('icon-2-moved');

// 3) RESIZE by dragging the SE corner handle outward +80,+80 (screen == scene here)
const se=await evx('(()=>{const e=window.__draw.scene.elements.find(x=>x.type==="image");return{x:Math.round(e.x+e.width),y:Math.round(e.y+e.height),w:Math.round(e.width),h:Math.round(e.height)};})()');
await drag(se.x, se.y, se.x+80, se.y+80);
const resized=await evx('(()=>{const e=window.__draw.scene.elements.find(x=>x.type==="image");return{w:Math.round(e.width),h:Math.round(e.height)};})()');
const resizeOk = resized.w > se.w+20 && resized.h > se.h+20; pass=pass&&resizeOk;
console.log('3) resize SE handle:', JSON.stringify(resized), 'from', se.w+'x'+se.h, '| grew?', resizeOk);
await shot('icon-3-resized');

console.log('\n'+(pass?'ICON FULLY INTERACTIVE ✓ (select + move + resize via real pointer events)':'ICON INTERACTION FAILED ✗'));
ws.close();chrome.kill();process.exit(pass?0:1);
