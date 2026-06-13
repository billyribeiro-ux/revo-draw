// Runs every browser-level /x probe sequentially and writes a JSON report.
import { spawn } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';

const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 60_000);
const outPath = process.env.FORENSIC_OUT ?? '/tmp/revo-draw-forensic-probes.json';
const scriptsDir = new URL('.', import.meta.url);

const probes = [
  'probe-web-root.mjs',
  ...readdirSync(scriptsDir)
    .filter((name) => /^probe-x-.*\.mjs$/.test(name))
    .sort(),
];

if (process.env.ALLOW_GOOGLE_CHROME_PROBES !== '1') {
  const results = probes.map((name) => ({
    name,
    status: 'skipped',
    code: null,
    signal: null,
    durationMs: 0,
    stdout: '',
    stderr:
      'Skipped: legacy probes launch /Applications/Google Chrome.app directly. ' +
      'Set ALLOW_GOOGLE_CHROME_PROBES=1 to run them intentionally.',
  }));
  const summary = {
    total: results.length,
    passed: 0,
    failed: 0,
    skipped: results.length,
    results,
  };
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`forensic report -> ${outPath}`);
  console.log(
    `SUMMARY total=${summary.total} passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped}`,
  );
  console.log('SKIPPED: legacy Chrome/CDP probes are disabled to avoid crashing Google Chrome.');
  process.exit(0);
}

function runProbe(name) {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn('node', [join(scriptsDir.pathname, name)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const durationMs = Math.round(performance.now() - started);
      resolve({
        name,
        status: code === 0 ? 'passed' : 'failed',
        code,
        signal,
        durationMs,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

const results = [];
for (const probe of probes) {
  process.stdout.write(`RUN ${probe}\n`);
  const result = await runProbe(probe);
  results.push(result);
  process.stdout.write(`${result.status.toUpperCase()} ${probe} ${result.durationMs}ms\n`);
  if (result.status === 'failed') {
    process.stdout.write(`${result.stdout}\n${result.stderr}\n`);
  }
}

const summary = {
  total: results.length,
  passed: results.filter((result) => result.status === 'passed').length,
  failed: results.filter((result) => result.status === 'failed').length,
  results,
};

writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`forensic report -> ${outPath}`);
console.log(
  `SUMMARY total=${summary.total} passed=${summary.passed} failed=${summary.failed}`,
);

if (summary.failed > 0) {
  console.log('FAILED PROBES:');
  for (const failure of results.filter((result) => result.status === 'failed')) {
    console.log(`- ${basename(failure.name)} (${failure.durationMs}ms)`);
  }
}

process.exit(summary.failed === 0 ? 0 : 1);
