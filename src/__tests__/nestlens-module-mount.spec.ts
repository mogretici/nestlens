/**
 * Calling `forRoot` twice with different paths moves the dashboard silently.
 *
 * The mount point is metadata on the controller classes, so the last call
 * wins. Where two modules each called `forRoot` — which is what happens when a
 * feature module imports NestLens instead of the root module doing it once —
 * the dashboard answered at one path and 404'd at the other, with nothing said
 * about why:
 *
 * ```text
 * forRoot({ path: '/first' })   in one module
 * forRoot({ path: '/second' })  in another   ->  only /second exists
 * ```
 */
import { Logger } from '@nestjs/common';
import { NestLensModule } from '../nestlens.module';

const warningsFrom = (work: () => void): string[] => {
  const warnings: string[] = [];
  const spy = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation((message: unknown) => void warnings.push(String(message)));

  try {
    work();
  } finally {
    spy.mockRestore();
  }

  return warnings;
};

/** The static that remembers where the last call put it. */
const forget = (): void => {
  (NestLensModule as unknown as { mountedAt?: string }).mountedAt = undefined;
};

describe('mounting the dashboard', () => {
  beforeEach(forget);

  it('says nothing for a single call', () => {
    const warnings = warningsFrom(() => {
      NestLensModule.forRoot({ path: '/admin/monitoring' });
    });

    expect(warnings.filter((line) => line.includes('forRoot'))).toEqual([]);
  });

  it('says nothing when the same path is given twice', () => {
    const warnings = warningsFrom(() => {
      NestLensModule.forRoot({ path: '/admin' });
      NestLensModule.forRoot({ path: '/admin' });
    });

    expect(warnings.filter((line) => line.includes('forRoot'))).toEqual([]);
  });

  it('says so when a second call moves it', () => {
    const warnings = warningsFrom(() => {
      NestLensModule.forRoot({ path: '/first' });
      NestLensModule.forRoot({ path: '/second' });
    });

    expect(warnings.some((line) => line.includes('/first') && line.includes('/second'))).toBe(true);
  });

  it('says where to call it instead', () => {
    const warnings = warningsFrom(() => {
      NestLensModule.forRoot({ path: '/first' });
      NestLensModule.forRoot({ path: '/second' });
    });

    expect(warnings.join('\n')).toContain('root module');
  });

  it('still mounts at the last path given', () => {
    NestLensModule.forRoot({ path: '/first' });
    NestLensModule.forRoot({ path: '/second' });

    expect((NestLensModule as unknown as { mountedAt?: string }).mountedAt).toBe('second');
  });
});
