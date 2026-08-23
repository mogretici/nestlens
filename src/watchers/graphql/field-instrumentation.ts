/**
 * Making resolvers reach the watcher on a server that has no hook for them.
 *
 * Apollo calls `willResolveField` for every field, which is where the resolver
 * count, the N+1 detector and the field tracer are fed. Mercurius has no such
 * hook — its own hooks are per-operation — so the adapter grew a
 * `trackResolver` method with a comment saying it "would need to be integrated
 * via custom wrapper", and nothing ever called it. Measured on a real Mercurius
 * server with a query resolving five orders of four items each, with
 * `traceFieldResolvers` and `detectN1Queries` both on:
 *
 *     resolverCount  0        (forty-six resolvers ran)
 *     fieldTraces    0
 *     potentialN1    undefined
 *
 * Three documented options doing nothing, on a server documented as supported.
 *
 * The schema is where every server meets: wrapping each field's `resolve` sees
 * every call whichever one is underneath. Fields that declare no resolver are
 * served by graphql-js's default, so that is installed and wrapped too —
 * otherwise a scalar read would be invisible here and counted on Apollo, and
 * the two servers would disagree about how many resolvers an operation ran.
 */
import { Logger } from '@nestjs/common';

const logger = new Logger('GraphQLFields');

/** The shape of a schema, structurally, so `graphql` need not be imported. */
interface FieldSchema {
  getTypeMap?: () => Record<string, unknown>;
}

interface FieldContainer {
  name?: string;
  getFields?: () => Record<string, InstrumentableField>;
}

interface InstrumentableField {
  resolve?: (...args: unknown[]) => unknown;
}

/** What graphql-js hands a resolver as its fourth argument. */
export type ResolveInfo = unknown;

/**
 * Called before a field resolves; whatever it returns is called after.
 *
 * The context is the third resolver argument, which is where the adapters keep
 * what they are tracking for the operation.
 */
export type FieldObserver = (
  info: ResolveInfo,
  context: unknown,
) => ((error?: unknown) => void) | undefined;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown })?.then === 'function';

/**
 * graphql-js's own default resolver, which serves every field that declares
 * none. Required rather than reimplemented: it is the package's contract, and
 * a GraphQL server cannot be installed without it.
 */
const loadDefaultResolver = (): ((...args: unknown[]) => unknown) | undefined => {
  try {
    const graphql = require('graphql') as {
      defaultFieldResolver?: (...args: unknown[]) => unknown;
    };

    return graphql.defaultFieldResolver;
  } catch {
    return undefined;
  }
};

/**
 * Wraps every field resolver in the schema so `observe` sees each call.
 *
 * Returns a function that puts the schema back as it was.
 */
export function instrumentFieldResolvers(schema: unknown, observe: FieldObserver): () => void {
  const typeMap = (schema as FieldSchema)?.getTypeMap?.();

  if (!typeMap) {
    logger.debug('No schema to instrument for field resolvers.');
    return () => undefined;
  }

  const defaultResolver = loadDefaultResolver();
  const restores: (() => void)[] = [];

  for (const [typeName, type] of Object.entries(typeMap)) {
    // Introspection is the client asking about the schema, not the
    // application doing work.
    if (typeName.startsWith('__')) continue;

    const fields = (type as FieldContainer)?.getFields?.();
    if (!fields) continue;

    for (const field of Object.values(fields)) {
      const original = field.resolve ?? defaultResolver;
      if (typeof original !== 'function') continue;

      const previous = field.resolve;

      field.resolve = function instrumented(...args: unknown[]): unknown {
        const context = args[2];
        const info = args[3];

        let done: ((error?: unknown) => void) | undefined;
        try {
          done = observe(info, context);
        } catch {
          // Recording must never reach the resolver.
        }

        /**
         * Called however the field ended, with what it threw if it threw.
         *
         * The error is the only place a Mercurius resolver's own exception can
         * be seen: by the time its `onResolution` hook runs, the errors have
         * been formatted into `{ message, locations, path }` — no name, no
         * stack, nothing of what was thrown.
         */
        const finish = (error?: unknown): void => {
          try {
            done?.(error);
          } catch {
            // As above.
          }
        };

        let result: unknown;
        try {
          result = original.apply(this, args);
        } catch (error) {
          finish(error);
          throw error;
        }

        if (isThenable(result)) {
          return Promise.resolve(result).then(
            (value) => {
              finish();
              return value;
            },
            (error) => {
              finish(error);
              throw error;
            },
          );
        }

        finish();
        return result;
      };

      restores.push(() => {
        field.resolve = previous;
      });
    }
  }

  logger.log(`GraphQL field tracking installed (${restores.length} resolvers)`);

  return () => {
    for (const restore of restores) restore();
    restores.length = 0;
  };
}
