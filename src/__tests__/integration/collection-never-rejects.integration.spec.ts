/**
 * Recording an entry must never reject into the application.
 *
 * Two of the three callers of `collectImmediate` do not await it — the
 * exception filter is the important one, since it runs on every failure the
 * application has. A rejected promise nobody is holding is an unhandled
 * rejection, and Node's default is to end the process on those.
 *
 * So a database outage during an application error was fatal:
 *
 *     5 failing saves  ->  5 unhandled rejections  ->  process ends
 *
 * The application was handling its own errors correctly and its database being
 * unreachable is exactly when its logs matter most. Losing entries there is
 * expected; losing the process is not.
 *
 * `collect` had the same shape one step earlier — the request watcher does not
 * await it either, and masking walks a payload the application supplied.
 */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NestLensModule } from '../../nestlens.module';

@Controller('failing')
class FailingController {
  @Get('boom')
  boom(): never {
    throw new Error('application failure');
  }

  @Get('ok')
  ok(): { ok: boolean } {
    return { ok: true };
  }

  @Get('hostile')
  hostile(): unknown {
    // A payload whose own getters throw when the masker walks it.
    return {
      get exploding(): string {
        throw new Error('getter says no');
      },
    };
  }
}

describe('collection during a storage outage', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let url: string;
  let rejections: unknown[];
  let onRejection: (reason: unknown) => void;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestLensModule.forRoot({ watchers: { request: true, exception: true, log: false } }),
      ],
      controllers: [FailingController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();

    // Storage stops answering, as during a database outage.
    const storage = app.get<StorageInterface>(STORAGE);
    storage.save = async () => {
      throw new Error('storage is down');
    };
    storage.saveBatch = async () => {
      throw new Error('storage is down');
    };
  });

  beforeEach(() => {
    rejections = [];
    onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
  });

  afterEach(() => {
    process.off('unhandledRejection', onRejection);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers requests that fail while storage is down', async () => {
    for (let i = 0; i < 5; i += 1) {
      const response = await fetch(`${url}/failing/boom`);
      expect(response.status).toBe(500);
    }

    // Give any rejection a chance to surface.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(rejections).toHaveLength(0);
  });

  it('answers successful requests while storage is down', async () => {
    for (let i = 0; i < 5; i += 1) {
      const response = await fetch(`${url}/failing/ok`);
      expect(response.status).toBe(200);
    }

    await app.get(CollectorService).flush();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(rejections).toHaveLength(0);
  });

  it('survives a payload whose getters throw', async () => {
    // Masking walks what the application returned; that walk failing is the
    // application's problem to have, not a promise to reject.
    const response = await fetch(`${url}/failing/hostile`);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect([200, 500]).toContain(response.status);
    expect(rejections).toHaveLength(0);
  });

  it('returns null from collectImmediate rather than rejecting', async () => {
    const collector = app.get(CollectorService);

    await expect(
      collector.collectImmediate('exception', {
        name: 'Error',
        message: 'x',
      } as never),
    ).resolves.toBeNull();
  });

  it('resolves collect even though nothing can be written', async () => {
    const collector = app.get(CollectorService);

    await expect(
      collector.collect('log', { level: 'error', message: 'x' } as never),
    ).resolves.toBeUndefined();
  });
});
