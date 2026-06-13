import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function getProbePort() {
  if (process.env.CDP_PORT) {
    return Number(process.env.CDP_PORT);
  }
  const offset = (process.pid + Date.now()) % 1000;
  return 40_000 + offset;
}

export function launchChrome({ url, prefix, width = 1440, height = 900 }) {
  const isGoogleChrome = CHROME.includes('Google Chrome.app');
  if (isGoogleChrome && process.env.ALLOW_GOOGLE_CHROME_PROBES !== '1') {
    throw new Error(
      'Refusing to launch Google Chrome probes because Chrome is unstable. ' +
        'Set ALLOW_GOOGLE_CHROME_PROBES=1 only when running the legacy CDP harness intentionally.',
    );
  }

  const port = getProbePort();
  const userDataDir = mkdtempSync(join(tmpdir(), `${prefix}-${process.pid}-`));
  const chrome = spawn(CHROME, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    url,
  ]);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    chrome.kill();
    rmSync(userDataDir, { recursive: true, force: true });
  };

  const cleanExit = (signal) => {
    cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', cleanExit);
  process.once('SIGTERM', cleanExit);

  return { chrome, port, userDataDir, cleanup };
}
