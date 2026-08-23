/**
 * Recording an operation must never become the operation's answer.
 *
 * The GraphQL adapters are the one recording path that runs *inside* the host's
 * response pipeline, and their hooks had no containment at all. Measured
 * against the real servers, with a hook that throws, Apollo Server 4 answers
 * `Internal server error` and Mercurius 16 answers null data with the thrown
 * message in the errors array.
 *
 * A successful operation is replaced by a failure, and on Mercurius the
 * watcher's own message is handed to whoever asked. Everything else in NestLens
 * already refuses to do this: the collector resolves rather than rejects, the
 * exception filter re-throws what it was given, the field instrumentation keeps
 * its recording away from the resolver.
 *
 * The failures used here are the ones that can really happen — storage that is
 * not answering, and a payload the sanitizer cannot walk.
 */
import Fastify, { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { Logger } from '@nestjs/common';
import { CollectorService } from '../../../core/collector.service';
import { ApolloAdapter } from '../../../watchers/graphql/adapters/apollo.adapter';
import { createMercuriusAdapter } from '../../../watchers/graphql/adapters/mercurius.adapter';
import { forgetReported } from '../../../watchers/graphql/never-breaks-the-response';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';

const SCHEMA = `type Query { hello: String! }`;
const RESOLVERS = { Query: { hello: (): string => 'world' } };

/** A collector that cannot record, as during a storage outage. */
const failingCollector = (): CollectorService =>
  ({
    collect: async () => {
      throw new Error('storage is down');
    },
    collectImmediate: async () => {
      throw new Error('storage is down');
    },
  }) as unknown as CollectorService;

describe('a watcher that fails while recording', () => {
  jest.setTimeout(30_000);

  let warnings: string[];
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    forgetReported();
    warnings = [];
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => void warnings.push(String(message)));
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('on Mercurius', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      const adapter = createMercuriusAdapter();
      adapter.initialize(resolveGraphQLConfig(true), failingCollector());

      app = Fastify();
      await app.register(mercurius, {
        schema: SCHEMA,
        resolvers: RESOLVERS,
        graphiql: false,
        cache: false,
      });

      const hooks = adapter.getPlugin() as Record<string, unknown>;
      const graphql = (app as unknown as { graphql: { addHook: (n: string, h: unknown) => void } })
        .graphql;
      for (const name of ['preParsing', 'preValidation', 'preExecution', 'onResolution']) {
        if (hooks[name]) graphql.addHook(name, hooks[name]);
      }

      await app.ready();
    });

    afterEach(async () => {
      await app?.close();
    });

    it('answers the operation as though NestLens were not there', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: JSON.stringify({ query: '{ hello }' }),
        headers: { 'content-type': 'application/json' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ data: { hello: 'world' } });
    });

    it('says what failed, once', async () => {
      for (let i = 0; i < 3; i += 1) {
        await app.inject({
          method: 'POST',
          url: '/graphql',
          payload: JSON.stringify({ query: '{ hello }' }),
          headers: { 'content-type': 'application/json' },
        });
      }

      const reported = warnings.filter((warning) => warning.includes('onResolution'));

      expect(reported).toHaveLength(1);
      expect(reported[0]).toContain('storage is down');
    });
  });

  describe('on Apollo', () => {
    type Plugin = {
      requestDidStart(context: unknown): Promise<
        | {
            willSendResponse?: (ctx: unknown) => Promise<void>;
            executionDidStart?: () => Promise<{
              willResolveField?: (params: unknown) => unknown;
            } | void>;
          }
        | undefined
      >;
    };

    const pluginFor = (collector: CollectorService): Plugin => {
      const adapter = new ApolloAdapter();
      adapter.initialize(resolveGraphQLConfig(true), collector);

      return adapter.getPlugin() as unknown as Plugin;
    };

    const responseContext = (): unknown => ({
      response: { body: { kind: 'single', singleResult: { data: { hello: 'world' } } } },
    });

    it('does not reject when the entry cannot be recorded', async () => {
      const plugin = pluginFor(failingCollector());
      const listener = await plugin.requestDidStart({
        request: { query: '{ hello }' },
        contextValue: {},
      });

      await expect(listener?.willSendResponse?.(responseContext())).resolves.toBeUndefined();
      expect(warnings.join('\n')).toContain('storage is down');
    });

    it('does not reject when the variables cannot be walked', async () => {
      // A sanitizer that cannot read a value is the other way this fails, and
      // it fails on the way *in* rather than on the way out.
      const collected: unknown[] = [];
      const plugin = pluginFor({
        collect: async (_type: string, payload: unknown) => void collected.push(payload),
      } as unknown as CollectorService);

      const listener = await plugin.requestDidStart({
        request: {
          query: '{ hello }',
          variables: {
            get exploding(): string {
              throw new Error('getter says no');
            },
          },
        },
        contextValue: {},
      });

      await expect(listener?.willSendResponse?.(responseContext())).resolves.toBeUndefined();
      expect(collected).toHaveLength(0);
    });

    it('leaves a field resolving when watching it fails', async () => {
      const plugin = pluginFor(failingCollector());
      const listener = await plugin.requestDidStart({
        request: { query: '{ hello }' },
        contextValue: {},
      });

      const execution = await listener?.executionDidStart?.();

      // `info` is missing everything the tracker reads off it.
      expect(() => execution?.willResolveField?.({ info: undefined })).not.toThrow();
    });

    it('still records when nothing goes wrong', async () => {
      const collected: unknown[] = [];
      const plugin = pluginFor({
        collect: async (_type: string, payload: unknown) => void collected.push(payload),
      } as unknown as CollectorService);

      const listener = await plugin.requestDidStart({
        request: { query: '{ hello }' },
        contextValue: {},
      });
      await listener?.willSendResponse?.(responseContext());

      expect(collected).toHaveLength(1);
    });
  });
});
