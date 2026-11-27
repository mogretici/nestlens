import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { GraphQLSchema } from 'graphql';

/**
 * A spec that imports graphql gets the copy @nestjs/graphql requires.
 *
 * Vite's default extension order resolves graphql's extensionless
 * `"main": "index"` to `index.mjs` for an import, while @nestjs/graphql's
 * `require('graphql')` loads `index.js`: two copies in one process, and a
 * schema one builds that the other rejects. vitest.config.mts lists `.js`
 * before `.mjs`; this fails if that order is lost.
 */
describe('graphql under Vitest', () => {
  it('is the copy @nestjs/graphql loads', () => {
    const fromNestGraphql = createRequire(require.resolve('@nestjs/graphql'));
    const required = fromNestGraphql('graphql') as typeof import('graphql');

    expect(required.GraphQLSchema).toBe(GraphQLSchema);
  });
});
