/**
 * An application's own exception filter can take every exception before NestLens's.
 *
 * Nest tries global filters last-registered first, and the first whose
 * `@Catch()` matches handles the exception alone. Measured on Express and
 * Fastify, NestLens 0.19.1 and NestJS 12.6:
 *
 *     no filter of the application's                  records Error and NotFoundException
 *     app.useGlobalFilters(@Catch() filter)           records nothing
 *     useGlobalFilters(@Catch(HttpException) filter)  records Error only
 *     APP_FILTER (@Catch()) in AppModule              records both: registered before NestLens's
 *     APP_FILTER (@Catch()) in a module after it      records nothing
 *
 * The exception watcher said `recording` through all of it. These measure the
 * same arrangements and ask what it says now.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  Module,
  NotFoundException,
  Provider,
} from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestLensModule } from '../../nestlens.module';
import { CollectorService } from '../../core/collector.service';
import { WatcherStatusReport, WatcherStatusService } from '../../watchers/watcher-status.service';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

interface ReplyLike {
  code?: (status: number) => { send: (body: unknown) => void };
  status?: (status: number) => { json: (body: unknown) => void };
}

@Catch()
class CatchEverything implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    if (reply.code) reply.code(500).send({ handled: true });
    else reply.status?.(500).json({ handled: true });
  }
}

@Catch(HttpException)
class CatchHttpExceptions extends CatchEverything {}

/** Nest matches by `instanceof`, so this takes every Error, HttpException included. */
@Catch(Error)
class CatchErrors extends CatchEverything {}

/** Two catch-alls, each answering with its own name. */
@Catch()
class RegisteredFirst implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    if (reply.code) reply.code(500).send({ handledBy: 'RegisteredFirst' });
    else reply.status?.(500).json({ handledBy: 'RegisteredFirst' });
  }
}

@Catch()
class RegisteredSecond implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    if (reply.code) reply.code(500).send({ handledBy: 'RegisteredSecond' });
    else reply.status?.(500).json({ handledBy: 'RegisteredSecond' });
  }
}

@Controller('boom')
class BoomController {
  @Get('error')
  error(): never {
    throw new Error('plain');
  }

  @Get('http')
  http(): never {
    throw new NotFoundException('missing');
  }

  @Get('string')
  text(): never {
    throw 'not an Error';
  }
}

type Arrangement =
  | 'none'
  | 'useGlobalFilters catch-all'
  | 'useGlobalFilters HttpException'
  | 'APP_FILTER in AppModule'
  | 'APP_FILTER after NestLens'
  | 'two catch-alls'
  | 'useGlobalFilters Error'
  | 'APP_FILTER Error after NestLens'
  | 'useGlobalFilters catch-all after listen';

const measure = async (
  platform: 'express' | 'fastify',
  arrangement: Arrangement,
): Promise<{ recorded: string[]; status: WatcherStatusReport; handledBy?: string }> => {
  const providers: Provider[] =
    arrangement === 'APP_FILTER in AppModule'
      ? [{ provide: APP_FILTER, useClass: CatchEverything }]
      : [];

  @Module({ providers: [{ provide: APP_FILTER, useClass: CatchEverything }] })
  class FilterModule {}

  @Module({ providers: [{ provide: APP_FILTER, useClass: CatchErrors }] })
  class ErrorFilterModule {}

  @Module({
    imports: [
      NestLensModule.forRoot({}),
      ...(arrangement === 'APP_FILTER after NestLens' ? [FilterModule] : []),
      ...(arrangement === 'APP_FILTER Error after NestLens' ? [ErrorFilterModule] : []),
    ],
    controllers: [BoomController],
    providers,
  })
  class AppModule {}

  const app = await NestFactory.create(
    AppModule,
    platform === 'express' ? new ExpressAdapter() : new FastifyAdapter(),
    { logger: false, abortOnError: false },
  );
  if (arrangement === 'useGlobalFilters catch-all') app.useGlobalFilters(new CatchEverything());
  if (arrangement === 'useGlobalFilters HttpException') {
    app.useGlobalFilters(new CatchHttpExceptions());
  }
  if (arrangement === 'useGlobalFilters Error') app.useGlobalFilters(new CatchErrors());
  if (arrangement === 'two catch-alls') {
    app.useGlobalFilters(new RegisteredFirst(), new RegisteredSecond());
  }
  await app.listen(0, '127.0.0.1');
  if (arrangement === 'useGlobalFilters catch-all after listen') {
    app.useGlobalFilters(new CatchEverything());
  }

  try {
    const collect = vi.spyOn(app.get(CollectorService), 'collectImmediate');
    const url = await app.getUrl();
    const answer = (await (await fetch(`${url}/boom/error`)).json()) as { handledBy?: string };
    await fetch(`${url}/boom/http`);
    if (arrangement.includes('Error')) await fetch(`${url}/boom/string`);

    const recorded = collect.mock.calls
      .filter(([type]) => type === 'exception')
      .map(([, payload]) => (payload as { name: string }).name);
    const status = app
      .get(WatcherStatusService)
      .statuses()
      .find((report) => report.type === 'exception') as WatcherStatusReport;

    return { recorded, status, handledBy: answer.handledBy };
  } finally {
    await app.close();
  }
};

