// Verify all fixes against the running app with hard evidence + screenshots.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 9281;
const URL = 'http://localhost:1420/';
const udd = mkdtempSync(join(tmpdir(), 'verify-'));
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,`--user-data-dir=${udd}`,'--window-size=1440,900','--hide-scrollbars',URL]);
async function discover(){for(let i=0;i<80;i++){try{const r=await fetch(`http://localhost:${PORT}/json`);const t=(await r.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(t)return t.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error('no cdp');}
const ws=new WebSocket(await discover());let id=0;const pending=new Map();
const send=(m,pr={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:pr}));});
await new Promise(r=>(ws.onopen=r));
ws.onmessage=e=>{const m=JSON.parse(e.data.toString());if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
await send('Runtime.enable');await send('Page.enable');
const evx=async x=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return 'ERR '+(r.exceptionDetails.exception?.description??JSON.stringify(r.exceptionDetails));return r.result.value;};
const move=(x,y,b=0)=>send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:b?'left':'none',buttons:b});
const rdown=(x,y)=>send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'right',buttons:2,clickCount:1});
const rup=(x,y)=>send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'right',buttons:2,clickCount:1});
const down=(x,y)=>send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
const up=(x,y)=>send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
const drag=async(x1,y1,x2,y2)=>{await move(x1,y1);await sleep(15);await down(x1,y1);await sleep(25);await move((x1+x2)/2,(y1+y2)/2,1);await sleep(20);await move(x2,y2,1);await sleep(20);await up(x2,y2);await sleep(50);};
const shot=async n=>{const s=await send('Page.captureScreenshot',{format:'png'});writeFileSync(`/tmp/${n}.png`,Buffer.from(s.data,'base64'));};

for(let i=0;i<100;i++){if((await evx('!!window.__draw'))===true)break;await sleep(200);}
await evx('window.__draw.clear()');await sleep(200);
let pass=true;

// ---- FIX A: tooltip renders BELOW the toolbar buttons ----
console.log('\n=== FIX A: tooltip below the toolbar ===');
// hover a tool button (the rectangle tool) to reveal its tooltip
const btn = await evx(`(()=>{const b=[...document.querySelectorAll('.toolbar .tool-btn')].find(b=>/Rectangle/.test(b.getAttribute('aria-label')||''));if(!b)return null;const r=b.getBoundingClientRect();return{cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),bottom:Math.round(r.bottom),top:Math.round(r.top)};})()`);
await move(btn.cx, btn.cy); await sleep(250);
const tip = await evx(`(()=>{const wraps=[...document.querySelectorAll('.toolbar .tooltip-wrap')];for(const w of wraps){const t=w.querySelector('.tooltip');if(t&&getComputedStyle(t).opacity!=='0'){const r=t.getBoundingClientRect();return{top:Math.round(r.top),bottom:Math.round(r.bottom),visible:true};}}return{visible:false};})()`);
console.log('button:', JSON.stringify(btn), 'tooltip:', JSON.stringify(tip));
const tipBelow = tip.visible && tip.top >= btn.bottom - 2;
console.log('tooltip is BELOW the bar?', tipBelow); pass = pass && tipBelow;
await shot('verify-A-tooltip');
await move(720, 400); await sleep(100); // move away

// ---- FIX B: context menu clamps to viewport (not cut off at bottom) ----
console.log('\n=== FIX B: right-click near bottom edge → menu stays on screen ===');
const vh = await evx('window.innerHeight'); const vw = await evx('window.innerWidth');
await evx('window.__draw.setTool("selection")');
const ry = vh - 12; // 12px from the bottom — worst case
await move(900, ry); await sleep(20); await rdown(900, ry); await sleep(20); await rup(900, ry); await sleep(150);
const menu = await evx(`(()=>{const m=document.querySelector('.context-menu');if(!m)return{none:true};const r=m.getBoundingClientRect();return{top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),h:Math.round(r.height)};})()`);
console.log('viewport',vw+'x'+vh,'click y',ry,'menu:', JSON.stringify(menu));
const onScreen = !menu.none && menu.bottom <= vh && menu.top >= 0 && menu.right <= vw && menu.left >= 0;
console.log('context menu fully on-screen?', onScreen); pass = pass && onScreen;
await shot('verify-B-contextmenu');
await evx('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await sleep(100);

// ---- FIX C: inserted icon/image has a usable size ----
console.log('\n=== FIX C: small SVG icon placed at a usable size ===');
await evx('window.__draw.clear()'); await sleep(50);
const img = await evx(`(async()=>{const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#1971c2"/></svg>';const f=new File([svg],'icon.svg',{type:'image/svg+xml'});await window.__draw.placeImage(f,720,420);await new Promise(r=>setTimeout(r,250));const e=[...window.__draw.scene.elements].reverse().find(e=>e.type==='image');return e?{w:Math.round(e.width),h:Math.round(e.height)}:{none:true};})()`);
console.log('placed icon size:', JSON.stringify(img));
const usable = !img.none && Math.max(img.w,img.h) >= 80;
console.log('icon usable (>=80px)?', usable); pass = pass && usable;
await shot('verify-C-icon');

// ---- FIX D: canvas tracks a window resize ----
console.log('\n=== FIX D: resize → canvas backing store + viewport track it ===');
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:640,deviceScaleFactor:1,mobile:false});
await sleep(300);
const after = await evx(`(()=>{const c=document.querySelector('canvas.layer');const wrap=document.querySelector('.canvas-wrap');const a=window.__draw.appState.current;return{docW:document.documentElement.clientWidth,wrapW:wrap.clientWidth,canvasAttrW:c.width,canvasStyleW:c.style.width,vpW:a.width,vpH:a.height};})()`);
console.log('after resize to 1000x640:', JSON.stringify(after));
const tracks = after.wrapW===1000 && after.vpW===1000 && after.canvasStyleW==='1000px';
console.log('canvas tracks resize?', tracks); pass = pass && tracks;
await shot('verify-D-resize');

console.log('\n=================');
console.log(pass ? 'ALL FIXES VERIFIED ✓' : 'SOME CHECKS FAILED ✗');
ws.close();chrome.kill();process.exit(pass?0:1);
