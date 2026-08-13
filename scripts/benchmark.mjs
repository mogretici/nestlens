#!/usr/bin/env node
/**
 * Measures what NestLens costs the application it observes.
 *
 * The documentation used to carry numbers — "~0.5-1ms per request", "less than
 * 50MB" — that nobody had measured. A number nobody measured is worse than no
 * number, because a reader plans capacity around it.
 *
 * Run against the built library:
 *   npm run build && npm run benchmark
 *
 * Everything here runs in one process on one machine, so treat the figures as
 * the shape of the cost rather than a promise about yours.
 */
import { performance } from 'node:perf_hooks';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('reflect-metadata');

const { Module, Controller, Get } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { NestLensModule } = require('../dist/index.js');
const { MemoryStorage } = require('../dist/core/storage/memory.storage.js');
const { SqliteStorage } = require('../dist/core/storage/sqlite.storage.js');

const REQUESTS = 2000;
const WARMUP = 200;
const ENTRIES = 10_000;

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const ms = (value) => `${value.toFixed(3)} ms`;

/** A controller that does nothing, so what is measured is the framework and NestLens. */
function buildApp(withNestLens, port) {
  class BenchController {}
  Object.defineProperty(BenchController.prototype, 'ping', {
    value: function ping() {
      return { ok: true };
    },
    writable: true,
    configurable: true,
  });
  Get()(BenchController.prototype, 'ping', Object.getOwnPropertyDescriptor(BenchController.prototype, 'ping'));
  Controller('bench')(BenchController);

  class AppModule {}
  Module({
    imports: withNestLens
      ? [NestLensModule.forRoot({ watchers: { request: true, exception: true } })]
      : [],
    controllers: [BenchController],
  })(AppModule);

  return NestFactory.create(AppModule, { logger: false }).then(async (app) => {
    await app.listen(port, '127.0.0.1');
    return app;
  });
}

async function measureLatency(withNestLens, port) {
  const app = await buildApp(withNestLens, port);
  const url = `http://127.0.0.1:${port}/bench`;

  for (let i = 0; i < WARMUP; i += 1) await fetch(url);

  const samples = [];
  for (let i = 0; i < REQUESTS; i += 1) {
    const started = performance.now();
    await fetch(url);
    samples.push(performance.now() - started);
  }

  await app.close();

  return { p50: percentile(samples, 50), p99: percentile(samples, 99) };
}

async function measureMemory() {
  const storage = new MemoryStorage({ maxEntries: ENTRIES * 2 });
  await storage.initialize();

  global.gc?.();
  const before = process.memoryUsage().heapUsed;

  for (let i = 0; i < ENTRIES; i += 1) {
    await storage.save({
      type: 'request',
      payload: {
        method: 'GET',
        url: `/orders/${i}`,
        path: '/orders/:id',
        statusCode: 200,
        duration: 12,
        memory: 4,
        headers: { 'user-agent': 'benchmark', accept: 'application/json' },
      },
    });
  }

  global.gc?.();
  const after = process.memoryUsage().heapUsed;
  await storage.close();

  return (after - before) / 1024 / 1024;
}

async function measureThroughput(name, storage) {
  const entry = () => ({
    type: 'request',
    payload: { method: 'GET', path: '/orders', statusCode: 200, duration: 3, memory: 1 },
  });

  const started = performance.now();
  for (let i = 0; i < ENTRIES; i += 1) await storage.save(entry());
  const elapsed = performance.now() - started;

  await storage.close();

  return { name, perSecond: Math.round(ENTRIES / (elapsed / 1000)) };
}

console.log(`\nNestLens benchmark — Node ${process.version}, ${process.platform}/${process.arch}\n`);

const withoutLens = await measureLatency(false, 3991);
const withLens = await measureLatency(true, 3992);

console.log('Request latency, empty endpoint');
console.log(`  without NestLens   p50 ${ms(withoutLens.p50)}   p99 ${ms(withoutLens.p99)}`);
console.log(`  with NestLens      p50 ${ms(withLens.p50)}   p99 ${ms(withLens.p99)}`);
console.log(
  `  added              p50 ${ms(withLens.p50 - withoutLens.p50)}   p99 ${ms(withLens.p99 - withoutLens.p99)}`,
);

const heap = await measureMemory();
console.log(`\nMemory for ${ENTRIES.toLocaleString('en-US')} entries in the default storage`);
console.log(`  ${heap.toFixed(1)} MB${global.gc ? '' : '   (run with --expose-gc for a settled figure)'}`);

const workspace = mkdtempSync(join(tmpdir(), 'nestlens-bench-'));
const results = [];
results.push(await measureThroughput('memory', await withInit(new MemoryStorage({ maxEntries: ENTRIES * 2 }))));
results.push(await measureThroughput('sqlite', await withInit(new SqliteStorage(join(workspace, 'bench.db')))));
rmSync(workspace, { recursive: true, force: true });

console.log('\nWrite throughput, entries per second');
for (const { name, perSecond } of results) {
  console.log(`  ${name.padEnd(8)} ${perSecond.toLocaleString('en-US')}`);
}
console.log('\n  redis is not measured here: it needs a server, and the number would');
console.log('  describe the network between them rather than NestLens.\n');

async function withInit(storage) {
  await storage.initialize();
  return storage;
}
