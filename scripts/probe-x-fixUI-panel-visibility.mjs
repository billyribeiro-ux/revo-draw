import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9322, URL='http://localhost:1420/x';
const chrome=spawn(CHROME,['--headless','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/lf-fixui','--window-size=1440,900',URL]);
async function disc(){for(let i=0;i<60;i++){try{const r=await fetch(`http://localhost:${PORT}/json`);const t=(await r.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(t)return t.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error('no cdp');}
const ws=new WebSocket(await disc());let id=0;const p=new Map();
const send=(m,pr={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:pr}));});
await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{const m=JSON.parse(e.data.toString());if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}};
await send('Runtime.enable');
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true});return r.result?.value;};
for(let i=0;i<80;i++){if((await ev('!!window.__draw'))===true)break;await sleep(250);}
await ev(`window.__draw.clear(); window.__draw.setTool('selection'); window.__draw.deselect();`); await sleep(50);
const emptySelTool = await ev(`window.__draw.showProperties`); // expect false
await ev(`window.__draw.setTool('rectangle');`); await sleep(30);
const drawTool = await ev(`window.__draw.showProperties`); // expect true
await ev(`window.__draw.setTool('selection'); window.__draw.pointerDown(300,250,{}); window.__draw.pointerUp(300,250,{});`); // empty click = no sel
await ev(`window.__draw.setTool('rectangle'); window.__draw.pointerDown(300,250,{}); window.__draw.pointerMove(380,330,{}); window.__draw.pointerUp(380,330,{}); window.__draw.setTool('selection'); window.__draw.selectAll();`); await sleep(40);
const withSelection = await ev(`window.__draw.showProperties`); // expect true (element selected)
const statsDefault = await ev(`window.__draw.statsOpen`); // expect false
console.log(JSON.stringify({ emptySelTool, drawTool, withSelection, statsDefault }));
const ok = emptySelTool===false && drawTool===true && withSelection===true && statsDefault===false;
console.log(ok ? 'PASS: panel hidden on empty+selection, shown on draw-tool/selection; stats off by default' : 'FAIL');
ws.close();chrome.kill();process.exit(ok?0:1);
