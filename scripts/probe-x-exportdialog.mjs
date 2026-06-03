// Milestone D (UI): the "Save as image" dialog opens from the main menu and offers PNG + SVG.
// Drives the real menu → item via DOM clicks (reliable for buttons), asserts the dialog DOM,
// screenshots it.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9271;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-xexportdlg',
  '--window-size=1440,900', URL
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no cdp');
}

const ws = new WebSocket(await discover());
let id = 0;
const pending = new Map();
const send = (m, pr = {}) =>
  new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
await send('Page.enable');

const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }
await ev(`window.__draw.clear()`);
await ev(`(() => { const d = window.__draw; d.setTool('rectangle'); d.pointerDown(320,220); d.pointerMove(480,340); d.pointerUp(); })()`);

// open the main menu (hamburger), then click the "Save as image" item by text
const opened = await ev(`(() => {
  const menuBtn = document.querySelector('button[aria-label="menu"]');
  if (!menuBtn) return 'no-menu-btn';
  menuBtn.click();
  return true;
})()`);
await sleep(120);
const clickedItem = await ev(`(() => {
  const items = [...document.querySelectorAll('button, [role="menuitem"]')];
  const it = items.find((el) => /save as image/i.test(el.textContent || ''));
  if (!it) return 'no-item';
  it.click();
  return true;
})()`);
await sleep(150);

const dlg = await ev(`(() => {
  const d = document.querySelector('.exp-dialog');
  if (!d) return null;
  const cards = [...d.querySelectorAll('.exp-card')].map((c) => c.querySelector('.exp-card-fmt')?.textContent?.trim());
  return { present: true, title: d.querySelector('.exp-title')?.textContent?.trim(), cards };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/x-exportdialog.png', Buffer.from(shot.data, 'base64'));

console.log('menu opened:', opened, 'item clicked:', clickedItem);
console.log('dialog:', JSON.stringify(dlg));
console.log('screenshot -> /tmp/x-exportdialog.png');

const ok = dlg && dlg.present && dlg.title === 'Save as image' &&
  dlg.cards.includes('PNG') && dlg.cards.includes('SVG');
console.log(ok ? 'PASS: export dialog opens from menu with PNG + SVG options' : 'FAIL');
ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
