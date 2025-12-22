import {
  isTypeORMDataSource,
  isPrismaClient,
  tryRequire,
  isModuleAvailable,
  TypeORMDataSource,
  PrismaClient,
} from '../../../watchers/query/types';

describe('Query Type Guards and Utilities', () => {
  describe('isTypeORMDataSource', () => {
    it('should return true for valid TypeORM DataSource', () => {
      // Arrange
      const validDataSource: TypeORMDataSource = {
        isInitialized: true,
        options: { type: 'postgres', name: 'default' },
        driver: { afterQuery: jest.fn() },
        initialize: jest.fn().mockResolvedValue({}),
      };

      // Act
      const result = isTypeORMDataSource(validDataSource);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for uninitialized DataSource', () => {
      // Arrange
      const uninitializedDataSource: TypeORMDataSource = {
        isInitialized: false,
        options: { type: 'mysql' },
        driver: {},
        initialize: jest.fn(),
      };

      // Act
      const result = isTypeORMDataSource(uninitializedDataSource);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for null', () => {
      // Act
      const result = isTypeORMDataSource(null);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for undefined', () => {
      // Act
      const result = isTypeORMDataSource(undefined);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for primitive values', () => {
      // Act & Assert
      expect(isTypeORMDataSource('string')).toBe(false);
      expect(isTypeORMDataSource(123)).toBe(false);
      expect(isTypeORMDataSource(true)).toBe(false);
    });

    it('should return false for empty object', () => {
      // Act
      const result = isTypeORMDataSource({});

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for object missing isInitialized', () => {
      // Arrange
      const invalidObj = {
        options: { type: 'postgres' },
        driver: {},
      };

      // Act
      const result = isTypeORMDataSource(invalidObj);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for object missing options', () => {
      // Arrange
      const invalidObj = {
        isInitialized: true,
        driver: {},
      };

      // Act
      const result = isTypeORMDataSource(invalidObj);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for object missing driver', () => {
      // Arrange
      const invalidObj = {
        isInitialized: true,
        options: { type: 'postgres' },
      };

      // Act
      const result = isTypeORMDataSource(invalidObj);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when isInitialized is not a boolean', () => {
      // Arrange
      const invalidObj = {
        isInitialized: 'true',
        options: { type: 'postgres' },
        driver: {},
      };

      // Act
      const result = isTypeORMDataSource(invalidObj);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for DataSource with minimal valid structure', () => {
      // Arrange
      const minimalDataSource = {
        isInitialized: false,
        options: {},
        driver: {},
      };

      // Act
      const result = isTypeORMDataSource(minimalDataSource);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('isPrismaClient', () => {
    it('should return true for valid PrismaClient with $on', () => {
      // Arrange
      const validClient: PrismaClient = {
        $on: jest.fn(),
      };

      // Act
      const result = isPrismaClient(validClient);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for valid PrismaClient with $use', () => {
      // Arrange
      const validClient: PrismaClient = {
        $use: jest.fn(),
      };

      // Act
      const result = isPrismaClient(validClient);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for valid PrismaClient with both $on and $use', () => {
      // Arrange
      const validClient: PrismaClient = {
        $on: jest.fn(),
        $use: jest.fn(),
      };

      // Act
      const result = isPrismaClient(validClient);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for null', () => {
      // Act
      const result = isPrismaClient(null);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for undefined', () => {
      // Act
      const result = isPrismaClient(undefined);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for primitive values', () => {
      // Act & Assert
      expect(isPrismaClient('string')).toBe(false);
      expect(isPrismaClient(123)).toBe(false);
      expect(isPrismaClient(true)).toBe(false);
    });

    it('should return false for empty object', () => {
      // Act
      const result = isPrismaClient({});

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when $on is not a function', () => {
      // Arrange
      const invalidClient = {
        $on: 'not a function',
      };

      // Act
      const result = isPrismaClient(invalidClient);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when $use is not a function', () => {
      // Arrange
      const invalidClient = {
        $use: 'not a function',
      };

      // Act
      const result = isPrismaClient(invalidClient);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for array', () => {
      // Act
      const result = isPrismaClient([]);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for object with additional properties and valid $on', () => {
      // Arrange
      const clientWithExtras = {
        $on: jest.fn(),
        user: {},
        post: {},
        $connect: jest.fn(),
      };

      // Act
      const result = isPrismaClient(clientWithExtras);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('tryRequire', () => {
    it('should return module when it exists', () => {
      // Act - require a module that definitely exists (Node.js built-in)
      const result = tryRequire<typeof import('path')>('path');

      // Assert
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('join');
      expect(result).toHaveProperty('resolve');
    });

    it('should return null when module does not exist', () => {
      // Act
      const result = tryRequire('non-existent-module-xyz-123');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for invalid module name', () => {
      // Act
      const result = tryRequire('@invalid/non-existent-package');

      // Assert
      expect(result).toBeNull();
    });

    it('should return fs module correctly', () => {
      // Act
      const result = tryRequire<typeof import('fs')>('fs');

      // Assert
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('readFileSync');
      expect(result).toHaveProperty('writeFileSync');
    });

    it('should return crypto module correctly', () => {
      // Act
      const result = tryRequire<typeof import('crypto')>('crypto');

      // Assert
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('createHash');
    });
  });

  describe('isModuleAvailable', () => {
    it('should return true for available Node.js core modules', () => {
      // Act & Assert
      expect(isModuleAvailable('path')).toBe(true);
      expect(isModuleAvailable('fs')).toBe(true);
      expect(isModuleAvailable('crypto')).toBe(true);
      expect(isModuleAvailable('http')).toBe(true);
    });

    it('should return true for installed npm packages', () => {
      // Act - Jest should be installed in the project
      const result = isModuleAvailable('jest');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existent modules', () => {
      // Act
      const result = isModuleAvailable('non-existent-module-xyz-456');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for invalid scoped packages', () => {
      // Act
      const result = isModuleAvailable('@non-existent-scope/non-existent-package');

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for installed scoped packages', () => {
      // Act - @nestjs/common should be installed
      const result = isModuleAvailable('@nestjs/common');

      // Assert
      expect(result).toBe(true);
    });

    it('should handle edge case module names', () => {
      // Act & Assert - empty string and '.' resolve to current directory
      expect(isModuleAvailable('')).toBe(true);
      expect(isModuleAvailable('.')).toBe(true);
    });

    it('should return true for typescript', () => {
      // Act
      const result = isModuleAvailable('typescript');

      // Assert
      expect(result).toBe(true);
    });
  });
});
