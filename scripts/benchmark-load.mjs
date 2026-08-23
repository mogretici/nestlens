#!/usr/bin/env node
/**
 * What NestLens costs an application that leaves it running.
 *
 * `npm run benchmark` answers "how much latency does one request pick up",
 * measured one request at a time. That is the wrong question for a server meant
 * to keep NestLens on the way Grafana is kept on, where what matters is how
 * much of the machine is left afterwards. So this measures three things the
 * serial benchmark cannot see —
 *
 *   - throughput under concurrency, where added CPU shows up as lost capacity
 *     rather than as milliseconds,
 *   - CPU time per thousand requests, the figure to multiply by a real request
 *     rate,
 *   - what the process holds at rest, and what it costs while idle.
 *
 * The server runs in a child process, so the CPU and memory reported are the
 * application's and not the load generator's. Run against the built library:
 *
 *   npm run build:lib && npm run benchmark:load
 *
 * One machine, loopback, no network. Treat the figures as the shape of the cost
 * rather than a promise about yours.
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const SERVER = fileURLToPath(new URL('./benchmark-load-server.mjs', import.meta.url));

const CONCURRENCY = 32;
const DURATION_MS = 4000;
const WARMUP_MS = 1000;
const IDLE_MS = 3000;

/** A body the size a real API handles, so masking has something to walk. */
const ORDER = {
  customer: { id: 'c_128', name: 'Ada Lovelace', email: 'ada@example.com', password: 'hunter2' },
  items: Array.from({ length: 12 }, (_, i) => ({
    sku: `SKU-${i}`,
    title: `Item number ${i}`,
    quantity: (i % 3) + 1,
    price: 19.99 + i,
  })),
  payment: { creditCard: '4111111111111111', cvv: '123', token: 'tok_live_x' },
  shippingAddress: { city: 'Istanbul', district: 'Kadikoy', postalCode: '34710' },
};

const POST = {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer live-token' },
  body: JSON.stringify(ORDER),
};

/** Starts a server, and returns a handle that can be marked, reported on and stopped. */
async function startServer(port, config) {
  const child = fork(SERVER, [String(port), config ? JSON.stringify(config) : 'none'], {
    execArgv: ['--expose-gc'],
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });

  const once = () =>
    new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('exit', (code) => reject(new Error(`server exited with ${code}`)));
    });

  await once();

  return {
    mark: async () => {
      child.send('mark');
      await once();
    },
    report: async () => {
      child.send('report');
      return once();
    },
    stop: () =>
      new Promise((resolve) => {
        child.once('exit', resolve);
        child.send('stop');
      }),
  };
}

/** Keeps `CONCURRENCY` requests in flight until the clock runs out. */
async function drive(url, init, untilMs) {
  const deadline = performance.now() + untilMs;
  let completed = 0;

  const worker = async () => {
    while (performance.now() < deadline) {
      await fetch(url, init);
      completed += 1;
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return completed;
}

async function measure(label, config, port) {
  const server = await startServer(port, config);
  const base = `http://127.0.0.1:${port}/bench`;

  await drive(`${base}/ping`, undefined, WARMUP_MS);

  const results = {};
  for (const [name, url, init] of [
    ['ping', `${base}/ping`, undefined],
    ['order', `${base}/order`, POST],
  ]) {
    await server.mark();
    const started = performance.now();

    const completed = await drive(url, init, DURATION_MS);

    const elapsed = performance.now() - started;
    const { cpuMs, entries } = await server.report();

    results[name] = {
      perSecond: Math.round(completed / (elapsed / 1000)),
      cpuPerThousand: (cpuMs / completed) * 1000,
      entries,
    };
  }

  // What it costs to simply be running, with nothing arriving — the question
  // behind "can I leave this on".
  await server.mark();
  await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  const idle = await server.report();

  await server.stop();

  return {
    label,
    ...results,
    rss: idle.rss,
    heap: idle.heap,
    idlePercent: (idle.cpuMs / IDLE_MS) * 100,
  };
}

const CASES = [
  ['without NestLens', undefined],
  ['defaults', {}],
  ['no bodies', { watchers: { request: { captureBody: false, captureResponse: false } } }],
  [
    'no bodies, no headers',
    {
      watchers: {
        request: {
          captureBody: false,
          captureResponse: false,
          captureHeaders: false,
          captureResponseHeaders: false,
        },
      },
    },
  ],
  ['request watcher only', { watchers: { query: false, log: false } }],
  // The production stance the documentation recommends: nothing ordinary is
  // kept, so this is what leaving NestLens on actually costs an application
  // that is not failing. `entries` should be 0 here, and a case that records
  // nothing has to be read together with that column.
  ['preset: failures-only', { preset: 'failures-only' }],
];

const rows = [];
let port = 4101;
for (const [label, config] of CASES) {
  rows.push(await measure(label, config, port));
  port += 1;
}

const pad = (value, width) => String(value).padStart(width);

console.log(`\nNestLens under load — Node ${process.version}, ${process.platform}/${process.arch}`);
console.log(`${CONCURRENCY} concurrent connections, ${DURATION_MS / 1000}s per case, server in its own process\n`);

console.log('                            GET /ping                       POST /order (2.5 KB body)');
console.log('                            req/s     CPU ms/1k  entries    req/s      CPU ms/1k  entries');
for (const row of rows) {
  console.log(
    `  ${row.label.padEnd(24)} ${pad(row.ping.perSecond.toLocaleString('en-US'), 7)}  ` +
      `${pad(row.ping.cpuPerThousand.toFixed(0), 9)}  ` +
      `${pad(row.ping.entries.toLocaleString('en-US'), 7)}  ` +
      `${pad(row.order.perSecond.toLocaleString('en-US'), 9)}  ` +
      `${pad(row.order.cpuPerThousand.toFixed(0), 9)}  ` +
      `${pad(row.order.entries.toLocaleString('en-US'), 7)}`,
  );
}

console.log(
  '\n  `entries` is the storage count at the end of that case. A case that\n' +
    '  recorded nothing is not a case that is cheap.',
);

console.log('\n  At rest, after the run');
console.log('                            RSS        heap       idle CPU');
for (const row of rows) {
  console.log(
    `  ${row.label.padEnd(24)} ${pad(`${row.rss.toFixed(0)} MB`, 7)}  ` +
      `${pad(`${row.heap.toFixed(0)} MB`, 8)}  ` +
      `${pad(`${row.idlePercent.toFixed(2)} %`, 9)}`,
  );
}

const cost = (a, b) => `${(((a - b) / a) * 100).toFixed(0)}%`;
console.log(
  `\n  Throughput the defaults cost: ${cost(rows[0].ping.perSecond, rows[1].ping.perSecond)} ` +
    `on GET /ping, ${cost(rows[0].order.perSecond, rows[1].order.perSecond)} on POST /order.`,
);
console.log(
  '  Idle CPU is what an open dashboard costs when nothing is arriving: the\n' +
    '  pruning timer and the collector flush, and nothing else.\n',
);
