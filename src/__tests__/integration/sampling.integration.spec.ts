/**
 * Sampling, through a real application.
 *
 * `sampling.spec.ts` pins the decision function. This pins the wiring: that the
 * collector consults it, that it does so before masking and buffering, and that
 * the default path is untouched.
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

describe('sampling, end to end', () => {
  jest.setTimeout(30_000);

  it('records everything by default', async () => {
    expect(await recordedEntries({})).toBe(2);
  });

  it('records nothing at a rate of zero', async () => {
    // Neither request produces an exception, and exceptions are the only thing
    // exempt by default.
    expect(await recordedEntries({ sampling: { rate: 0 } })).toBe(0);
  });

  it('records everything at a rate of one', async () => {
    expect(await recordedEntries({ sampling: { rate: 1 } })).toBe(2);
  });
});
