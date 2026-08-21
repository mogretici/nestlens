/**
 * A configured watcher still records.
 *
 * The source-level check in watcher-config.spec.ts says no watcher unpacks its
 * own config any more. This says the thing that actually matters: an
 * application that tunes the request watcher — the single most common piece of
 * NestLens configuration there is — gets entries out of it.
 *
 * It did not. `watchers: { request: { maxBodySize: 0 } }` produced an empty
 * dashboard, with no error, no warning and nothing in the log.
 */
import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NestLensModule } from '../../nestlens.module';
import { NestLensConfig } from '../../nestlens.config';

@Controller('shop')
class ShopController {
  @Get('ping')
  ping(): { ok: boolean } {
    return { ok: true };
  }

  @Post('order')
  order(@Body() body: { items?: unknown[] }): { items: number } {
    return { items: body?.items?.length ?? 0 };
  }
}

/** Boots an application, drives two requests through it and counts what was stored. */
const recordedEntries = async (config: NestLensConfig): Promise<number> => {
  const moduleRef = await Test.createTestingModule({
    imports: [NestLensModule.forRoot(config)],
    controllers: [ShopController],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0, '127.0.0.1');

  const url = await app.getUrl();

  try {
    await fetch(`${url}/shop/ping`);
    await fetch(`${url}/shop/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [1, 2], password: 'hunter2' }),
    });

    await app.get(CollectorService).flush();

    return (await app.get<StorageInterface>(STORAGE).getStats()).total;
  } finally {
    await app.close();
  }
};

describe('a configured request watcher', () => {
  jest.setTimeout(30_000);

  it('records when switched on', async () => {
    expect(await recordedEntries({ watchers: { request: true } })).toBeGreaterThan(0);
  });

  it('records when given settings', async () => {
    // Every one of these was a silent off switch.
    expect(await recordedEntries({ watchers: { request: { maxBodySize: 0 } } })).toBeGreaterThan(0);
    expect(
      await recordedEntries({ watchers: { request: { captureBody: false } } }),
    ).toBeGreaterThan(0);
    expect(
      await recordedEntries({ watchers: { request: { ignorePaths: ['/health'] } } }),
    ).toBeGreaterThan(0);
  });

  it('honours an ignored path while still recording the rest', async () => {
    const total = await recordedEntries({ watchers: { request: { ignorePaths: ['/shop/ping'] } } });

    // The POST is recorded; the GET is not.
    expect(total).toBe(1);
  });

  it('records nothing when switched off', async () => {
    expect(await recordedEntries({ watchers: { request: false } })).toBe(0);
  });

  it('records nothing when the settings switch it off', async () => {
    expect(
      await recordedEntries({ watchers: { request: { enabled: false, maxBodySize: 0 } } }),
    ).toBe(0);
  });
});
