/**
 * What the offset-paged endpoints do with a query string they cannot use.
 *
 * These handlers read their parameters as raw strings and parsed them by hand,
 * and the tests that covered them called the handlers directly — so the
 * validation pipe, which is the only thing that could have rejected anything,
 * never ran in a single test. Measured against the storages:
 *
 *     find({ from: new Date('not-a-date') })
 *       sqlite  ->  RangeError: Invalid time value
 *       memory  ->  0 entries
 *
 * A query string producing a 500 from one backend and an empty list from
 * another is two bugs, and the second is worse: it looks like an answer.
 *
 * `entries/cursor` next to them has validated its fifty parameters through a
 * DTO all along. These do now, so an unusable parameter is a 400 that names
 * it, whatever the storage underneath.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestLensModule } from '../../nestlens.module';

const API = '/nestlens/__nestlens__/api';

describe('validating an offset-paged query', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NestLensModule.forRoot({ watchers: { request: false, exception: false } })],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string) => fetch(`${url}${API}${path}`);

  describe('a date it cannot read', () => {
    it.each([
      ['from', '/entries?from=yesterday'],
      ['to', '/entries?to=whenever'],
      ['from, empty-ish', '/entries?from=NaN'],
      ['both', '/entries?from=x&to=y'],
    ])('answers 400 for %s', async (_name, query) => {
      // This was a 500 on SQLite and an empty 200 on the others.
      expect((await get(query)).status).toBe(400);
    });

    it('says which parameter it could not read', async () => {
      const body = (await (await get('/entries?from=yesterday')).json()) as {
        message?: unknown;
      };

      expect(JSON.stringify(body)).toContain('from');
    });

    it('still accepts a date it can read', async () => {
      const response = await get('/entries?from=2024-01-01T00:00:00Z&to=2030-01-01T00:00:00Z');

      expect(response.status).toBe(200);
    });

    it('still accepts no date at all', async () => {
      expect((await get('/entries')).status).toBe(200);
    });
  });

  describe('a type that does not exist', () => {
    it('answers 400', async () => {
      expect((await get('/entries?type=nonsense')).status).toBe(400);
    });

    it('still accepts every type there is', async () => {
      for (const type of ['request', 'query', 'exception', 'log', 'graphql']) {
        expect([type, (await get(`/entries?type=${type}`)).status]).toEqual([type, 200]);
      }
    });
  });

  describe('pagination it cannot use', () => {
    it('falls back to the default limit', async () => {
      const body = (await (await get('/entries?limit=invalid')).json()) as {
        meta: { limit: number };
      };

      expect(body.meta.limit).toBe(50);
    });

    it('caps the limit', async () => {
      const body = (await (await get('/entries?limit=999999')).json()) as {
        meta: { limit: number };
      };

      expect(body.meta.limit).toBe(1000);
    });

    it('refuses to go below the start', async () => {
      const body = (await (await get('/entries?offset=-5')).json()) as {
        meta: { offset: number };
      };

      expect(body.meta.offset).toBe(0);
    });
  });

  describe('the sequence the live tail polls with', () => {
    it('answers 400 when it is missing', async () => {
      // `parseInt(undefined)` is NaN, and NaN reached the storage — Redis was
      // asked for `zcount (NaN +inf`. The tail polls, so it would have been a
      // 500 every few seconds.
      expect((await get('/entries/check-new')).status).toBe(400);
    });

    it('answers 400 when it cannot be read', async () => {
      expect((await get('/entries/check-new?afterSequence=abc')).status).toBe(400);
    });

    it('answers when it can', async () => {
      const response = await get('/entries/check-new?afterSequence=0');
      const body = (await response.json()) as { data: { hasNew: boolean } };

      expect(response.status).toBe(200);
      expect(body.data).toHaveProperty('hasNew');
    });
  });

  describe('the tag endpoint', () => {
    /**
     * It read three raw query parameters and trusted all of them. Measured
     * against a running application, on a store where 111 entries carried the
     * tag:
     *
     *     /tags/entries                     500  — `undefined.split(',')`
     *     ?tags=CAPACITY&limit=abc               200, 0 rows    — NaN reached storage
     *     ?tags=CAPACITY&limit=-5                200, 106 rows  — a negative limit
     *     ?tags=CAPACITY&limit=1e8               200, 111 rows  — no ceiling
     *     ?tags=CAPACITY&logic=XOR               200            — treated as OR
     *
     * The first reports a caller's missing parameter as a server fault. The
     * second is worse: an unreadable limit answers with an empty list, which
     * reads as "nothing carries this tag".
     */
    const tagsApi = (path: string) => fetch(`${url}${API}/tags${path}`);

    beforeAll(async () => {
      // More than any default or cap, so what a limit does is observable. The
      // limit cases were written before this and proved nothing: the fixture
      // held fewer entries than the smallest limit under test, so every answer
      // was the same length whatever the parameter said.
      const { CollectorService: Collector } = await import('../../core/collector.service');
      const { STORAGE: storageToken } = await import('../../core/storage/storage.interface');
      const collector = app.get(Collector);

      for (let i = 0; i < 120; i += 1) {
        await collector.collectImmediate('log', {
          level: 'warn',
          message: `tagged ${i}`,
          context: 'Tagging',
        } as never);
      }

      const storage = app.get(
        storageToken,
      ) as import('../../core/storage/storage.interface').StorageInterface;
      const recent = await storage.find({ type: 'log', limit: 120 });

      for (const entry of recent) {
        await storage.addTags(entry.id as number, ['CAPACITY']);
      }
    });

    it('answers 400 when no tag is named', async () => {
      expect((await tagsApi('/entries')).status).toBe(400);
    });

    it('answers 400 when the tag list is empty', async () => {
      expect((await tagsApi('/entries?tags=')).status).toBe(400);
    });

    it('answers 400 for a logic it does not have', async () => {
      expect((await tagsApi('/entries?tags=CAPACITY&logic=XOR')).status).toBe(400);
    });

    it.each(['AND', 'OR'])('accepts %s', async (logic) => {
      expect((await tagsApi(`/entries?tags=CAPACITY&logic=${logic}`)).status).toBe(200);
    });

    it('falls back to the default limit rather than returning nothing', async () => {
      // The failure: `parseInt('abc')` reached the storage as NaN.
      const body = (await (await tagsApi('/entries?tags=CAPACITY&limit=abc')).json()) as {
        data: unknown[];
      };
      const asked = (await (await tagsApi('/entries?tags=CAPACITY&limit=50')).json()) as {
        data: unknown[];
      };

      expect(body.data.length).toBe(asked.data.length);
    });

    it('refuses to read a negative limit as "nearly everything"', async () => {
      const body = (await (await tagsApi('/entries?tags=CAPACITY&limit=-5')).json()) as {
        data: unknown[];
      };

      expect(body.data.length).toBeLessThanOrEqual(50);
    });

    it('caps a limit that asks for everything', async () => {
      const body = (await (await tagsApi('/entries?tags=CAPACITY&limit=99999999')).json()) as {
        data: unknown[];
      };

      expect(body.data.length).toBeLessThanOrEqual(1000);
    });

    it('still answers an ordinary request', async () => {
      expect((await tagsApi('/entries?tags=CAPACITY&limit=5')).status).toBe(200);
    });
  });

  describe('narrowing a list', () => {
    beforeAll(async () => {
      // The matches are the oldest, so nothing on the first page matches
      // unless the narrowing happened before the page was chosen.
      const collector = app.get(
        (await import('../../core/collector.service')).CollectorService,
      ) as import('../../core/collector.service').CollectorService;

      for (let i = 0; i < 5; i += 1) {
        await collector.collectImmediate('log', {
          level: 'error',
          message: `boom ${i}`,
          context: 'App',
        } as never);
      }
      for (let i = 0; i < 120; i += 1) {
        await collector.collectImmediate('log', {
          level: 'info',
          message: `m${i}`,
          context: 'App',
        } as never);
      }
    });

    it('returns the matches rather than the matches on page one', async () => {
      const body = (await (await get('/logs?level=error&limit=50')).json()) as {
        data: unknown[];
        meta: { total: number };
      };

      expect(body.data).toHaveLength(5);
    });

    it('counts the matches rather than the type', async () => {
      const body = (await (await get('/logs?level=error&limit=50')).json()) as {
        meta: { total: number };
      };

      // This used to be `count('log')` — every log there is.
      expect(body.meta.total).toBe(5);
    });

    it('still returns everything when nothing is narrowed', async () => {
      // Counted against what the endpoint itself reports rather than against a
      // number written here, which another test's fixture can move.
      const body = (await (await get('/logs?limit=1000')).json()) as {
        data: unknown[];
        meta: { total: number };
      };

      expect(body.data).toHaveLength(body.meta.total);
      expect(body.meta.total).toBeGreaterThan(120);
    });

    it('pages through the matches', async () => {
      const first = (await (await get('/logs?level=error&limit=2')).json()) as {
        data: { id: number }[];
      };
      const second = (await (await get('/logs?level=error&limit=2&offset=2')).json()) as {
        data: { id: number }[];
      };

      expect(first.data).toHaveLength(2);
      expect(second.data).toHaveLength(2);
      expect(second.data[0].id).not.toBe(first.data[0].id);
    });
  });
});
