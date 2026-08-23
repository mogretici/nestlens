/**
 * Which resolver calls can be an N+1.
 *
 * Every counted call used to be a candidate, so a query over sixteen order
 * items reported three findings of equal weight — measured against the example
 * application:
 *
 *     OrderItem.id       16 times   "consider using DataLoader"
 *     OrderItem.product  16 times   "consider using DataLoader"
 *     Product.name       16 times   "consider using DataLoader"
 *
 * One of those is the query's actual problem and two are property reads. A
 * DataLoader for `id` is advice a reader has to know to ignore, and the finding
 * that matters is buried among them.
 *
 * The first attempt at separating them asked whether the field had a resolver
 * of its own. It does not work: `@nestjs/graphql` attaches one to every field
 * of a code-first schema, which the running application confirmed —
 * `OrderItem.id getFields=function resolve=function`. What does separate them
 * is what the field returns. A scalar or an enum is a leaf; an object, or a
 * list of them, is the shape an N+1 takes.
 *
 * After the change the same query reports `OrderItem.product x16` and nothing
 * else.
 */
import { createApolloAdapter } from '../../../watchers/graphql/adapters/apollo.adapter';
import { CollectorService } from '../../../core/collector.service';
import { resolveGraphQLConfig } from '../../../watchers/graphql/types';

/** A graphql-js type, structurally: only what the check reads. */
const objectType = (name: string) => ({
  name,
  toString: () => name,
  getFields: () => ({}),
});

const scalarType = (name: string) => ({ name, toString: () => name });

const nonNull = (of: unknown) => ({ ofType: of, toString: () => `${String(of)}!` });
const list = (of: unknown) => ({ ofType: of, toString: () => `[${String(of)}]` });

interface Plugin {
  requestDidStart: (context: unknown) => Promise<{
    executionDidStart?: () => Promise<{
      willResolveField: (params: { info: unknown }) => unknown;
    }>;
    willSendResponse?: (context: unknown) => Promise<void>;
  }>;
}

/**
 * Runs a set of field resolutions through the plugin and reports what the
 * recorded entry says was a potential N+1.
 */
const findingsFor = async (fields: { parent: string; field: string; returns: unknown }[]) => {
  const entries: { potentialN1?: { parentType: string; field: string }[] }[] = [];

  const collector = {
    collect: async (_type: string, payload: { potentialN1?: never }) => void entries.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const adapter = createApolloAdapter();
  adapter.initialize(
    resolveGraphQLConfig({ detectN1Queries: true, n1Threshold: 3 } as never),
    collector,
  );

  const plugin = adapter.getPlugin() as unknown as Plugin;
  const requestContext = {
    request: { query: 'query Q { a }', operationName: 'Q', variables: {} },
    contextValue: {},
    response: { body: { kind: 'single', singleResult: { data: {} } } },
  };

  const listener = await plugin.requestDidStart(requestContext);
  const execution = await listener.executionDidStart?.();

  // Four calls each, which is over the threshold of three.
  for (let i = 0; i < 4; i += 1) {
    for (const { parent, field, returns } of fields) {
      execution?.willResolveField({
        info: {
          fieldName: field,
          parentType: { name: parent },
          returnType: returns,
          path: { key: field },
        },
      });
    }
  }

  await listener.willSendResponse?.(requestContext);
  await new Promise((resolve) => setTimeout(resolve, 20));

  return (entries[0]?.potentialN1 ?? []).map((n) => `${n.parentType}.${n.field}`);
};

describe('what counts towards an N+1', () => {
  it('reports a field returning an object', async () => {
    const findings = await findingsFor([
      { parent: 'OrderItem', field: 'product', returns: objectType('Product') },
    ]);

    expect(findings).toEqual(['OrderItem.product']);
  });

  it('reports a field returning a list of objects', async () => {
    const findings = await findingsFor([
      { parent: 'Order', field: 'items', returns: nonNull(list(nonNull(objectType('OrderItem')))) },
    ]);

    expect(findings).toEqual(['Order.items']);
  });

  it.each([
    ['a string', 'id', scalarType('String')],
    ['a non-null string', 'name', nonNull(scalarType('String'))],
    ['a list of strings', 'tags', list(nonNull(scalarType('String')))],
    ['a number', 'total', nonNull(scalarType('Float'))],
  ])('says nothing about a field returning %s', async (_name, field, returns) => {
    expect(await findingsFor([{ parent: 'OrderItem', field, returns }])).toEqual([]);
  });

  it('leaves the property reads out and keeps the fetch', async () => {
    // The shape the example application produced.
    const findings = await findingsFor([
      { parent: 'OrderItem', field: 'id', returns: nonNull(scalarType('ID')) },
      { parent: 'OrderItem', field: 'product', returns: objectType('Product') },
      { parent: 'Product', field: 'name', returns: nonNull(scalarType('String')) },
    ]);

    expect(findings).toEqual(['OrderItem.product']);
  });

  it('says nothing below the threshold', async () => {
    const entries: { potentialN1?: unknown }[] = [];
    const collector = {
      collect: async (_t: string, p: { potentialN1?: never }) => void entries.push(p),
      collectImmediate: async () => null,
    } as unknown as CollectorService;

    const adapter = createApolloAdapter();
    adapter.initialize(
      resolveGraphQLConfig({ detectN1Queries: true, n1Threshold: 100 } as never),
      collector,
    );

    const plugin = adapter.getPlugin() as unknown as Plugin;
    const context = {
      request: { query: 'query Q { a }', operationName: 'Q', variables: {} },
      contextValue: {},
      response: { body: { kind: 'single', singleResult: { data: {} } } },
    };

    const listener = await plugin.requestDidStart(context);
    const execution = await listener.executionDidStart?.();
    execution?.willResolveField({
      info: {
        fieldName: 'product',
        parentType: { name: 'OrderItem' },
        returnType: objectType('Product'),
        path: { key: 'product' },
      },
    });

    await listener.willSendResponse?.(context);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(entries[0]?.potentialN1 ?? []).toEqual([]);
  });
});
