/**
 * Exception alerting integration test.
 *
 * Boots a real NestJS app with alerting enabled and a throwing route, then
 * asserts the configured webhook receives the exception in real time through
 * the full collector → entry stream → alerting pipeline.
 */
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestLensModule } from '../../nestlens.module';

@Controller('demo')
class DemoController {
  @Get('explode')
  explode(): never {
    throw new HttpException('integration boom', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Exception alerting (integration)', () => {
  let app: INestApplication;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    (global as any).fetch = fetchMock;

    @Module({
      imports: [
        NestLensModule.forRoot({
          watchers: { request: false, exception: true },
          alerting: {
            enabled: true,
            webhooks: [{ url: 'https://hooks.example.com/nestlens', type: 'generic' }],
          },
        }),
      ],
      controllers: [DemoController],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('delivers a webhook when an exception is thrown', async () => {
    const { default: request } = await import('supertest');
    await request(app.getHttpServer()).get('/demo/explode');

    // Alerting is fire-and-forget; give the async dispatch a tick.
    for (let i = 0; i < 40 && fetchMock.mock.calls.length === 0; i++) {
      await sleep(25);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/nestlens');
    const body = JSON.parse(init.body);
    expect(body.event).toBe('exception');
    expect(body.entry.type).toBe('exception');
  });
});
