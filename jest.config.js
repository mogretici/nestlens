/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // NestJS 12 ships every `@nestjs/*` package as ESM only, and an application
  // on NestJS 11 already installs a few ESM-only packages too — path-to-regexp
  // 9 under `@fastify/middie`, cookie under `light-my-request`. Node loads them
  // from CommonJS with require(esm); Jest's module runtime does not. So every
  // file in node_modules goes through `jest/esm-to-commonjs.js`, which compiles
  // the ESM ones and hands every other file back untouched — on NestJS 9 to 11
  // that includes all of the `@nestjs/*` packages but `@nestjs/cache-manager`
  // 12. Hence `transformIgnorePatterns` is empty: the default would skip
  // node_modules before the transform could decide.
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '/node_modules/.+\\.m?js$': '<rootDir>/jest/esm-to-commonjs.js',
  },
  transformIgnorePatterns: [],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
