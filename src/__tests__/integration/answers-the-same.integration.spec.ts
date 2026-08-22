/**
 * An application answers the same with NestLens as without it.
 *
 * The exception watcher is a global filter, so it decides what every unhandled
 * failure returns — and it was writing its own response rather than Nest's.
 * The two did not agree. Nest's `BaseExceptionFilter` recognises the shape the
 * `http-errors` package throws, `{ statusCode, message }`, which is what
 * body-parser, serve-static and a great many middlewares raise, and answers
 * with the status it carries. Measured on the same controller, one application
 * with the watcher and one without:
 *
 *     GET /boom/http-error
 *       without   413  {"statusCode":413,"message":"request entity too large"}
 *       with      500  {"statusCode":500,"message":"request entity too large",
 *                       "error":"Internal Server Error"}
 *
 * A 413 became a 500 for every client, and the second half is worse: the
 * thrown message went into the body, where Nest deliberately answers
 * "Internal server error". Installing a debugging tool changed both the status
 * and the contents of the application's error responses.
 *
 * This compares the two, response by response.
 */
import {
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestLensModule } from '../../nestlens.module';

/** The shape `http-errors` throws, which is not an `HttpException`. */
class PayloadTooLargeError extends Error {
  statusCode = 413;

  constructor() {
    super('request entity too large');
  }
}

class BadJsonError extends Error {
  statusCode = 400;

  constructor() {
    super('Unexpected token } in JSON at position 4');
  }
}

@Controller('boom')
class BoomController {
  @Get('http-error')
  httpError(): never {
    throw new PayloadTooLargeError();
  }

  @Get('bad-json')
  badJson(): never {
    throw new BadJsonError();
  }

  @Get('plain')
  plain(): never {
    throw new Error('a plain failure, with internals in it');
  }

  @Get('nest')
  nest(): never {
    throw new NotFoundException('gone');
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException();
  }

  @Get('string')
  string(): never {
    throw 'just a string';
  }

  @Get('null')
  nothing(): never {
    throw null;
  }

  @Get('fine')
  fine(): { ok: boolean } {
    return { ok: true };
  }
}

describe('an application answers the same with NestLens as without', () => {
  jest.setTimeout(60_000);

  let bare: INestApplication;
  let watched: INestApplication;

  const start = async (imports: unknown[]): Promise<INestApplication> => {
    const moduleRef = await Test.createTestingModule({
      imports: imports as never[],
      controllers: [BoomController],
    }).compile();

    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    await app.listen(0, '127.0.0.1');
    return app;
  };

  beforeAll(async () => {
    bare = await start([]);
    watched = await start([
      NestLensModule.forRoot({
        watchers: { exception: true, request: false, log: false },
      }),
    ]);
  });

  afterAll(async () => {
    await bare?.close();
    await watched?.close();
  });

  const answer = async (app: INestApplication, path: string): Promise<string> => {
    const response = await fetch(`${await app.getUrl()}${path}`);
    return `${response.status} ${await response.text()}`;
  };

  it.each([
    ['an http-errors 413', '/boom/http-error'],
    ['an http-errors 400', '/boom/bad-json'],
    ['a plain Error', '/boom/plain'],
    ['a NotFoundException', '/boom/nest'],
    ['a ForbiddenException with no message', '/boom/forbidden'],
    ['a thrown string', '/boom/string'],
    ['a thrown null', '/boom/null'],
    ['a request that works', '/boom/fine'],
  ])('answers %s identically', async (_name, path) => {
    expect(await answer(watched, path)).toBe(await answer(bare, path));
  });

  it('keeps the status the error carried', async () => {
    // Named on its own because this is the one that changed for every client.
    expect(await answer(watched, '/boom/http-error')).toContain('413');
  });

  it('does not put the thrown message in the body', async () => {
    expect(await answer(watched, '/boom/plain')).not.toContain('internals in it');
  });

  it('still records the exception it passed through', async () => {
    const { CollectorService } = await import('../../core/collector.service');
    const { STORAGE } = await import('../../core/storage/storage.interface');
    const storage = watched.get(STORAGE) as { find(f: unknown): Promise<unknown[]> };

    await answer(watched, '/boom/plain');
    await (watched.get(CollectorService) as { flush(): Promise<void> }).flush();

    const entries = await storage.find({ type: 'exception', limit: 20 });
    expect(entries.length).toBeGreaterThan(0);
  });
});
