/**
 * A log call must not fail because NestLens is watching it.
 *
 * `NestLensLogger` replaces the application's logger, and it recorded a
 * non-string message by running `JSON.stringify` on it — inside the
 * application's own logging call, where the exception went straight back out:
 *
 * ```text
 * logger.log(order)          TypeError: Converting circular structure to JSON
 * logger.log({ total: 9n })  TypeError: Do not know how to serialize a BigInt
 * ```
 *
 * An entity with a relation pointing back at its parent, and a bigint column.
 * The logger NestLens replaces prints both without complaint, so installing
 * NestLens turned working code into a crash at the log statement.
 */
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { NestLensLogger } from '../../watchers/log.watcher';

const build = (): { logger: NestLensLogger; recorded: { message: string }[] } => {
  const recorded: { message: string }[] = [];
  const collector = {
    collect: async (_type: string, payload: { message: string }) => void recorded.push(payload),
  } as unknown as CollectorService;

  const logger = new NestLensLogger(collector, {
    watchers: { log: { enabled: true, minLevel: 'verbose' } },
  } as NestLensConfig);

  // Nothing under test needs the message on the terminal.
  (logger as unknown as { printMessages: () => void }).printMessages = () => undefined;

  return { logger, recorded };
};

describe('logging a value that cannot be serialised', () => {
  it('does not throw on an entity that points back at itself', () => {
    const { logger } = build();
    const order: Record<string, unknown> = { id: 1 };
    order.self = order;

    expect(() => logger.log(order as never)).not.toThrow();
  });

  it('records it as the printed form rather than losing it', () => {
    const { logger, recorded } = build();
    const order: Record<string, unknown> = { id: 1 };
    order.self = order;

    logger.log(order as never);

    expect(recorded[0].message).toContain('[Circular');
    expect(recorded[0].message).toContain('id: 1');
  });

  it('does not throw on a bigint', () => {
    const { logger, recorded } = build();

    expect(() => logger.log({ total: 9n } as never)).not.toThrow();
    expect(recorded[0].message).toContain('9n');
  });

  it('records something for undefined', () => {
    const { logger, recorded } = build();

    logger.log(undefined as never);

    expect(recorded[0].message).toBe('undefined');
  });

  it('survives a value whose custom inspector throws', () => {
    const { logger, recorded } = build();
    const hostile = {
      [Symbol.for('nodejs.util.inspect.custom')]: () => {
        throw new Error('no');
      },
    };

    expect(() => logger.log(hostile as never)).not.toThrow();
    expect(recorded[0].message).toBe('[unrecordable]');
  });

  it.each([
    ['a string', 'plain message', 'plain message'],
    ['an object', { a: 1 }, '{ a: 1 }'],
  ])('still records %s as it always did', (_name, message, expected) => {
    const { logger, recorded } = build();

    logger.log(message as never);

    expect(recorded[0].message).toBe(expected);
  });

  it('bounds a long string inside the value', () => {
    const { logger, recorded } = build();

    logger.log({ blob: 'x'.repeat(100_000) } as never);

    expect(recorded[0].message.length).toBeLessThan(2_000);
  });

  it('bounds a deep value', () => {
    const { logger, recorded } = build();
    const deep: Record<string, unknown> = {};
    let node = deep;
    for (let i = 0; i < 1_000; i += 1) {
      const next: Record<string, unknown> = {};
      node.next = next;
      node = next;
    }

    logger.log(deep as never);

    expect(recorded[0].message).toContain('[Object]');
  });
});
