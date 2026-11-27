/**
 * Switched off, NestLens says it is off and nothing else.
 *
 * forRoot warned "NestLens is disabled" and the module then printed its
 * startup summary anyway — "recording everything · in-memory storage · …
 * dashboard mounted at /nestlens" — describing a recorder and a dashboard that
 * did not exist. Measured on the published 0.16.0 and 0.17.0.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestLensModule } from '../../nestlens.module';

const logged = async (enabled: boolean): Promise<string[]> => {
  const lines: string[] = [];
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
    lines.push(String(message));
  });
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    lines.push(String(message));
  });

  @Module({ imports: [NestLensModule.forRoot({ enabled })] })
  class AppModule {}

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  await app.close();

  log.mockRestore();
  warn.mockRestore();
  return lines;
};

describe('NestLens switched off', () => {
  it('says it is disabled', async () => {
    expect(await logged(false)).toContain('NestLens is disabled');
  });

  it('prints no summary of a recorder that is not there', async () => {
    const lines = await logged(false);

    expect(
      lines.filter((line) => line.includes('recording') || line.includes('mounted at')),
    ).toEqual([]);
  });

  it('still prints the summary when it is on', async () => {
    expect((await logged(true)).some((line) => line.includes('recording everything'))).toBe(true);
  });
});
