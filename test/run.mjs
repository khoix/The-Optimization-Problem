// The test runner.
//
// Every suite in `suites/` drives a real browser against the *built* game —
// not a dev build, not a mock. That is deliberate and it is why the runner is
// shaped like this: it builds, serves the build the way a host would, and
// drives it through Playwright. M53 exists because the dev server and the
// build behaved differently, so a suite that only ever saw one of them would
// have missed it.
//
// Two servers, because one suite needs both: the boot screen's stylesheet has
// to be inlined identically in the build *and* in dev, and the only way to
// assert that is to look at both.
//
// Usage:
//   node test/run.mjs            every suite
//   node test/run.mjs m54 m55    just these
//   node test/run.mjs --no-build reuse whatever is already in dist/

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SUITES = fileURLToPath(new URL('./suites/', import.meta.url));
const PREVIEW_PORT = 4173;
const DEV_PORT = 4174;

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const only = args.filter((a) => !a.startsWith('--'));

const run = (cmd, cmdArgs, opts = {}) => new Promise((resolve) => {
  const p = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', ...opts });
  p.on('exit', (code) => resolve(code ?? 1));
});

/** Start a server and wait until it answers, rather than sleeping and hoping. */
async function serve(script, port) {
  const p = spawn('npx', script, { cwd: ROOT, stdio: 'ignore', detached: true });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return p;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${script.join(' ')} did not answer on ${port} within 60s`);
}

const stop = (p) => { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* already gone */ } };

// ------------------------------------------------------------------- go
if (!noBuild) {
  const code = await run('npm', ['run', 'build']);
  if (code !== 0) { console.error('\nbuild failed — nothing to test'); process.exit(code); }
}

const names = readdirSync(SUITES)
  .filter((f) => /^m\d+\.mjs$/.test(f))
  .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
  .filter((f) => !only.length || only.includes(f.replace('.mjs', '')));

if (!names.length) {
  console.error(only.length ? `no suite matched ${only.join(', ')}` : 'no suites found');
  process.exit(1);
}

let preview, dev;
const results = [];
try {
  console.log(`\nserving the build on ${PREVIEW_PORT} and the dev server on ${DEV_PORT}\n`);
  preview = await serve(['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], PREVIEW_PORT);
  dev = await serve(['vite', '--port', String(DEV_PORT), '--strictPort'], DEV_PORT);

  for (const name of names) {
    console.log(`──────── ${name}`);
    const code = await run(process.execPath, [SUITES + name]);
    results.push([name, code]);
  }
} finally {
  if (preview) stop(preview);
  if (dev) stop(dev);
}

const failed = results.filter(([, code]) => code !== 0);
console.log('\n════════ summary');
for (const [name, code] of results) console.log(`  ${code === 0 ? 'ok  ' : 'FAIL'}  ${name}`);
console.log(`\n${results.length - failed.length} of ${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
