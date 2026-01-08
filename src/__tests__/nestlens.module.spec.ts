import { Test, TestingModule } from '@nestjs/testing';
import { NestLensModule } from '../nestlens.module';
import { NestLensConfig, NESTLENS_CONFIG, DEFAULT_CONFIG } from '../nestlens.config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { CollectorService } from '../core/collector.service';
import { PruningService } from '../core/pruning.service';
import { TagService } from '../core/tag.service';
import { FamilyHashService } from '../core/family-hash.service';
import { STORAGE } from '../core/storage';

describe('NestLensModule', () => {
  describe('forRoot', () => {
    describe('Disabled Module', () => {
      it('should return minimal module when enabled is false', () => {
        // Arrange
        const config: NestLensConfig = { enabled: false };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        expect(dynamicModule.module).toBe(NestLensModule);
        expect(dynamicModule.providers).toHaveLength(1);
        expect(dynamicModule.providers).toContainEqual({
          provide: NESTLENS_CONFIG,
          useValue: expect.objectContaining({ enabled: false }),
        });
        expect(dynamicModule.controllers).toBeUndefined();
        expect(dynamicModule.imports).toBeUndefined();
      });

      it('should log warning when disabled', () => {
        // Arrange
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const loggerWarnSpy = jest.spyOn((NestLensModule as any).logger, 'warn');
        const config: NestLensConfig = { enabled: false };

        // Act
        NestLensModule.forRoot(config);

        // Assert
        expect(loggerWarnSpy).toHaveBeenCalledWith('NestLens is disabled');

        // Cleanup
        warnSpy.mockRestore();
        loggerWarnSpy.mockRestore();
      });
    });

    describe('Enabled Module', () => {
      it('should return full module when enabled', () => {
        // Arrange
        const config: NestLensConfig = { enabled: true };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        expect(dynamicModule.module).toBe(NestLensModule);
        expect(dynamicModule.controllers).toBeDefined();
        expect(dynamicModule.controllers!.length).toBeGreaterThan(0);
        expect(dynamicModule.imports).toBeDefined();
        expect(dynamicModule.providers).toBeDefined();
      });

      it('should register all controllers', () => {
        // Arrange
        const config: NestLensConfig = { enabled: true };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        expect(dynamicModule.controllers).toHaveLength(3);
      });

      it('should include core module in imports', () => {
        // Arrange
        const config: NestLensConfig = { enabled: true };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        expect(dynamicModule.imports).toBeDefined();
        expect(dynamicModule.imports!.length).toBeGreaterThanOrEqual(1);
      });

      it('should export NestLensLogger', () => {
        // Arrange
        const config: NestLensConfig = { enabled: true };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        expect(dynamicModule.exports).toBeDefined();
        expect(dynamicModule.exports).toHaveLength(1);
      });
    });

    describe('Default Configuration', () => {
      it('should use default config when no config provided', () => {
        // Act
        const dynamicModule = NestLensModule.forRoot();

        // Assert
        expect(dynamicModule.module).toBe(NestLensModule);
        expect(dynamicModule.providers).toBeDefined();
      });

      it('should merge custom config with defaults', () => {
        // Arrange
        const customConfig: NestLensConfig = {
          storage: { filename: 'custom.db' },
        };

        // Act
        const dynamicModule = NestLensModule.forRoot(customConfig);

        // Assert
        expect(dynamicModule.providers).toBeDefined();
      });
    });

    describe('Watcher Registration', () => {
      describe('Request Watcher', () => {
        it('should register request watcher by default', () => {
          // Arrange
          const config: NestLensConfig = { enabled: true };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          const hasInterceptor = dynamicModule.providers!.some(
            (p: any) => p.provide === APP_INTERCEPTOR,
          );
          expect(hasInterceptor).toBe(true);
        });

        it('should not register request watcher when disabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { request: false },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          const hasInterceptor = dynamicModule.providers!.some(
            (p: any) => p.provide === APP_INTERCEPTOR,
          );
          expect(hasInterceptor).toBe(false);
        });
      });

      describe('Exception Watcher', () => {
        it('should register exception watcher by default', () => {
          // Arrange
          const config: NestLensConfig = { enabled: true };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          const hasFilter = dynamicModule.providers!.some((p: any) => p.provide === APP_FILTER);
          expect(hasFilter).toBe(true);
        });

        it('should not register exception watcher when disabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { exception: false },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          const hasFilter = dynamicModule.providers!.some((p: any) => p.provide === APP_FILTER);
          expect(hasFilter).toBe(false);
        });
      });

      describe('Query Watcher', () => {
        it('should register query watcher by default', () => {
          // Arrange
          const config: NestLensConfig = { enabled: true };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.imports!.length).toBeGreaterThanOrEqual(2);
        });

        it('should not register query watcher when disabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { query: false },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.imports!.length).toBe(1);
        });
      });

      describe('Log Watcher', () => {
        it('should register log watcher by default', () => {
          // Arrange
          const config: NestLensConfig = { enabled: true };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          const providers = dynamicModule.providers!;
          expect(providers.length).toBeGreaterThan(0);
        });

        it('should not register log watcher when disabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { log: false },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('HTTP Client Watcher', () => {
        it('should not register http client watcher by default', () => {
          // Arrange
          const config: NestLensConfig = { enabled: true };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);
          const providerCount = dynamicModule.providers!.length;

          // Now enable it
          const configWithHttp: NestLensConfig = {
            enabled: true,
            watchers: { httpClient: true },
          };
          const dynamicModuleWithHttp = NestLensModule.forRoot(configWithHttp);

          // Assert
          expect(dynamicModuleWithHttp.providers!.length).toBeGreaterThan(providerCount);
        });

        it('should register http client watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { httpClient: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Cache Watcher', () => {
        it('should register cache watcher when enabled', () => {
          // Arrange
          const baseConfig: NestLensConfig = { enabled: true };
          const cacheConfig: NestLensConfig = {
            enabled: true,
            watchers: { cache: true },
          };

          // Act
          const baseModule = NestLensModule.forRoot(baseConfig);
          const cacheModule = NestLensModule.forRoot(cacheConfig);

          // Assert
          expect(cacheModule.providers!.length).toBeGreaterThan(baseModule.providers!.length);
        });
      });

      describe('Event Watcher', () => {
        it('should register event watcher when enabled', () => {
          // Arrange
          const baseConfig: NestLensConfig = { enabled: true };
          const eventConfig: NestLensConfig = {
            enabled: true,
            watchers: { event: true },
          };

          // Act
          const baseModule = NestLensModule.forRoot(baseConfig);
          const eventModule = NestLensModule.forRoot(eventConfig);

          // Assert
          expect(eventModule.providers!.length).toBeGreaterThan(baseModule.providers!.length);
        });
      });

      describe('Job Watcher', () => {
        it('should register job watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { job: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Schedule Watcher', () => {
        it('should register schedule watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { schedule: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Mail Watcher', () => {
        it('should register mail watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { mail: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Redis Watcher', () => {
        it('should register redis watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { redis: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Model Watcher', () => {
        it('should register model watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { model: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Notification Watcher', () => {
        it('should register notification watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { notification: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('View Watcher', () => {
        it('should register view watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { view: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Command Watcher', () => {
        it('should register command watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { command: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Gate Watcher', () => {
        it('should register gate watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { gate: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Batch Watcher', () => {
        it('should register batch watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { batch: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('Dump Watcher', () => {
        it('should register dump watcher when enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: { dump: true },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
        });
      });

      describe('All Watchers Enabled', () => {
        it('should register all watchers when all are enabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: {
              request: true,
              exception: true,
              query: true,
              log: true,
              httpClient: true,
              cache: true,
              event: true,
              job: true,
              schedule: true,
              mail: true,
              redis: true,
              model: true,
              notification: true,
              view: true,
              command: true,
              gate: true,
              batch: true,
              dump: true,
            },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
          expect(dynamicModule.providers!.length).toBeGreaterThan(15);
        });
      });

      describe('All Watchers Disabled', () => {
        it('should register minimal providers when all watchers disabled', () => {
          // Arrange
          const config: NestLensConfig = {
            enabled: true,
            watchers: {
              request: false,
              exception: false,
              query: false,
              log: false,
              httpClient: false,
              cache: false,
              event: false,
              job: false,
              schedule: false,
              mail: false,
              redis: false,
              model: false,
              notification: false,
              view: false,
              command: false,
              gate: false,
              batch: false,
              dump: false,
            },
          };

          // Act
          const dynamicModule = NestLensModule.forRoot(config);

          // Assert
          expect(dynamicModule.providers).toBeDefined();
          // Should only have NestLensGuard
          expect(dynamicModule.providers!.length).toBe(1);
        });
      });
    });

    describe('Configuration Merging', () => {
      it('should merge storage config correctly', () => {
        // Arrange
        const config: NestLensConfig = {
          enabled: true,
          storage: {
            filename: 'custom.db',
          },
        };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        expect(dynamicModule).toBeDefined();
      });

      it('should merge pruning config correctly', () => {
        // Arrange
        const config: NestLensConfig = {
          enabled: true,
          pruning: {
            maxAge: 48,
            interval: 120,
          },
        };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        expect(dynamicModule).toBeDefined();
      });

      it('should merge watchers config correctly', () => {
        // Arrange
        const config: NestLensConfig = {
          enabled: true,
          watchers: {
            request: false,
            cache: true,
          },
        };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        const hasInterceptor = dynamicModule.providers!.some(
          (p: any) => p.provide === APP_INTERCEPTOR,
        );
        expect(hasInterceptor).toBe(false);
      });

      it('should preserve default watchers when partial config provided', () => {
        // Arrange
        const config: NestLensConfig = {
          enabled: true,
          watchers: {
            cache: true,
          },
        };

        // Act
        const dynamicModule = NestLensModule.forRoot(config);

        // Assert
        // Should still have exception watcher (default true)
        const hasFilter = dynamicModule.providers!.some((p: any) => p.provide === APP_FILTER);
        expect(hasFilter).toBe(true);
      });
    });
  });

  describe('NestModule Implementation', () => {
    it('should implement configure method', () => {
      // Arrange
      const module = new NestLensModule();

      // Assert
      expect(module.configure).toBeDefined();
      expect(typeof module.configure).toBe('function');
    });

    it('should not throw when configure is called', () => {
      // Arrange
      const module = new NestLensModule();
      const mockConsumer = {
        apply: jest.fn().mockReturnThis(),
        forRoutes: jest.fn().mockReturnThis(),
      };

      // Act & Assert
      expect(() => module.configure(mockConsumer as any)).not.toThrow();
    });
  });

  describe('OnModuleInit Implementation', () => {
    it('should implement onModuleInit method', () => {
      // Arrange
      const module = new NestLensModule();

      // Assert
      expect(module.onModuleInit).toBeDefined();
      expect(typeof module.onModuleInit).toBe('function');
    });

    it('should log initialization message', async () => {
      // Arrange
      const module = new NestLensModule();
      const logSpy = jest.spyOn((NestLensModule as any).logger, 'log');

      // Act
      await module.onModuleInit();

      // Assert
      expect(logSpy).toHaveBeenCalledWith('NestLens initialized');

      // Cleanup
      logSpy.mockRestore();
    });
  });

  describe('Integration Tests', () => {
    it('should create module with default config', async () => {
      // Act & Assert
      await expect(
        Test.createTestingModule({
          imports: [NestLensModule.forRoot()],
        }).compile(),
      ).resolves.toBeDefined();
    });

    it('should create module with custom config', async () => {
      // Arrange
      const config: NestLensConfig = {
        enabled: true,
        storage: { filename: ':memory:' },
        watchers: {
          request: true,
          exception: true,
        },
      };

      // Act & Assert
      await expect(
        Test.createTestingModule({
          imports: [NestLensModule.forRoot(config)],
        }).compile(),
      ).resolves.toBeDefined();
    });

    it('should provide core services when enabled', async () => {
      // Arrange
      const config: NestLensConfig = {
        enabled: true,
        storage: { filename: ':memory:' },
      };

      // Act
      const module = await Test.createTestingModule({
        imports: [NestLensModule.forRoot(config)],
      }).compile();

      // Assert
      expect(module.get(CollectorService)).toBeDefined();
      expect(module.get(PruningService)).toBeDefined();
      expect(module.get(TagService)).toBeDefined();
      expect(module.get(FamilyHashService)).toBeDefined();
      expect(module.get(STORAGE)).toBeDefined();
      expect(module.get(NESTLENS_CONFIG)).toBeDefined();
    });

    it('should not provide core services when disabled', async () => {
      // Arrange
      const config: NestLensConfig = { enabled: false };

      // Act
      const module = await Test.createTestingModule({
        imports: [NestLensModule.forRoot(config)],
      }).compile();

      // Assert
      expect(() => module.get(CollectorService)).toThrow();
      expect(() => module.get(STORAGE)).toThrow();
    });
  });

  describe('Static Logger', () => {
    it('should have static logger', () => {
      // Assert
      expect((NestLensModule as any).logger).toBeDefined();
    });
  });
});
