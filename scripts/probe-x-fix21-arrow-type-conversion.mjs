// Fix-21 verification — changeArrowType must rebuild arrows from absolute
// endpoints, reset elbow angle/origin, and preserve/rebind endpoints. Mirrors
// actionProperties.tsx:1803-1965.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const URL = 'http://localhost:1420/x';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lf-fix21',
  '--window-size=1440,900',
  URL,
]);

async function discover() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/json`);
      const target = (await response.json()).find(
        (entry) => entry.type === 'page' && entry.webSocketDebuggerUrl,
      );
      if (target) {
        return target.webSocketDebuggerUrl;
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

await new Promise((resolve) => {
  ws.onopen = resolve;
});

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
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        JSON.stringify(result.exceptionDetails),
    );
  }
  return result.result.value;
};

let ready = false;
for (let i = 0; i < 80; i++) {
  if ((await ev('!!window.__draw')) === true) {
    ready = true;
    break;
  }
  await sleep(250);
}
if (!ready) {
  throw new Error('window.__draw did not initialize');
}

const result = JSON.parse(
  await ev(`
    (() => {
      const d = window.__draw;
      const mods = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
      const within = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
      const draw = (tool, x1, y1, x2, y2) => {
        d.setTool(tool);
        d.pointerDown(x1, y1, mods);
        d.pointerMove(x2, y2, mods);
        d.pointerUp(x2, y2);
        return d.scene.elements.at(-1);
      };
      const reset = () => {
        d.clear();
        d.appState.setState({
          zoom: { value: 1 },
          scrollX: 0,
          scrollY: 0,
          offsetLeft: 0,
          offsetTop: 0,
          width: 1440,
          height: 900,
          isBindingEnabled: true,
          bindMode: 'orbit',
        });
      };
      const centerOf = (arrow) => ({
        x: arrow.x + arrow.width / 2,
        y: arrow.y + arrow.height / 2,
      });
      const rotate = (point, center, angle) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        return {
          x: center.x + dx * cos - dy * sin,
          y: center.y + dx * sin + dy * cos,
        };
      };
      const endpoints = (arrow) => {
        const center = centerOf(arrow);
        const first = arrow.points[0];
        const last = arrow.points.at(-1);
        return {
          start: rotate(
            { x: arrow.x + first[0], y: arrow.y + first[1] },
            center,
            arrow.angle,
          ),
          end: rotate(
            { x: arrow.x + last[0], y: arrow.y + last[1] },
            center,
            arrow.angle,
          ),
        };
      };
      const orthogonal = (arrow) =>
        arrow.points
          .slice(1)
          .every((point, index) => {
            const prev = arrow.points[index];
            return within(point[0], prev[0], 0.1) || within(point[1], prev[1], 0.1);
          });

      reset();
      d.setArrowType('sharp');
      const rotated = draw('arrow', 260, 260, 520, 390);
      d.setTool('selection');
      d.selectAll();
      d.scene.scene.mutateElement(rotated, { angle: Math.PI / 7 });
      const rotatedBefore = endpoints(rotated);
      d.alignSelected('center', 'x');
      d.setArrowType('elbow');
      const elbow = d.scene.elements.find((el) => el.id === rotated.id);
      const elbowEndpoints = endpoints(elbow);
      const elbowOk =
        elbow.elbowed === true &&
        elbow.angle === 0 &&
        within(elbow.x, rotatedBefore.start.x) &&
        within(elbow.y, rotatedBefore.start.y) &&
        within(elbowEndpoints.start.x, rotatedBefore.start.x) &&
        within(elbowEndpoints.start.y, rotatedBefore.start.y) &&
        within(elbowEndpoints.end.x, rotatedBefore.end.x) &&
        within(elbowEndpoints.end.y, rotatedBefore.end.y) &&
        elbow.points.length >= 2 &&
        orthogonal(elbow);

      d.setArrowType('round');
      const round = d.scene.elements.find((el) => el.id === rotated.id);
      const roundEndpoints = endpoints(round);
      const roundOk =
        round.elbowed === false &&
        round.roundness?.type === 2 &&
        round.points.length === 2 &&
        within(roundEndpoints.start.x, rotatedBefore.start.x) &&
        within(roundEndpoints.start.y, rotatedBefore.start.y) &&
        within(roundEndpoints.end.x, rotatedBefore.end.x) &&
        within(roundEndpoints.end.y, rotatedBefore.end.y);

      reset();
      d.setBackgroundColor('#a5d8ff');
      d.setFillStyle('solid');
      const startBox = draw('rectangle', 220, 260, 320, 360);
      const endBox = draw('rectangle', 620, 260, 720, 360);
      d.setArrowType('sharp');
      const bound = draw('arrow', 270, 310, 670, 310);
      d.setTool('selection');
      d.selectAll();
      const boundBefore = {
        start: bound.startBinding?.elementId ?? null,
        end: bound.endBinding?.elementId ?? null,
      };
      d.setArrowType('elbow');
      const boundElbow = d.scene.elements.find((el) => el.id === bound.id);
      const boundElbowState = {
        start: boundElbow.startBinding?.elementId ?? null,
        end: boundElbow.endBinding?.elementId ?? null,
        startFixed: !!boundElbow.startBinding?.fixedPoint,
        endFixed: !!boundElbow.endBinding?.fixedPoint,
      };
      d.setArrowType('sharp');
      const boundSharp = d.scene.elements.find((el) => el.id === bound.id);
      const boundSharpState = {
        start: boundSharp.startBinding?.elementId ?? null,
        end: boundSharp.endBinding?.elementId ?? null,
      };
      const bindingOk =
        boundBefore.start === startBox.id &&
        boundBefore.end === endBox.id &&
        boundElbowState.start === startBox.id &&
        boundElbowState.end === endBox.id &&
        boundElbowState.startFixed &&
        boundElbowState.endFixed &&
        boundSharpState.start === startBox.id &&
        boundSharpState.end === endBox.id;

      return JSON.stringify({
        rotated: {
          before: {
            start: {
              x: Math.round(rotatedBefore.start.x),
              y: Math.round(rotatedBefore.start.y),
            },
            end: {
              x: Math.round(rotatedBefore.end.x),
              y: Math.round(rotatedBefore.end.y),
            },
          },
          elbow: {
            x: Math.round(elbow.x),
            y: Math.round(elbow.y),
            angle: elbow.angle,
            nPoints: elbow.points.length,
            orthogonal: orthogonal(elbow),
            endpoints: {
              start: {
                x: Math.round(elbowEndpoints.start.x),
                y: Math.round(elbowEndpoints.start.y),
              },
              end: {
                x: Math.round(elbowEndpoints.end.x),
                y: Math.round(elbowEndpoints.end.y),
              },
            },
            ok: elbowOk,
          },
          round: {
            elbowed: round.elbowed,
            roundness: round.roundness,
            nPoints: round.points.length,
            endpoints: {
              start: {
                x: Math.round(roundEndpoints.start.x),
                y: Math.round(roundEndpoints.start.y),
              },
              end: {
                x: Math.round(roundEndpoints.end.x),
                y: Math.round(roundEndpoints.end.y),
              },
            },
            ok: roundOk,
          },
        },
        binding: {
          before: boundBefore,
          elbow: boundElbowState,
          sharp: boundSharpState,
          ok: bindingOk,
        },
        ok: elbowOk && roundOk && bindingOk,
      });
    })()
  `),
);

console.log('--- Bug #21 differential: arrow type conversion rebuilds geometry/bindings ---');
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? 'PASS: arrow type conversion matches upstream geometry rule' : 'FAIL');

ws.close();
chrome.kill();
process.exit(result.ok ? 0 : 1);
