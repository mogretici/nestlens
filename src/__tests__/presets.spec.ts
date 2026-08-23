/**
 * The production stance, written once in the package instead of in every
 * application.
 *
 * Recording only what failed takes five settings that are only correct
 * together, and one of them — that `filter` never sees what `sampling` drops —
 * is stated nowhere but in the collector's source. A deployment reported
 * reaching it at a hundred lines of configuration, arrived at by reading that
 * source.
 */
import { NestLensModule } from '../nestlens.module';
import { NESTLENS_CONFIG, NestLensConfig } from '../nestlens.config';
import { Entry } from '../types';

const provided = (config: NestLensConfig): NestLensConfig => {
  const dynamic = NestLensModule.forRoot(config);
  const providers = [
    ...(dynamic.providers ?? []),
    ...(dynamic.imports ?? []).flatMap(
      (imported) => (imported as { providers?: unknown[] }).providers ?? [],
    ),
  ];

  const found = providers.find(
    (provider) => (provider as { provide?: unknown }).provide === NESTLENS_CONFIG,
  ) as { useValue: NestLensConfig } | undefined;

  if (!found) throw new Error('NestLens provided no configuration');

  return found.useValue;
};

const entry = (type: string, payload: Record<string, unknown>): Entry =>
  ({ type, payload }) as unknown as Entry;

const keeps = (config: NestLensConfig, candidate: Entry): boolean =>
  provided(config).filter?.(candidate) === true;

const FAILURES: NestLensConfig = { preset: 'failures-only' };

describe('the failures-only preset', () => {
  it('records nothing ordinary', () => {
    expect(provided(FAILURES).sampling?.rate).toBe(0);
  });

  it('keeps the types a failure can arrive as', () => {
    expect(provided(FAILURES).sampling?.always).toEqual(
      expect.arrayContaining(['exception', 'graphql', 'request']),
    );
  });

  it.each([
    ['a thrown exception', 'exception', {}, true],
    ['a failed operation', 'graphql', { hasErrors: true, statusCode: 500 }, true],
    ['a query the caller got wrong', 'graphql', { hasErrors: true, statusCode: 400 }, false],
    ['an operation that worked', 'graphql', { hasErrors: false, statusCode: 200 }, false],
    ['a request that failed', 'request', { statusCode: 503 }, true],
    ['a request that was refused', 'request', { statusCode: 404 }, false],
    ['a request that worked', 'request', { statusCode: 200 }, false],
    ['a job that failed', 'job', { status: 'failed' }, true],
    ['a job that completed', 'job', { status: 'completed' }, false],
  ])('%s: %s', (_name, type, payload, kept) => {
    expect(keeps(FAILURES, entry(type, payload))).toBe(kept);
  });

  it('stops paying for a GraphQL response nothing will keep', () => {
    const graphql = provided(FAILURES).watchers?.graphql;

    expect(graphql).toMatchObject({ captureResponse: false, traceFieldResolvers: false });
  });

  describe('what the application writes wins', () => {
    it('takes a rate of its own', () => {
      expect(provided({ ...FAILURES, sampling: { rate: 0.5 } }).sampling?.rate).toBe(0.5);
    });

    it('keeps the preset’s `always` when only the rate is given', () => {
      expect(provided({ ...FAILURES, sampling: { rate: 0.5 } }).sampling?.always).toContain(
        'graphql',
      );
    });

    it('does not turn on a watcher that was turned off', () => {
      expect(provided({ ...FAILURES, watchers: { graphql: false } }).watchers?.graphql).toBe(false);
    });

    it('keeps a GraphQL setting of its own beside the preset’s', () => {
      const graphql = provided({
        ...FAILURES,
        watchers: { graphql: { maxQuerySize: 1024 } },
      }).watchers?.graphql;

      expect(graphql).toMatchObject({ maxQuerySize: 1024, captureResponse: false });
    });
  });

  describe('a filter of the application’s own', () => {
    const mine: NestLensConfig = {
      ...FAILURES,
      filter: (candidate) => (candidate.payload as { path?: string }).path !== '/health',
    };

    it('narrows further rather than replacing', () => {
      // Both have to agree: this is "the failures, and this too".
      expect(keeps(mine, entry('request', { statusCode: 500, path: '/orders' }))).toBe(true);
      expect(keeps(mine, entry('request', { statusCode: 500, path: '/health' }))).toBe(false);
    });

    it('cannot bring back what the preset drops', () => {
      expect(keeps(mine, entry('request', { statusCode: 200, path: '/orders' }))).toBe(false);
    });
  });

  it('leaves an application without a preset exactly as it was', () => {
    const plain = provided({ watchers: { request: true } });

    expect(plain.sampling).toBeUndefined();
    expect(plain.filter).toBeUndefined();
  });
});
