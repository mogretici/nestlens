/**
 * SSE live-tail integration test.
 *
 * Boots a real NestJS app on BOTH Express and Fastify, opens a Server-Sent
 * Events connection to the NestLens stream endpoint, triggers an entry, and
 * asserts it is pushed to the client in real time. This is the cross-adapter
 * proof that `@Sse()` works on Fastify, not only Express.
 */
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { get as httpGet, IncomingMessage } from 'http';
import { NestLensModule } from '../../nestlens.module';
import { DEFAULT_CONFIG } from '../../nestlens.config';
import { toBaseHref } from '../../api/route-path';

@Controller('demo')
class DemoController {
  @Get('boom')
  boom(): never {
    throw new HttpException('kaboom', HttpStatus.BAD_REQUEST);
  }

  @Post('login')
  login(@Body() body: unknown): { ok: boolean } {
    void body;
    return { ok: true };
  }
}

@Module({
  imports: [NestLensModule.forRoot({ watchers: { request: true, exception: true } })],
  controllers: [DemoController],
})
class AppModule {}

interface SseEvent {
  type: string;
  data: string;
}

/** Minimal raw SSE client — no extra dependency. */
function openSse(url: string): { events: SseEvent[]; close: () => void } {
  const events: SseEvent[] = [];
  const req = httpGet(url, { headers: { Accept: 'text/event-stream' } }, (res: IncomingMessage) => {
    res.setEncoding('utf8');
    let buffer = '';
    res.on('data', (chunk: string) => {
      buffer += chunk;
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event: SseEvent = { type: 'message', data: '' };
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event.type = line.slice(6).trim();
          else if (line.startsWith('data:')) event.data += line.slice(5).trim();
        }
        events.push(event);
      }
    });
  });
  req.on('error', () => {
    /* connection torn down at test end */
  });
  return { events, close: () => req.destroy() };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 4000): Promise<T> {
  const start = Date.now();

  while (true) {
    const value = fn();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(25);
  }
}

type AdapterName = 'Express' | 'Fastify';

async function createApp(adapter: AdapterName, globalPrefix?: string): Promise<INestApplication> {
  const app =
    adapter === 'Fastify'
      ? await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
          logger: false,
        })
      : await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });
  if (globalPrefix) app.setGlobalPrefix(globalPrefix);
  await app.listen(0);
  if (adapter === 'Fastify') {
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  }
  return app;
}

describe.each<AdapterName>(['Express', 'Fastify'])('SSE live-tail on %s adapter', (adapter) => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApp(adapter);
    // Normalize IPv6 loopback so the raw http client connects reliably.
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1').replace('::1', '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('pushes a newly collected entry to a connected client in real time', async () => {
    const sse = openSse(`${baseUrl}${toBaseHref(DEFAULT_CONFIG.path)}/__nestlens__/stream`);
    try {
      // Give the connection a moment to establish before producing an entry.
      await sleep(150);

      // Trigger an exception → collected immediately → emitted onto the stream.
      await fetch(`${baseUrl}/demo/boom`).catch(() => undefined);

      const entryEvent = await waitFor(() => sse.events.find((e) => e.type === 'entry'));
      expect(entryEvent).toBeDefined();
      const payload = JSON.parse(entryEvent.data);
      expect(payload.type).toBe('exception');
    } finally {
      sse.close();
    }
  });

  /**
   * The stream is a second way out of the process for entry data, beside the
   * REST API, and nothing here looked at what it carries. Masking runs before
   * the entry is saved and the stream emits what was saved, so the two exits
   * cannot disagree — but "cannot" is a claim about code that changes, and a
   * credential reaching a live-tail is the same disclosure as one reaching
   * storage.
   */
  it('carries what was masked, not what arrived', async () => {
    const sse = openSse(`${baseUrl}${toBaseHref(DEFAULT_CONFIG.path)}/__nestlens__/stream`);
    try {
      await sleep(150);

      await fetch(`${baseUrl}/demo/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer sk-live-9f3a' },
        body: JSON.stringify({ username: 'ada', password: 'hunter2', apiKey: 'sk-live-9f3a' }),
      }).catch(() => undefined);

      const entryEvent = await waitFor(() =>
        sse.events.find((e) => e.type === 'entry' && e.data.includes('/demo/login')),
      );

      expect(entryEvent.data).not.toContain('hunter2');
      expect(entryEvent.data).not.toContain('sk-live-9f3a');
      // And it is the entry, not an empty husk.
      expect(entryEvent.data).toContain('ada');
    } finally {
      sse.close();
    }
  });
});

/**
 * `app.setGlobalPrefix()` shifts every NestLens route without the module knowing.
 * Routing for the dashboard and the REST API is covered in custom-path.integration,
 * but the stream needs its own check: a route that merely *resolves* under the
 * prefix is not enough — entries have to actually reach a connected client there.
 */
describe('SSE live-tail under a global prefix', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApp('Express', 'api');
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1').replace('::1', '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('pushes entries to a client connected under the prefixed path', async () => {
    const sse = openSse(`${baseUrl}/api${toBaseHref(DEFAULT_CONFIG.path)}/__nestlens__/stream`);
    try {
      await sleep(150);

      await fetch(`${baseUrl}/api/demo/boom`).catch(() => undefined);

      const entryEvent = await waitFor(() => sse.events.find((e) => e.type === 'entry'));
      expect(entryEvent).toBeDefined();
      expect(JSON.parse(entryEvent.data).type).toBe('exception');
    } finally {
      sse.close();
    }
  });
});
