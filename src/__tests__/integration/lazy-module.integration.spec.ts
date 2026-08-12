/**
 * What happens when NestLens is loaded lazily.
 *
 * The one installation scenario never tried. NestLens contributes controllers
 * (the dashboard and its API) and global enhancers (the request interceptor and
 * the exception filter), and Nest's `LazyModuleLoader` documents that it
 * registers neither: a lazily loaded module's controllers are never routed and
 * its `APP_*` providers never join the pipeline.
 *
 * So the question is not whether it works — it is whether the failure is
 * visible. A dashboard that silently 404s and watchers that silently record
 * nothing is the worst outcome, and the answer belongs in the documentation
 * either way.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { Module } from '@nestjs/common';
import { LazyModuleLoader, NestFactory } from '@nestjs/core';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';

@Module({})
class HostModule {}

describe('NestLens loaded through LazyModuleLoader', () => {
  /**
   * How it fails depends on the NestJS version — 9 refuses the load outright
   * with a dependency-resolution error, 11 loads the module happily — but the
   * end state is the same on all of them, and it is the end state that matters
   * to somebody trying this. Asserting on the exception would pin one version's
   * behaviour and call the others a regression.
   */
  it('never ends up serving the dashboard', async () => {
    // Arrange
    const app = await NestFactory.create(HostModule, { logger: false });
    await app.init();
    const loader = app.get(LazyModuleLoader);

    // Act — the rejection on NestJS 9 is swallowed on purpose: both outcomes
    // are "not supported", and the assertion below is what distinguishes a
    // working installation from this one.
    await loader.load(() => NestLensModule.forRoot({ watchers: {} })).catch(() => undefined);

    // Assert
    const response = await request(app.getHttpServer()).get('/nestlens');
    expect({ dashboard: response.status, everRouted: response.status !== 404 }).toEqual({
      dashboard: 404,
      everRouted: false,
    });

    await app.close();
  });
});
