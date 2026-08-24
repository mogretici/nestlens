/**
 * The application keeps its logger after the dashboard has started.
 *
 * `NestFactory.create` applies its `logger` option through
 * `Logger.overrideLogger`, which is static. The dashboard's own listener is a
 * second Nest application, and creating it with `logger: false` — to keep its
 * route mappings from reading as a second application starting up — silenced
 * the host as well, permanently.
 *
 * Measured on a deployment: the API logged normally through startup, reached
 * this hook inside `app.listen()`, and never logged again. Every refusal from
 * its attestation guard, every handler error, and the dashboard's own "could
 * not bind" message went nowhere for days, and nothing about an application
 * that has stopped logging says why. A debugging tool must not be able to
 * blind the application it reports on.
 *
 * So this asserts the thing the deployment actually needed: a logger the host
 * installed before `listen()` is still the one in use afterwards.
 */
import { Controller, Get, INestApplication, Logger, LoggerService, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { NestLensModule } from '../../nestlens.module';

@Controller('demo')
class DemoController {
  @Get()
  ok(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [NestLensModule.forRoot({ server: { host: '127.0.0.1', port: 0 } })],
  controllers: [DemoController],
})
class AppModule {}

interface Recorder extends LoggerService {
  lines: string[];
}

const recorder = (): Recorder => {
  const lines: string[] = [];
  const write = (message: unknown): void => {
    lines.push(String(message));
  };

  return {
    lines,
    log: write,
    error: write,
    warn: write,
    debug: write,
    verbose: write,
  };
};

/** Nest keeps the process's logger in a static; this reads it. */
class LoggerInUse extends Logger {
  static current(): LoggerService | undefined {
    return LoggerInUse.staticInstanceRef;
  }
}

describe('the host keeps its logger once the dashboard is up', () => {
  let app: INestApplication | undefined;
  let before: LoggerService | undefined;

  beforeEach(() => {
    before = LoggerInUse.current();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    // Put back whatever the run had, rather than leaving the process silent
    // for whichever suite this worker picks up next.
    Logger.overrideLogger(before ?? false);
  });

  it('still logs through the host logger after listen()', async () => {
    // Created silent, exactly as the deployment's test harness does, so the
    // host's own bootstrap is not what this measures.
    app = await NestFactory.create(AppModule, new ExpressAdapter(), {
      logger: false,
      abortOnError: false,
    });

    // What the application asks for, at the point `main.ts` asks for it:
    // after the container is built and before the server is listening.
    const host = recorder();
    Logger.overrideLogger(host);

    // The dashboard binds inside this call — `onApplicationBootstrap`.
    await app.listen(0, '127.0.0.1');

    Logger.log('after the dashboard has started', 'Probe');
    Logger.warn('a guard refusing a request', 'Probe');

    expect(host.lines).toContain('after the dashboard has started');
    expect(host.lines).toContain('a guard refusing a request');
  });
});
