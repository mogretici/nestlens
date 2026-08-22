/**
 * Switching NestLens off has to switch all of it off.
 *
 * `forRoot` returns an empty module for `enabled: false` — no storage, no
 * watchers, no routes. The middleware that opens a request context is not part
 * of what `forRoot` returns, though: it is applied by `configure`, which
 * belongs to the module class. So the one arrangement a reader chooses in order
 * to pay nothing still ran, on every request of the application:
 *
 * ```text
 * a uuid, an AsyncLocalStorage.run, and a property written onto the request
 * ```
 */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestLensModule } from '../../nestlens.module';
import { currentRequestId } from '../../core/request-context';

interface Probe {
  contextOpen: boolean;
  marked: boolean;
}

@Controller('probe')
class ProbeController {
  @Get()
  read(): Probe {
    return { contextOpen: currentRequestId() !== undefined, marked: false };
  }
}

const boot = async (enabled: boolean): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [NestLensModule.forRoot({ enabled })],
    controllers: [ProbeController],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0, '127.0.0.1');

  return app;
};

describe('NestLens switched off', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('opens no request context', async () => {
    app = await boot(false);

    const body = (await fetch(`${await app.getUrl()}/probe`).then((r) => r.json())) as Probe;

    expect(body.contextOpen).toBe(false);
  });

  it('answers the application’s own routes as it always did', async () => {
    app = await boot(false);

    const response = await fetch(`${await app.getUrl()}/probe`);

    expect(response.status).toBe(200);
  });

  it('serves no dashboard', async () => {
    app = await boot(false);

    const response = await fetch(`${await app.getUrl()}/nestlens`);

    expect(response.status).toBe(404);
  });

  it('still opens a request context when it is on', async () => {
    // The other half: the correlation everything depends on has to survive
    // this being gated.
    app = await boot(true);

    const body = (await fetch(`${await app.getUrl()}/probe`).then((r) => r.json())) as Probe;

    expect(body.contextOpen).toBe(true);
  });
});
