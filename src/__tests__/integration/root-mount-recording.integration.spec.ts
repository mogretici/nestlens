/**
 * A dashboard at the server root must not silence the recording.
 *
 * The watchers skip NestLens's own traffic by comparing the request path with
 * the configured mount point. `path: '/'` normalises to `''`, and `''` is a
 * prefix of every string, so every request the application handled was read as
 * NestLens's own:
 *
 *     GET /orders  ->  0 entries recorded
 *
 * The whole tool goes silent, and nothing says why. A root mount is not exotic
 * either: with `server` the dashboard has a listener to itself, and a path under
 * it buys nothing.
 */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NestLensModule } from '../../nestlens.module';
import { EntryFilter } from '../../types';

@Controller()
class ApplicationController {
  @Get('orders')
  orders(): { ok: boolean } {
    return { ok: true };
  }

  @Get('nestlens-admin')
  neighbour(): { ok: boolean } {
    return { ok: true };
  }

  @Get('boom')
  boom(): never {
    throw new Error('application failure');
  }
}

const start = async (path: string): Promise<{ app: INestApplication; url: string }> => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      NestLensModule.forRoot({ path, watchers: { request: true, exception: true, log: false } }),
    ],
    controllers: [ApplicationController],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0, '127.0.0.1');

  return { app, url: await app.getUrl() };
};

const recorded = async (app: INestApplication, filter: EntryFilter): Promise<number> => {
  await app.get(CollectorService).flush();

  return (await app.get<StorageInterface>(STORAGE).find(filter)).length;
};

describe('recording with the dashboard at the root', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    ({ app, url } = await start('/'));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('records a request the application answered', async () => {
    await fetch(`${url}/orders`);

    expect(await recorded(app, { type: 'request' })).toBeGreaterThan(0);
  });

  it('records an exception the application threw', async () => {
    await fetch(`${url}/boom`);

    expect(await recorded(app, { type: 'exception' })).toBeGreaterThan(0);
  });

  it('still leaves its own API out', async () => {
    const before = await recorded(app, { type: 'request' });

    await fetch(`${url}/__nestlens__/api/entries?limit=1`);

    expect(await recorded(app, { type: 'request' })).toBe(before);
  });
});

describe('a route whose name starts with the mount point', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    ({ app, url } = await start('/nestlens'));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('is the application’s and is recorded', async () => {
    const before = await recorded(app, { type: 'request' });

    await fetch(`${url}/nestlens-admin`);

    expect(await recorded(app, { type: 'request' })).toBe(before + 1);
  });

  it('does not record the dashboard itself', async () => {
    const before = await recorded(app, { type: 'request' });

    await fetch(`${url}/nestlens`);

    expect(await recorded(app, { type: 'request' })).toBe(before);
  });
});
