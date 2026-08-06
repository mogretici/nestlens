import { BaseGraphQLAdapter } from '../../../watchers/graphql/adapters/base.adapter';
import { resolveGraphQLConfig, ResolvedGraphQLConfig } from '../../../watchers/graphql/types';
import { CollectorService } from '../../../core';

/**
 * Minimal concrete adapter so the protected header helpers on
 * BaseGraphQLAdapter can be exercised in isolation.
 */
class TestAdapter extends BaseGraphQLAdapter {
  readonly type = 'apollo' as const;
  isAvailable(): boolean {
    return true;
  }
  getPlugin(): unknown {
    return {};
  }
  publicMask(headers: Record<string, unknown>): Record<string, string> {
    return this.maskHeaders(headers);
  }
  publicCapture(request: unknown): Record<string, string> | undefined {
    return this.captureRequestHeaders(request);
  }
}

function makeAdapter(config: ResolvedGraphQLConfig): TestAdapter {
  const adapter = new TestAdapter();
  adapter.initialize(config, {} as CollectorService);
  return adapter;
}

describe('GraphQL header masking', () => {
  describe('resolveGraphQLConfig sensitiveHeaders', () => {
    it('includes the built-in sensitive headers by default', () => {
      const config = resolveGraphQLConfig(true);
      expect(config.sensitiveHeaders).toEqual(
        expect.arrayContaining([
          'authorization',
          'cookie',
          'set-cookie',
          'x-api-key',
          'x-auth-token',
        ]),
      );
    });

    it('merges user-provided headers with the built-in defaults', () => {
      const config = resolveGraphQLConfig({ sensitiveHeaders: ['x-csrf-token', 'x-session-id'] });
      expect(config.sensitiveHeaders).toEqual(
        expect.arrayContaining(['authorization', 'cookie', 'x-csrf-token', 'x-session-id']),
      );
    });
  });

  describe('maskHeaders', () => {
    it('masks the built-in sensitive headers regardless of casing', () => {
      const adapter = makeAdapter(resolveGraphQLConfig(true));
      const masked = adapter.publicMask({
        Authorization: 'Bearer secret',
        Cookie: 'session=abc',
        'X-Api-Key': 'key-123',
        'content-type': 'application/json',
      });
      expect(masked.Authorization).toBe('***');
      expect(masked.Cookie).toBe('***');
      expect(masked['X-Api-Key']).toBe('***');
      expect(masked['content-type']).toBe('application/json');
    });

    it('masks additional user-configured headers', () => {
      const adapter = makeAdapter(resolveGraphQLConfig({ sensitiveHeaders: ['x-csrf-token'] }));
      const masked = adapter.publicMask({ 'x-csrf-token': 'tok', accept: 'application/json' });
      expect(masked['x-csrf-token']).toBe('***');
      expect(masked.accept).toBe('application/json');
    });

    it('stringifies numeric and boolean header values', () => {
      const adapter = makeAdapter(resolveGraphQLConfig(true));
      const masked = adapter.publicMask({ 'content-length': 42, 'x-flag': true });
      expect(masked['content-length']).toBe('42');
      expect(masked['x-flag']).toBe('true');
    });

    it('joins array header values', () => {
      const adapter = makeAdapter(resolveGraphQLConfig(true));
      const masked = adapter.publicMask({ 'accept-language': ['en', 'tr'] });
      expect(masked['accept-language']).toBe('en, tr');
    });
  });

  describe('captureRequestHeaders', () => {
    it('returns undefined when captureHeaders is disabled', () => {
      const adapter = makeAdapter(resolveGraphQLConfig({ captureHeaders: false }));
      expect(adapter.publicCapture({ headers: { authorization: 'Bearer x' } })).toBeUndefined();
    });

    it('captures and masks headers from a request when enabled', () => {
      const adapter = makeAdapter(resolveGraphQLConfig(true));
      const result = adapter.publicCapture({
        headers: { authorization: 'Bearer x', 'user-agent': 'jest' },
      });
      expect(result).toEqual({ authorization: '***', 'user-agent': 'jest' });
    });
  });
});
