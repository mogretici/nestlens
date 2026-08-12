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
  it('loads without throwing, but its routes are never registered', async () => {
    // Arrange
    const app = await NestFactory.create(HostModule, { logger: false });
    await app.init();

    // Act
    const loader = app.get(LazyModuleLoader);
    const lazyRef = await loader.load(() => NestLensModule.forRoot({ watchers: {} }));

    // Assert — the module instantiates, so its services are reachable through
    // the returned reference…
    expect(lazyRef).toBeDefined();

    // …but nothing was routed: Nest does not register controllers of a lazily
    // loaded module, so the dashboard is not there.
    const response = await request(app.getHttpServer()).get('/nestlens');
    expect(response.status).toBe(404);

    await app.close();
  });
});