describe.each(['express', 'fastify'] as const)('the exception watcher on %s', (platform) => {
  it('records and says recording with no filter of the application', async () => {
    const { recorded, status } = await measure(platform, 'none');

    expect(recorded).toEqual(['Error', 'NotFoundException']);
    expect(status.state).toBe('recording');
  });

  it('is starved by a catch-all passed to useGlobalFilters, and says so', async () => {
    const { recorded, status } = await measure(platform, 'useGlobalFilters catch-all');

    expect(recorded).toEqual([]);
    expect(status).toMatchObject({
      state: 'waiting',
      reason: expect.stringContaining('CatchEverything'),
      docs: expect.stringContaining('/docs/watchers/exception#'),
    });
  });

  it('is starved by a catch-all APP_FILTER registered after it, and says so', async () => {
    const { recorded, status } = await measure(platform, 'APP_FILTER after NestLens');

    expect(recorded).toEqual([]);
    expect(status.state).toBe('waiting');
  });

  it('still records behind a catch-all APP_FILTER registered before it', async () => {
    const { recorded, status } = await measure(platform, 'APP_FILTER in AppModule');

    expect(recorded).toEqual(['Error', 'NotFoundException']);
    expect(status.state).toBe('recording');
  });

  it('records what a typed filter ahead of it leaves, and names what it does not see', async () => {
    const { recorded, status } = await measure(platform, 'useGlobalFilters HttpException');

    expect(recorded).toEqual(['Error']);
    expect(status).toMatchObject({
      state: 'recording',
      reason: expect.stringMatching(/HttpException.*CatchHttpExceptions/),
    });
  });

  it('names the catch-all Nest actually tries first, the one registered last', async () => {
    const { handledBy, status } = await measure(platform, 'two catch-alls');

    expect(handledBy).toBe('RegisteredSecond');
    expect(status.reason).toContain('RegisteredSecond');
  });

  it.each(['useGlobalFilters Error', 'APP_FILTER Error after NestLens'] as const)(
    'is starved of every Error by @Catch(Error) through %s, and says so',
    async (arrangement) => {
      const { recorded, status } = await measure(platform, arrangement);

      // Only a throw that is not an Error gets past it.
      expect(recorded).toEqual(['NonErrorThrow:string']);
      expect(status).toMatchObject({
        state: 'waiting',
        reason: expect.stringContaining('CatchErrors'),
      });
    },
  );

  it('is not starved by a catch-all added after the routes were built, and does not say so', async () => {
    // The routes take their filters when they are registered, during init;
    // a filter added afterwards is in the list and handles nothing.
    const { recorded, status } = await measure(platform, 'useGlobalFilters catch-all after listen');

    expect(recorded).toEqual(['Error', 'NotFoundException']);
    expect(status.state).toBe('recording');
  });
});
