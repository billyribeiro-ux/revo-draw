// Fix-02 verification — multi-point line/arrow creation.
// Upstream keeps a clicked line/arrow as multiElement: pointer move rubber-bands
// the active segment, subsequent clicks commit points, and Enter/Escape/dbl-click
// finalize into selected linear-editor state.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9342;
const URL = 'http://localhost:1420/x';
const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix02-multipoint',
  '--window-size=1440,900',
  URL
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      const t = (await r.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) {
        return t.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('no cdp');
}

const ws = new WebSocket(await discover());
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const messageId = ++id;
    pending.set(messageId, resolve);
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });

await new Promise((resolve) => (ws.onopen = resolve));
ws.onmessage = (event) => {
  const message = JSON.parse(event.data.toString());
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
};
await send('Runtime.enable');

const ev = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails);
    throw new Error(description);
  }
  return result.result.value;
};

const key = async (keyName) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code: keyName });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code: keyName });
  await sleep(60);
};

for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}
await ev(`window.__draw.clear(); localStorage.clear(); location.reload()`);
await sleep(1500);
for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    break;
  }
  await sleep(250);
}

const snapshot = () =>
  ev(`(() => {
    const d = window.__draw;
    const e = d.scene.elements[0] ?? null;
    return e ? {
      type: e.type,
      points: e.points?.map((point) => [Math.round(point[0]), Math.round(point[1])]) ?? null,
      polygon: e.polygon ?? null,
      activeTool: d.activeTool,
      creating: d.isCreatingLinearElement,
      selected: d.selectedIds.has(e.id),
      linearEditor: d.appState.current.selectedLinearElement ? {
        isEditing: d.appState.current.selectedLinearElement.isEditing,
        elementId: d.appState.current.selectedLinearElement.elementId,
      } : null
    } : {
      type: null,
      points: null,
      polygon: null,
      activeTool: d.activeTool,
      creating: d.isCreatingLinearElement,
      selected: false,
      linearEditor: null
    };
  })()`);

const runEnterScenario = async () => {
  await ev(`(() => {
    const d = window.__draw;
    d.clear();
    d.appState.setState({ zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0, width: 1440, height: 900 });
    d.setTool('line');
    d.pointerDown(300, 300, {});
    d.pointerUp();
    d.pointerMove(360, 320, {});
  })()`);
  const afterStart = await snapshot();
  await ev(`(() => {
    const d = window.__draw;
    d.pointerDown(360, 320, {});
    d.pointerUp();
    d.pointerMove(420, 360, {});
  })()`);
  const afterSecond = await snapshot();
  await ev(`(() => {
    const d = window.__draw;
    d.pointerDown(420, 360, {});
    d.pointerUp();
    d.pointerMove(480, 420, {});
  })()`);
  const beforeEnter = await snapshot();
  await key('Enter');
  const afterEnter = await snapshot();
  return { afterStart, afterSecond, beforeEnter, afterEnter };
};

const runEscapeScenario = async () => {
  await ev(`(() => {
    const d = window.__draw;
    d.clear();
    d.setTool('arrow');
    d.pointerDown(260, 260, {});
    d.pointerUp();
    d.pointerMove(330, 300, {});
    d.pointerDown(330, 300, {});
    d.pointerUp();
    d.pointerMove(400, 340, {});
  })()`);
  const beforeEscape = await snapshot();
  await key('Escape');
  const afterEscape = await snapshot();
  return { beforeEscape, afterEscape };
};

const runDoubleClickScenario = async () =>
  ev(`(() => {
    const d = window.__draw;
    d.clear();
    d.setTool('line');
    d.pointerDown(220, 420, {});
    d.pointerUp();
    d.pointerMove(300, 450, {});
    d.pointerDown(300, 450, {});
    d.pointerUp();
    d.pointerMove(380, 480, {});
    const beforeDoubleClick = {
      points: d.scene.elements[0].points.map((point) => [Math.round(point[0]), Math.round(point[1])]),
      creating: d.isCreatingLinearElement
    };
    d.doubleClickAt(380, 480);
    const e = d.scene.elements[0];
    return {
      beforeDoubleClick,
      afterDoubleClick: {
        points: e.points.map((point) => [Math.round(point[0]), Math.round(point[1])]),
        creating: d.isCreatingLinearElement,
        selected: d.selectedIds.has(e.id),
        activeTool: d.activeTool,
        linearEditor: d.appState.current.selectedLinearElement ? {
          isEditing: d.appState.current.selectedLinearElement.isEditing,
          elementId: d.appState.current.selectedLinearElement.elementId,
        } : null
      }
    };
  })()`);

const enterScenario = await runEnterScenario();
const escapeScenario = await runEscapeScenario();
const doubleClickScenario = await runDoubleClickScenario();

const enterOk =
  enterScenario.afterStart.creating === true &&
  enterScenario.afterStart.points.length === 2 &&
  enterScenario.afterStart.points[1][0] === 60 &&
  enterScenario.afterStart.points[1][1] === 20 &&
  enterScenario.afterSecond.creating === true &&
  enterScenario.afterSecond.points.length === 3 &&
  enterScenario.beforeEnter.points.length === 4 &&
  enterScenario.afterEnter.creating === false &&
  enterScenario.afterEnter.points.length === 3 &&
  enterScenario.afterEnter.selected === true &&
  enterScenario.afterEnter.linearEditor?.isEditing === false;

const escapeOk =
  escapeScenario.beforeEscape.creating === true &&
  escapeScenario.beforeEscape.points.length === 3 &&
  escapeScenario.afterEscape.creating === false &&
  escapeScenario.afterEscape.type === 'arrow' &&
  escapeScenario.afterEscape.points.length === 2 &&
  escapeScenario.afterEscape.selected === true &&
  escapeScenario.afterEscape.linearEditor?.isEditing === false;

const doubleClickOk =
  doubleClickScenario.beforeDoubleClick.creating === true &&
  doubleClickScenario.afterDoubleClick.creating === false &&
  doubleClickScenario.afterDoubleClick.points.length === 3 &&
  doubleClickScenario.afterDoubleClick.selected === true &&
  doubleClickScenario.afterDoubleClick.linearEditor?.isEditing === false;

const ok = enterOk && escapeOk && doubleClickOk;
console.log('--- Bug #2 differential: multi-point line/arrow creation state machine ---');
console.log(JSON.stringify(
  {
    enterScenario,
    enterOk,
    escapeScenario,
    escapeOk,
    doubleClickScenario,
    doubleClickOk,
    ok
  },
  null,
  2
));
console.log(ok ? 'PASS: multi-point linear creation supports rubber-band, click commits, Enter/Escape, and double-click finalize' : 'FAIL');

ws.close();
chrome.kill();
process.exit(ok ? 0 : 1);
