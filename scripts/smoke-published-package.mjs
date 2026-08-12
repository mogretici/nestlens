#!/usr/bin/env node
/**
 * Boots the *published* package in a throwaway application.
 *
 * Everything else in this repository tests the source. That gap shipped 0.8.0,
 * where `httpAdapter.reply()` was handed a raw Buffer and Express serialised
 * every script as `{"type":"Buffer","data":[…]}`: the dashboard was blank in a
 * browser while the unit tests, the integration tests and the E2E suite all
 * passed. It was found by hand, by installing the tarball into an empty project
 * and opening it — which is exactly what this does, on demand and in CI.
 *
 * Usage:
 *   node scripts/smoke-published-package.mjs                 # version in package.json, from npm
 *   node scripts/smoke-published-package.mjs 0.9.0           # a specific published version
 *   node scripts/smoke-published-package.mjs --tarball x.tgz # before publishing
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;
const MOUNT = `${BASE}/nestlens`;

const argv = process.argv.slice(2);
const tarballFlag = argv.indexOf('--tarball');
const tarball = tarballFlag === -1 ? undefined : resolve(argv[tarballFlag + 1] ?? '');
const version =
  tarball || argv.find((argument) => !argument.startsWith('--')) ||
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const failures = [];
const check = (description, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${description}`);
    return;
  }
  console.log(`  FAIL ${description}${detail ? ` — ${detail}` : ''}`);
  failures.push(description);
};

const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });

/**
 * npm's registry needs a moment after a publish before the new version can be
 * installed, and CI reaches it seconds after semantic-release returns.
 */
async function waitForRegistry(target) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      run('npm', ['view', `nestlens@${target}`, 'version']);
      return;
    } catch {
      console.log(`  … waiting for nestlens@${target} on the registry (${attempt}/12)`);
      await delay(10_000);
    }
  }
  throw new Error(`nestlens@${target} never appeared on the registry`);
}

/**
 * A NestJS application without a TypeScript build: decorators are ordinary
 * functions, so applying them by hand is enough to describe a module. Keeping
 * this in plain CommonJS means the smoke test exercises the package rather
 * than a compiler configuration.
 */
const APP = `
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { NestLensModule } = require('nestlens');

class AppModule {}
Module({ imports: [NestLensModule.forRoot({ watchers: { request: true } })] })(AppModule);

NestFactory.create(AppModule, { logger: false })
  .then((app) => app.listen(${PORT}, '127.0.0.1'))
  .then(() => console.log('LISTENING'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;

const workspace = mkdtempSync(join(tmpdir(), 'nestlens-smoke-'));
let server;

try {
  console.log(`\nInstalling ${tarball ?? `nestlens@${version}`} into ${workspace}\n`);
  if (!tarball) await waitForRegistry(version);

  writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
  run(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      tarball ?? `nestlens@${version}`,
      '@nestjs/common',
      '@nestjs/core',
      '@nestjs/platform-express',
      'reflect-metadata',
      'rxjs',
    ],
    { cwd: workspace, stdio: 'inherit' },
  );

  writeFileSync(join(workspace, 'main.js'), APP);

  const { spawn } = await import('node:child_process');
  server = spawn(process.execPath, ['main.js'], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] });

  const stderr = [];
  server.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

  const listening = await Promise.race([
    new Promise((resolveReady) => {
      server.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('LISTENING')) resolveReady(true);
      });
    }),
    delay(60_000).then(() => false),
  ]);

  check('the application boots with NestLens installed', listening, stderr.join('').slice(0, 800));
  if (!listening) throw new Error('never started');

  const html = await fetch(MOUNT);
  const body = await html.text();
  check('the dashboard responds with HTML', html.headers.get('content-type')?.includes('text/html'));
  check('the mount point is injected', body.includes('<base href="/nestlens/"'));
  check('the bundle is told where it is', body.includes('__NESTLENS_BASE__'));

  const assetPath = body.match(/assets\/[\w.-]+\.js/)?.[0];
  check('index.html references a script', Boolean(assetPath), body.slice(0, 300));

  if (assetPath) {
    const asset = await fetch(`${MOUNT}/${assetPath}`, { headers: { 'Accept-Encoding': 'br' } });
    const script = await asset.text();

    check('the script is served', asset.status === 200, `status ${asset.status}`);
    check(
      'the script is JavaScript, not a serialised Buffer',
      !script.startsWith('{"type":"Buffer"'),
      script.slice(0, 80),
    );
    check('the script is compressed', asset.headers.get('content-encoding') === 'br');
    check('the script is cacheable forever', asset.headers.get('cache-control')?.includes('immutable'));
  }

  const api = await fetch(`${MOUNT}/__nestlens__/api/entries?type=request`);
  const raw = await api.text();
  // Parsed by hand: when the API route stops matching, the SPA wildcard answers
  // with index.html, and a smoke test has to report that rather than throw on it.
  const payload = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  })();

  check('the API answers under the mount point', api.status === 200, `status ${api.status}`);
  check('the API returns JSON, not the SPA fallback', payload !== undefined, raw.slice(0, 80));
  check('the API returns the documented envelope', payload?.success === true, raw.slice(0, 200));

  // The published entry points, from a consumer's position.
  const resolution = run(process.execPath, [
    '-e',
    `require('nestlens/storage/sqlite');
     require('nestlens/storage/redis');
     try { require('nestlens/dist/core/collector.service'); console.log('LEAKED'); }
     catch (error) { console.log(error.code); }`,
  ], { cwd: workspace });

  check('the storage entry points resolve', !resolution.includes('Error'), resolution.trim());
  check(
    'internal files are not importable',
    resolution.includes('ERR_PACKAGE_PATH_NOT_EXPORTED'),
    resolution.trim(),
  );
} finally {
  server?.kill('SIGKILL');
  rmSync(workspace, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed against the published package:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nThe published package installs, boots and serves correctly.\n');
