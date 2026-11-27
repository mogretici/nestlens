/**
 * A feature module that imports `NestLensModule` next to the root's `forRoot`
 * gets no second NestLens.
 *
 * Importing the class itself is the reflex Nest teaches — `imports:
 * [ConfigModule]` in a feature module — and `forRoot` is global, so it is also
 * unnecessary. Nest still instantiates the class a second time for it, and the
 * hooks that belong to the class ran on that instance too. Measured on the
 * example application, whose SimulationsModule did exactly this:
 *
 * ```text
 * [NestLens] recording everything · in-memory storage · … dashboard mounted at /nestlens
 * [NestLens] recording everything · in-memory storage · … dashboard mounted at /nestlens
 * ```
 *
 * The same second instance applied the request-context middleware a second
 * time, on every request. Switched off, the class import did not boot at all:
 * the instance asked for a configuration only the enabled module shares.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Controller, Get, INestApplication, Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestLensModule } from '../../nestlens.module';
import { RequestContextMiddleware } from '../../core/request-context.middleware';

@Controller('probe')
class ProbeController {
  @Get()
  read(): string {
    return 'ok';
  }
}

@Module({ imports: [NestLensModule], controllers: [ProbeController] })
class FeatureModule {}

const boot = async (enabled: boolean): Promise<INestApplication> => {
  @Module({ imports: [NestLensModule.forRoot({ enabled }), FeatureModule] })
  class AppModule {}

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  await app.listen(0, '127.0.0.1');

  return app;
};

describe('NestLensModule imported by a feature module as well', () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.restoreAllMocks();
  });

  it('prints the startup summary once', async () => {
    const lines: string[] = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      lines.push(String(message));
    });

    app = await boot(true);

    expect(lines.filter((line) => line.includes('recording everything'))).toHaveLength(1);
  });

  it('opens one request context per request', async () => {
    const use = vi.spyOn(RequestContextMiddleware.prototype, 'use');
    app = await boot(true);

    const response = await fetch(`${await app.getUrl()}/probe`);

    expect(response.status).toBe(200);
    expect(use).toHaveBeenCalledTimes(1);
  });

  it('boots, and answers, when NestLens is switched off', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    app = await boot(false);

    const response = await fetch(`${await app.getUrl()}/probe`);
    expect(response.status).toBe(200);
  });
});

/**
 * Without any `forRoot`, the class import configures nothing, and saying so at
 * boot is the point. It used to fail there by accident — the instance could
 * not find NESTLENS_CONFIG — and tolerating the double import above must not
 * turn that into an application that boots and records nothing.
 */
describe('NestLensModule imported with no forRoot anywhere', () => {
  it('refuses to boot, and says what to call', async () => {
    @Module({ imports: [FeatureModule] })
    class AppModule {}

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      'NestLensModule.forRoot()',
    );
  });

  it('still boots two applications in one process when each calls forRoot', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const first = await boot(true);
    const second = await boot(true);

    try {
      expect((await fetch(`${await second.getUrl()}/probe`)).status).toBe(200);
    } finally {
      await second.close();
      await first.close();
      vi.restoreAllMocks();
    }
  });
});
