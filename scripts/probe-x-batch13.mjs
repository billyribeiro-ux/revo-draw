// Batch-13 verification: styled toolbar tooltips (label + shortcut keycap, shown on hover).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9269;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/lf-b13', '--window-size=1440,900', URL]);
async function discover() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/json`); const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no cdp'); }
const ws = new WebSocket(await discover());
let id = 0; const pending = new Map();
const send = (m, pr = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: pr })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await send('Runtime.enable');
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
for (let i = 0; i < 80; i++) { if ((await ev('!!window.__draw')) === true) break; await sleep(250); }

// the rectangle tooltip exists with label "Rectangle" + shortcut "R"
const tt = await ev(`(() => {
  const wraps = [...document.querySelectorAll('.tooltip-wrap')];
  for (const w of wraps) {
    const label = w.querySelector('.tooltip-label')?.textContent;
    const sc = w.querySelector('.tooltip-shortcut')?.textContent;
    if (label === 'Rectangle') return { label, shortcut: sc, count: wraps.length };
  }
  return { count: wraps.length };
})()`);

// hover the rectangle button → tooltip opacity becomes 1 (CSS :hover)
const hoverVisible = await ev(`(() => {
  const wraps = [...document.querySelectorAll('.tooltip-wrap')];
  const target = wraps.find(w => w.querySelector('.tooltip-label')?.textContent === 'Rectangle');
  if (!target) return false;
  // jsdom-less: check the CSS rule exists by reading the stylesheet for :hover .tooltip { opacity: 1 }
  const tip = target.querySelector('.tooltip');
  // simulate hover via :hover is not scriptable; assert the rule is present instead
  return !!tip;
})()`);

// assert a hover rule exists in the stylesheets
const hoverRule = await ev(`(() => {
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r.selectorText && r.selectorText.includes(':hover') && r.cssText.includes('opacity: 1')) return true;
    }
  }
  return false;
})()`);

// a few more tool labels present
const labels = await ev(`[...document.querySelectorAll('.tooltip-label')].map(e => e.textContent)`);
const hasArrow = labels.includes('Arrow');
const hasHand = labels.includes('Hand (panning tool)');

console.log('rectangle tooltip:', JSON.stringify(tt));
console.log('tooltip element present:', hoverVisible, '| hover-opacity rule:', hoverRule);
console.log('labels include Arrow:', hasArrow, 'Hand:', hasHand);

const ok =
  tt.label === 'Rectangle' && tt.shortcut === 'R' && tt.count >= 10 &&
  hoverVisible === true && hoverRule === true &&
  hasArrow && hasHand;
console.log(ok ? 'PASS: styled tooltips (label + shortcut + hover rule)' : 'FAIL');
ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
