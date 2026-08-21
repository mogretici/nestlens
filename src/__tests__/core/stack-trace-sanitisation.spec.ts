/**
 * What a production stack trace is allowed to say about the machine.
 *
 * `partial` is documented as dropping absolute paths, and it dropped exactly
 * one of the two shapes V8 writes:
 *
 *     at Object.handler (/srv/app/dist/orders.js:42:11)   -> removed
 *     at /srv/app/dist/main.js:10:5                       -> left as it was
 *
 * The second is what anonymous functions and top-level code produce, so a
 * production trace still published the deployment directory and the account it
 * runs under — `/home/deploy/secret-project/...` — which is the thing `partial`
 * exists to remove.
 */
import { DataMaskerService } from '../../core/data-masker.service';

const STACK = [
  'Error: boom',
  '    at Object.handler (/srv/app/dist/orders.js:42:11)',
  '    at /srv/app/dist/main.js:10:5',
  '    at async /home/deploy/secret-project/lib/run.js:3:1',
  '    at C:\\Users\\deploy\\app\\main.js:5:1',
  '    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)',
  '    at Module._load (node_modules/express/index.js:1:1)',
].join('\n');

/** `partial` only applies in production; the paths are the useful part locally. */
const inProduction = <T>(work: () => T): T => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return work();
  } finally {
    process.env.NODE_ENV = before;
  }
};

const sanitiseInProduction = (
  stack: string,
  mode: 'none' | 'partial' | 'full' = 'partial',
): string | undefined =>
  inProduction(() =>
    new DataMaskerService({ stackTraceSanitization: mode }).sanitizeStackTrace(stack),
  );

describe('stack trace sanitisation', () => {
  describe('partial, in production', () => {
    const sanitised = () => sanitiseInProduction(STACK) ?? '';

    it.each([
      ['the deployment directory', '/srv/app'],
      ['the home directory', '/home/deploy'],
      ['the project name', 'secret-project'],
      ['a Windows path', 'C:\\Users'],
    ])('removes %s', (_name, secret) => {
      expect(sanitised()).not.toContain(secret);
    });

    it('keeps the error and the frame names', () => {
      const output = sanitised();

      expect(output).toContain('Error: boom');
      expect(output).toContain('Object.handler');
      expect(output).toContain('processTicksAndRejections');
    });

    it('keeps node internals, which name no host', () => {
      expect(sanitised()).toContain('node:internal/process/task_queues');
    });

    it('keeps node_modules paths, which are the same everywhere', () => {
      expect(sanitised()).toContain('node_modules/express/index.js');
    });

    it('keeps the trace readable rather than blanking it', () => {
      expect(sanitised().split('\n').length).toBeGreaterThan(3);
    });

    it('keeps at most the first ten frames', () => {
      const long = [
        'Error: x',
        ...Array.from({ length: 40 }, (_, i) => `    at fn${i} (/a/b.js:${i}:1)`),
      ].join('\n');

      expect((sanitiseInProduction(long) ?? '').split('\n')).toHaveLength(10);
    });

    it('leaves a trace with no paths alone', () => {
      const clean = 'Error: x\n    at fn (node:internal/x:1:1)';

      expect(sanitiseInProduction(clean)).toBe(clean);
    });
  });

  describe('the other modes', () => {
    it('removes the trace entirely on full', () => {
      expect(sanitiseInProduction(STACK, 'full')).toBeUndefined();
    });

    it('keeps the trace untouched on none', () => {
      expect(sanitiseInProduction(STACK, 'none')).toBe(STACK);
    });

    it('keeps the trace untouched outside production', () => {
      // Locally the paths are the useful part.
      const masker = new DataMaskerService({ stackTraceSanitization: 'partial' });

      expect(masker.sanitizeStackTrace(STACK)).toBe(STACK);
    });

    it('returns undefined when there is no trace', () => {
      expect(new DataMaskerService().sanitizeStackTrace(undefined)).toBeUndefined();
    });
  });

  it('is not slowed down by a hostile trace', () => {
    // Scanned rather than matched with a pattern, because this arrives inside
    // exceptions NestLens did not throw.
    const hostile = `Error: x\n    at ${'/a'.repeat(40_000)}`;

    const started = process.hrtime.bigint();
    sanitiseInProduction(hostile);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

    expect(elapsed).toBeLessThan(150);
  });
});
