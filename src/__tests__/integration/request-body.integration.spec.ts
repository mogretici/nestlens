/**
 * What the API does with a POST that carries no body.
 *
 * Four handlers read `@Body()` and reached straight into it. A client that sent
 * no body — curl without a content type, a script, anything that does not set
 * `application/json` — got `500 Cannot read properties of undefined (reading
 * 'tags')`: a caller's mistake reported as a server fault, naming an
 * implementation detail instead of the missing field. `recording/pause` was
 * worse: `reason` is optional, so a bodyless POST is exactly the normal case,
 * and it answered 500.
 *
 * These go over real HTTP because the validation pipe is what does the work,
 * and calling the handler directly walks past it.
 */
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';

@Module({ imports: [NestLensModule.forRoot({ enabled: true })] })
class AppModule {}

const API = '/nestlens/__nestlens__/api';

describe('endpoints that take a request body', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('when every field is optional', () => {
    it('pauses without a body', async () => {
      // Act
      const response = await request(app.getHttpServer()).post(`${API}/recording/pause`);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ success: true, data: { isPaused: true } });

      await request(app.getHttpServer()).post(`${API}/recording/resume`);
    });

    it('still takes a reason when one is given', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post(`${API}/recording/pause`)
        .send({ reason: 'load test' });

      // Assert
      expect(response.body).toMatchObject({
        success: true,
        data: { isPaused: true, pauseReason: 'load test' },
      });

      await request(app.getHttpServer()).post(`${API}/recording/resume`);
    });
  });

  describe('when a field is required', () => {
    it.each([
      [`${API}/tags/entry/1`, 'tags'],
      [`${API}/tags/monitored`, 'tag'],
    ])('answers %s with a 400 naming the missing field', async (path, field) => {
      // Act
      const response = await request(app.getHttpServer()).post(path);

      // Assert - a client error, and the field rather than a TypeError
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(JSON.stringify(response.body.error)).toContain(field);
      expect(JSON.stringify(response.body.error)).not.toContain('Cannot read properties');
    });

    it('accepts a valid body', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post(`${API}/tags/monitored`)
        .send({ tag: 'BILLING' });

      // Assert
      expect(response.body.success).toBe(true);
    });
  });
});
