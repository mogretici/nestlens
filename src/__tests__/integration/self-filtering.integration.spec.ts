/**
 * Regression guard: NestLens must never record its own traffic.
 *
 * The watchers used to compare the request path against `config.path` alone.
 * That works until the host calls `app.setGlobalPrefix('api')` — every NestLens
 * route moves to `/api/nestlens/...` and a check looking for `/nestlens` stops
 * matching. NestLens then logged its own dashboard polling: real entries got
 * buried, storage filled with noise, every refresh produced more of it, and the
 * SSE stream died with ERR_HTTP_HEADERS_SENT as the open request was recorded.
 */
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { NestLensModule } from '../../nestlens.module';

@Controller('demo')
class DemoController {
  @Get('ok')
  ok(): { ok: boolean } {
    return { ok: true };
  }
}

interface Recorded {
  type: string;
  payload: { path?: string };
}

/**
 * The module is built inside the helper on purpose: `forRoot()` writes the mount
 * point onto the controller classes, so declaring several modules at file scope
 * would leave every test running against whichever one was evaluated last.
 */
const bootAndRecord = async (
  configuredPath: string | undefined,
  dashboardPath: string,
  globalPrefix?: string,
): Promise<string[]> => {
  @Module({
    imports: [NestLensModule.forRoot(configuredPath ? { path: configuredPath } : {})],
    controllers: [DemoController],
  })
  class AppModule {}

  const app: INestApplication = await NestFactory.create(AppModule, new ExpressAdapter(), {
    logger: false,
  });
  if (globalPrefix) app.setGlobalPrefix(globalPrefix);
  await app.listen(0);

  const origin = (await app.getUrl()).replace('[::1]', '127.0.0.1').replace('::1', '127.0.0.1');
  const prefix = globalPrefix ? `/${globalPrefix}` : '';
  const nestlens = `${origin}${prefix}${dashboardPath}`;

  try {
    // One real request, then several NestLens calls that must be ignored.
    await fetch(`${origin}${prefix}/demo/ok`);
    await fetch(`${nestlens}/__nestlens__/api/stats`);
    await fetch(`${nestlens}/__nestlens__/api/entries`);
    await fetch(nestlens).catch(() => undefined); // dashboard html

    // The request watcher batches, so give the collector time to flush.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const res = await fetch(`${nestlens}/__nestlens__/api/entries?limit=50`);
    const body = (await res.json()) as { data?: Recorded[] };

    return (body.data ?? [])
      .filter((entry) => entry.type === 'request')
      .map((entry) => entry.payload.path ?? '');
  } finally {
    await app.close();
  }
};

describe('NestLens does not record its own traffic', () => {
  jest.setTimeout(30_000);

  it('ignores its own routes on the default path', async () => {
    const paths = await bootAndRecord(undefined, '/nestlens');

    expect(paths).toEqual(['/demo/ok']);
  });

  it('ignores its own routes behind a global prefix', async () => {
    const paths = await bootAndRecord(undefined, '/nestlens', 'api');

    expect(paths).toEqual(['/api/demo/ok']);
  });

  it('ignores its own routes with a custom path behind a global prefix', async () => {
    const paths = await bootAndRecord('/dev/nestlens', '/dev/nestlens', 'api');

    expect(paths).toEqual(['/api/demo/ok']);
  });
});
