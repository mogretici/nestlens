import {
  isLikelyTypeORMDataSource,
  isPrismaClient,
  tryRequire,
  isModuleAvailable,
  PrismaClient,
} from '../../../watchers/query/types';

describe('Query type guards and module helpers', () => {
  describe('isLikelyTypeORMDataSource', () => {
    const makeFakeDs = (overrides: Record<string, unknown> = {}): unknown => ({
      constructor: { name: 'DataSource' },
      options: { type: 'better-sqlite3' },
      subscribers: [],
      ...overrides,
    });

    it('accepts an object that looks like a TypeORM DataSource', () => {
      expect(isLikelyTypeORMDataSource(makeFakeDs())).toBe(true);
    });

    it('accepts an object whose constructor is named Connection (legacy alias)', () => {
      expect(isLikelyTypeORMDataSource(makeFakeDs({ constructor: { name: 'Connection' } }))).toBe(
        true,
      );
    });

    it('rejects an object with the wrong constructor name', () => {
      expect(
        isLikelyTypeORMDataSource(makeFakeDs({ constructor: { name: 'SomethingElse' } })),
      ).toBe(false);
    });

    it('rejects an object missing subscribers array', () => {
      expect(isLikelyTypeORMDataSource(makeFakeDs({ subscribers: undefined }))).toBe(false);
    });

    it('rejects an object missing options', () => {
      expect(isLikelyTypeORMDataSource(makeFakeDs({ options: undefined }))).toBe(false);
    });

    it('rejects null, undefined and primitives', () => {
      expect(isLikelyTypeORMDataSource(null)).toBe(false);
      expect(isLikelyTypeORMDataSource(undefined)).toBe(false);
      expect(isLikelyTypeORMDataSource('ds')).toBe(false);
      expect(isLikelyTypeORMDataSource(42)).toBe(false);
      expect(isLikelyTypeORMDataSource(true)).toBe(false);
    });
  });

  describe('isPrismaClient', () => {
    it('returns true when $on is a function', () => {
      const client: PrismaClient = { $on: jest.fn() };
      expect(isPrismaClient(client)).toBe(true);
    });

    it('returns true when $use is a function', () => {
      const client: PrismaClient = { $use: jest.fn() };
      expect(isPrismaClient(client)).toBe(true);
    });

    it('returns false when neither hook is present', () => {
      expect(isPrismaClient({})).toBe(false);
      expect(isPrismaClient({ $on: 'no' as unknown as never })).toBe(false);
    });

    it('returns false for null, undefined and arrays', () => {
      expect(isPrismaClient(null)).toBe(false);
      expect(isPrismaClient(undefined)).toBe(false);
      expect(isPrismaClient([])).toBe(false);
    });
  });

  describe('tryRequire', () => {
    it('returns the resolved module when present', () => {
      const path = tryRequire<typeof import('path')>('path');
      expect(path).not.toBeNull();
      expect(typeof path?.join).toBe('function');
    });

    it('returns null when the module cannot be resolved', () => {
      expect(tryRequire('definitely-not-a-real-module-xyz')).toBeNull();
    });
  });

  describe('isModuleAvailable', () => {
    it('returns true for built-in Node modules', () => {
      expect(isModuleAvailable('fs')).toBe(true);
      expect(isModuleAvailable('path')).toBe(true);
    });

    it('returns true for installed packages', () => {
      expect(isModuleAvailable('@nestjs/common')).toBe(true);
    });

    it('returns false for unknown modules', () => {
      expect(isModuleAvailable('definitely-not-a-real-module-xyz')).toBe(false);
    });
  });
});
