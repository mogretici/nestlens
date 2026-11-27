import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Nest's injector reads decorator metadata. SWC is the compiler NestJS
  // documents for Vitest and the one the library's suite uses; unplugin-swc
  // takes the decorator options, target and class-field semantics from
  // tsconfig.json, so the specs compile the way `nest build` compiles the
  // application.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    // `.js` before `.mjs`, as Node resolves an extensionless `main`. Vite's
    // default order turns graphql's `"main": "index"` into `index.mjs` for an
    // import while @nestjs/graphql's `require('graphql')` gets `index.js`: two
    // copies of graphql, and a schema built by one that the other rejects.
    // src/one-graphql.spec.ts fails if this order is lost.
    extensions: ['.js', '.mjs', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  test: {
    environment: 'node',
    // Two projects rather than two config files: the unit specs sit next to
    // the code they test and the e2e specs boot AppModule from test/, the split
    // the Nest starter makes, and `--project` picks one without a second
    // config that has to be kept in step with this one. Both inherit
    // everything above, the SWC plugin and `resolve.extensions` included.
    projects: [
      { test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      { test: { name: 'e2e', include: ['test/**/*.e2e-spec.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      reportsDirectory: 'coverage',
    },
  },
});
