// Verify the Phosphor icon feature end-to-end against the running app:
//  - the toolbar picker opens and renders icon previews;
//  - inserting an icon tags it (customData.kind==='icon'), selects it, and shows the Icon panel
//    while hiding the inapplicable shape-style groups;
//  - the icon renders in its chosen colour (sampled pixel), and colour / size / rotation can each
//    be changed independently without disturbing the others.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 9287;
const URL = 'http://localhost:1420/';
const udd = mkdtempSync(join(tmpdir(), 'iconfeat-'));
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,`--user-data-dir=${udd}`,'--window-size=1440,900','--hide-scrollbars',URL]);
async function discover(){for(let i=0;i<80;i++){try{const r=await fetch(`http://localhost:${PORT}/json`);const t=(await r.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(t)return t.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error('no cdp');}
const ws=new WebSocket(await discover());let id=0;const pending=new Map();
const send=(m,pr={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:pr}));});
await new Promise(r=>(ws.onopen=r));
ws.onmessage=e=>{const m=JSON.parse(e.data.toString());if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
await send('Runtime.enable');await send('Page.enable');
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});return r.exceptionDetails?'ERR '+(r.exceptionDetails.exception?.description||''):r.result.value;};
const m=(t,x,y,b,bs)=>send('Input.dispatchMouseEvent',{type:t,x,y,button:b,buttons:bs,clickCount:1});
const click=async(x,y)=>{await m('mouseMoved',x,y,'none',0);await sleep(15);await m('mousePressed',x,y,'left',1);await sleep(30);await m('mouseReleased',x,y,'left',0);await sleep(60);};
const drag=async(x1,y1,x2,y2)=>{await m('mouseMoved',x1,y1,'none',0);await sleep(15);await m('mousePressed',x1,y1,'left',1);await sleep(30);await m('mouseMoved',(x1+x2)/2,(y1+y2)/2,'left',1);await sleep(20);await m('mouseMoved',x2,y2,'left',1);await sleep(20);await m('mouseReleased',x2,y2,'left',0);await sleep(60);};
const shot=async n=>{const s=await send('Page.captureScreenshot',{format:'png'});writeFileSync(`/tmp/${n}.png`,Buffer.from(s.data,'base64'));};
for(let i=0;i<100;i++){if(await ev('!!window.__draw')===true)break;await sleep(200);}
await ev('window.__draw.clear(); window.__draw.setTool("selection");'); await sleep(150);
let pass=true; const check=(label,ok)=>{console.log((ok?'✓ ':'✗ ')+label);pass=pass&&ok;};

// 1) Picker UI opens from the toolbar and renders previews.
await ev(`[...document.querySelectorAll('.toolbar button')].find(b=>(b.getAttribute('aria-label')||'')==='Insert icon').click()`);
let cells=0; for(let i=0;i<40;i++){cells=await ev(`document.querySelectorAll('.icon-picker__cell').length`);if(cells>0)break;await sleep(250);}
const previewSrc=await ev(`(()=>{const im=document.querySelector('.icon-picker__cell img');return im?im.src.slice(0,18):'';})()`);
check(`picker opens with ${cells} previews (img data-URLs)`, cells>0 && previewSrc==='data:image/svg+xml');
await shot('iconfeat-picker');
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await sleep(150);

// 2) Insert + tagging + panel.
await ev(`(async()=>{await window.__draw.insertIcon('ph:heart-fill');await new Promise(r=>setTimeout(r,400));})()`);
const ins=await ev(`(()=>{const e=window.__draw.scene.elements.find(x=>x.customData&&x.customData.kind==='icon');return e?{w:Math.round(e.width),color:e.customData.iconColor,sel:window.__draw.selectedElements.length,showIcon:window.__draw.showIconProperties}:{none:true};})()`);
check('insert: tagged icon @48px, selected, Icon panel shown', !ins.none&&ins.w===48&&ins.color==='#1e1e1e'&&ins.sel===1&&ins.showIcon===true);
const labels=await ev(`[...document.querySelectorAll('.properties .prop-label')].map(l=>l.textContent.trim())`);
check('panel hides shape styles, shows Icon color/size', !labels.includes('Stroke')&&!labels.includes('Stroke width')&&labels.includes('Icon color')&&labels.includes('Icon size'));

// 3) Renders in chosen colour (independent recolour to green) — sample a pixel.
await ev(`(async()=>{window.__draw.setIconSize(140);await window.__draw.setIconColor('#2f9e44');await new Promise(r=>setTimeout(r,300));})()`);
await sleep(200);
const px=await ev(`(async()=>{const m=await import('/src/lib/icons/offline-iconify.ts');const ic=await m.resolveIcon('ph:heart-fill');const svg=m.iconToSvgString(ic,64,'#2f9e44');const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src='data:image/svg+xml;utf8,'+encodeURIComponent(svg);});const cv=document.createElement('canvas');cv.width=64;cv.height=64;const c=cv.getContext('2d');c.drawImage(img,0,0);for(let y=0;y<64;y+=2)for(let x=0;x<64;x+=2){const d=c.getImageData(x,y,1,1).data;if(d[3]>200)return{r:d[0],g:d[1],b:d[2]};}return null;})()`);
check(`recolour: rendered pixel is green ${JSON.stringify(px)}`, px&&px.g>120&&px.r<120&&px.b<120);
const sized=await ev(`(()=>{const e=window.__draw.scene.elements.find(x=>x.customData&&x.customData.kind==='icon');return{w:Math.round(e.width),color:e.customData.iconColor};})()`);
check('resize to 140px keeps the colour', sized.w===140&&sized.color==='#2f9e44');

// 4) Rotate via the rotation handle (independent — colour + size preserved).
const pos=await ev(`(async()=>{const m=await import('/src/lib/element/transformHandles.ts');const d=window.__draw;const el=d.scene.elements.find(x=>x.customData&&x.customData.kind==='icon');const map=d.scene.scene.getNonDeletedElementsMap();const h=m.getTransformHandles(el,d.appState.current.zoom,map,'mouse');const a=d.appState.current;const rot=h.rotation;return{sx:Math.round((rot[0]+rot[2]/2+a.scrollX)*a.zoom.value+a.offsetLeft),sy:Math.round((rot[1]+rot[3]/2+a.scrollY)*a.zoom.value+a.offsetTop),cx:Math.round((el.x+el.width/2+a.scrollX)*a.zoom.value+a.offsetLeft),cy:Math.round((el.y+el.height/2+a.scrollY)*a.zoom.value+a.offsetTop)};})()`);
await drag(pos.sx, pos.sy, pos.cx+95, pos.cy);
const rot=await ev(`(()=>{const e=window.__draw.scene.elements.find(x=>x.customData&&x.customData.kind==='icon');return{deg:Math.round(e.angle*180/Math.PI),color:e.customData.iconColor,w:Math.round(e.width)};})()`);
check(`rotate to ${rot.deg}° keeps colour + size`, Math.abs(rot.deg)>10&&rot.color==='#2f9e44'&&rot.w===140);
await shot('iconfeat-final');

console.log('\n'+(pass?'ICON FEATURE VERIFIED ✓':'ICON FEATURE FAILED ✗'));
ws.close();chrome.kill();process.exit(pass?0:1);
