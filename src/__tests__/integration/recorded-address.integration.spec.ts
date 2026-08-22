/**
 * The address the dashboard shows and the address the guard checks.
 *
 * They were resolved by two copies of the same rule that had drifted apart:
 * the guard reads a forwarding header only under `trustProxy`, the request
 * watcher read it always. So with the default settings a caller could put any
 * address in a header and see it recorded against their own request, while the
 * whitelist went on checking the socket. The IP column, the `ips` filter and
 * an incident investigation all read the field the caller wrote.
 */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NestLensModule } from '../../nestlens.module';
import { Entry } from '../../types';

@Controller('orders')
class OrdersController {
  @Get()
  list(): { ok: boolean } {
    return { ok: true };
  }
}

const CLAIMED = '10.0.0.1';

const build = async (trustProxy: boolean): Promise<{ app: INestApplication; url: string }> => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      NestLensModule.forRoot({
        trustProxy,
        watchers: { request: true, exception: false, log: false },
      }),
    ],
    controllers: [OrdersController],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0, '127.0.0.1');

  return { app, url: await app.getUrl() };
};

/** The address recorded against a request that claimed one in a header. */
const recordedAddress = async (app: INestApplication, url: string): Promise<string | undefined> => {
  await fetch(`${url}/orders`, { headers: { 'x-forwarded-for': CLAIMED } });
  await app.get(CollectorService).flush();

  const [entry] = await app.get<StorageInterface>(STORAGE).find({ type: 'request', limit: 1 });

  return (entry as Entry)?.payload && (entry.payload as { ip?: string }).ip;
};

describe('the address a request is recorded against', () => {
  jest.setTimeout(30_000);

  it('is the socket address when no proxy is trusted', async () => {
    const { app, url } = await build(false);

    try {
      expect(await recordedAddress(app, url)).not.toBe(CLAIMED);
    } finally {
      await app.close();
    }
  });

  it('is the forwarded address when one is', async () => {
    const { app, url } = await build(true);

    try {
      expect(await recordedAddress(app, url)).toBe(CLAIMED);
    } finally {
      await app.close();
    }
  });

  it('agrees with the address the whitelist checks', async () => {
    // The whitelist holds only the loopback address the socket really has, so
    // a caller claiming an allowed address in a header must still be refused —
    // and must not then be recorded under the address they claimed.
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestLensModule.forRoot({
          trustProxy: false,
          authorization: { allowedEnvironments: null, allowedIps: [CLAIMED] },
          watchers: { request: true },
        }),
      ],
      controllers: [OrdersController],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();

    try {
      const response = await fetch(`${url}/nestlens/__nestlens__/api/stats`, {
        headers: { 'x-forwarded-for': CLAIMED },
      });

      // Refused, because the socket address is not the claimed one...
      expect(response.status).toBe(403);
      // ...and the watcher agrees about which address that is.
      expect(await recordedAddress(app, url)).not.toBe(CLAIMED);
    } finally {
      await app.close();
    }
  });
});
