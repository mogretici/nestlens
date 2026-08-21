#!/usr/bin/env node
/**
 * The application under test, in a process of its own.
 *
 * Separate from the load generator on purpose: `fetch` is not free, and 32
 * concurrent clients sharing an event loop with the server they are measuring
 * produce a number about the harness. Here the CPU and memory reported back are
 * the server's alone.
 *
 * Driven over IPC by benchmark-load.mjs; not useful on its own.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('reflect-metadata');

const { Module, Controller, Get, Post, Body } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { NestLensModule } = require('../dist/index.js');
const { STORAGE } = require('../dist/core/storage/storage.interface.js');
const { CollectorService } = require('../dist/core/collector.service.js');

const [portArg, configArg] = process.argv.slice(2);
const port = Number(portArg);
const nestlens = configArg === 'none' ? undefined : JSON.parse(configArg);

class BenchController {
  ping() {
    return { ok: true };
  }
  order(body) {
    return { id: 'o_1', total: body?.items?.length ?? 0 };
  }
}

const describe = (name) => Object.getOwnPropertyDescriptor(BenchController.prototype, name);
Get('ping')(BenchController.prototype, 'ping', describe('ping'));
Body()(BenchController.prototype, 'order', 0);
Post('order')(BenchController.prototype, 'order', describe('order'));
Controller('bench')(BenchController);

class AppModule {}
Module({
  imports: nestlens ? [NestLensModule.forRoot(nestlens)] : [],
  controllers: [BenchController],
})(AppModule);

const app = await NestFactory.create(AppModule, { logger: false });
await app.listen(port, '127.0.0.1');

let mark = process.cpuUsage();

process.on('message', (command) => {
  if (command === 'mark') {
    global.gc?.();
    mark = process.cpuUsage();
    process.send?.({ ok: true });
    return;
  }

  if (command === 'report') {
    const cpu = process.cpuUsage(mark);
    global.gc?.();
    const memory = process.memoryUsage();

    // Reported so a case that looks cheap because it recorded nothing cannot
    // pass for a case that is cheap.
    entriesRecorded().then((entries) =>
      process.send?.({
        cpuMs: (cpu.user + cpu.system) / 1000,
        rss: memory.rss / 1024 / 1024,
        heap: memory.heapUsed / 1024 / 1024,
        entries,
      }),
    );
    return;
  }

  if (command === 'stop') {
    app.close().then(() => process.exit(0));
  }
});

async function entriesRecorded() {
  if (!nestlens) return 0;

  try {
    await app.get(CollectorService).flush();
    const stats = await app.get(STORAGE).getStats();
    return stats?.total ?? 0;
  } catch {
    return -1;
  }
}

// Also runnable on its own, so a profiler can be pointed at it:
//   node --cpu-prof scripts/benchmark-load-server.mjs 4201 '{}'
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0));
  });
}

process.send?.({ ready: true });
