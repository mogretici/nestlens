/**
 * A package NestLens loads with `require()` is the copy the application imports.
 *
 * NestLens reaches its optional peers lazily, with `require()`, and the suite
 * imports the same packages. Node resolves both to one file. Vite, which loads
 * the suite, tries `.mjs` before `.js` when a `main` has no extension, so
 * graphql's `"main": "index"` became `index.mjs` for an import and `index.js`
 * for a require: two copies, and `Cannot use GraphQLSchema from another module
 * or realm` waiting for the first test that crossed between them. The order is
 * set in `vitest.config.mts`; this is what notices if it goes.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import * as graphql from 'graphql';
import * as nestGraphql from '@nestjs/graphql';
import * as nestApollo from '@nestjs/apollo';
import * as cacheManager from '@nestjs/cache-manager';
import * as platformExpress from '@nestjs/platform-express';
import * as platformFastify from '@nestjs/platform-fastify';

const requireFromSource = createRequire(__filename);

describe('one copy per package', () => {
  it.each([
    ['graphql', 'GraphQLSchema', graphql.GraphQLSchema],
    ['@nestjs/graphql', 'GraphQLSchemaHost', nestGraphql.GraphQLSchemaHost],
    ['@nestjs/apollo', 'ApolloDriver', nestApollo.ApolloDriver],
    ['@nestjs/cache-manager', 'CacheModule', cacheManager.CacheModule],
    ['@nestjs/platform-express', 'ExpressAdapter', platformExpress.ExpressAdapter],
    ['@nestjs/platform-fastify', 'FastifyAdapter', platformFastify.FastifyAdapter],
  ] as const)('%s', (name, exportName, imported) => {
    const required = (requireFromSource(name) as Record<string, unknown>)[exportName];

    expect(imported).toBeDefined();
    expect(required).toBe(imported);
  });
});
