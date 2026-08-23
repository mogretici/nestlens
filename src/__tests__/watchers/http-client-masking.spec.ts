/**
 * A masking term means the same thing wherever it is configured.
 *
 * The HTTP client watcher masks its own request and response bodies before the
 * collector sees them, and it had its own rule for what a term covers: the
 * field name lowercased, compared against the terms as written. So a term only
 * matched the spelling it happened to be written in.
 *
 *     term "internal_ref"   field "internalRef"    ->  recorded in full
 *     term "internalRef"    field "internal_ref"   ->  recorded in full
 *
 * The collector's masker normalises both sides and matches all four. A reader
 * configuring `sensitiveRequestParams` has no reason to expect a different
 * answer from a different place in the same product — and the collector could
 * not cover for it, because the term is theirs rather than one of its defaults.
 *
 * The built-in lists were affected too: they hold `credit_card` and
 * `card_number`, and a NestJS payload holds `creditCard` and `cardNumber`.
 * Those were caught downstream by the collector's own defaults, so they never
 * reached storage; a term the reader added had nothing behind it.
 */
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { HttpClientWatcher } from '../../watchers/http-client.watcher';

interface Recorded {
  requestBody?: unknown;
  responseBody?: unknown;
}

const SECRET = 'SECRET-VALUE';

const record = async (
  watcherConfig: Record<string, unknown>,
  requestBody: Record<string, unknown>,
  responseBody: Record<string, unknown> = {},
): Promise<Recorded> => {
  const entries: Recorded[] = [];
  const collector = {
    collect: async (_type: string, payload: Recorded) => void entries.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const watcher = new HttpClientWatcher(
    collector,
    { watchers: { httpClient: watcherConfig } } as unknown as NestLensConfig,
    undefined,
  );

  (
    watcher as unknown as {
      collectEntry: (
        config: unknown,
        statusCode?: number,
        responseHeaders?: Record<string, unknown>,
        responseData?: unknown,
      ) => void;
    }
  ).collectEntry(
    { method: 'POST', url: 'https://payments.test/charge', data: requestBody, headers: {} },
    200,
    {},
    responseBody,
  );

  await new Promise((resolve) => setTimeout(resolve, 20));

  return entries[0] ?? {};
};

const leaked = (recorded: Recorded): boolean => JSON.stringify(recorded).includes(SECRET);

describe('masking an HTTP client body', () => {
  describe('a term the reader configured', () => {
    it.each([
      ['snake term, snake field', 'internal_ref', 'internal_ref'],
      ['snake term, camel field', 'internal_ref', 'internalRef'],
      ['camel term, snake field', 'internalRef', 'internal_ref'],
      ['camel term, camel field', 'internalRef', 'internalRef'],
      ['kebab term, camel field', 'internal-ref', 'internalRef'],
      ['camel term, kebab field', 'internalRef', 'internal-ref'],
    ])('masks the request body: %s', async (_name, term, field) => {
      const recorded = await record(
        { enabled: true, sensitiveRequestParams: [term] },
        { [field]: SECRET },
      );

      expect(leaked(recorded)).toBe(false);
    });

    it('masks the response body the same way', async () => {
      const recorded = await record(
        { enabled: true, sensitiveResponseParams: ['internal_ref'] },
        {},
        { internalRef: SECRET },
      );

      expect(leaked(recorded)).toBe(false);
    });

    it('leaves a field no term covers alone', async () => {
      const recorded = await record(
        { enabled: true, sensitiveRequestParams: ['internal_ref'] },
        { amount: 1000, currency: 'EUR' },
      );

      expect(JSON.stringify(recorded)).toContain('1000');
      expect(JSON.stringify(recorded)).toContain('EUR');
    });
  });

  describe('the built-in terms', () => {
    it.each([
      'creditCard',
      'credit_card',
      'cardNumber',
      'card_number',
      'password',
      'newPassword',
      'new_password',
      'cvv',
      'ssn',
    ])('masks %s in the request body', async (field) => {
      const recorded = await record({ enabled: true }, { [field]: SECRET });

      expect(leaked(recorded)).toBe(false);
    });

    it.each(['accessToken', 'access_token', 'apiKey', 'api_key', 'refreshToken'])(
      'masks %s in the response body',
      async (field) => {
        const recorded = await record({ enabled: true }, {}, { [field]: SECRET });

        expect(leaked(recorded)).toBe(false);
      },
    );
  });

  describe('where the value is', () => {
    it('masks it inside a nested object', async () => {
      const recorded = await record(
        { enabled: true, sensitiveRequestParams: ['internal_ref'] },
        { customer: { billing: { internalRef: SECRET } } },
      );

      expect(leaked(recorded)).toBe(false);
    });

    it('masks it inside an array', async () => {
      const recorded = await record(
        { enabled: true, sensitiveRequestParams: ['internal_ref'] },
        { items: [{ internalRef: SECRET }, { ok: true }] },
      );

      expect(leaked(recorded)).toBe(false);
    });

    it('stops descending rather than overflowing', async () => {
      let deep: Record<string, unknown> = { internalRef: SECRET };
      for (let i = 0; i < 60; i += 1) deep = { nested: deep };

      const recorded = await record(
        { enabled: true, sensitiveRequestParams: ['internal_ref'] },
        deep,
      );

      // Truncated before it gets there, which is also not a leak.
      expect(leaked(recorded)).toBe(false);
    });
  });
});
