import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Nest's injector reads decorator metadata. SWC is the compiler NestJS
  // documents for Vitest; unplugin-swc takes experimentalDecorators,
  // emitDecoratorMetadata, target and useDefineForClassFields from
  // tsconfig.json, so the suite compiles the way `tsc` builds the package.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    // `.js` before `.mjs`, as Node resolves an extensionless `main`. Vite's
    // default order turned graphql's `"main": "index"` into `index.mjs` for an
    // import, while NestLens' `require('graphql')` got `index.js`: two copies
    // of graphql in one process. See one-copy-per-package.spec.ts.
    extensions: ['.js', '.mjs', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }],
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.{spec,test}.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    // Child processes rather than worker threads: suites mutate process.env,
    // load better-sqlite3's native addon and patch net.Server.prototype.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/__tests__/**', 'src/index.ts'],
      reportsDirectory: 'coverage',
    },
  },
});
