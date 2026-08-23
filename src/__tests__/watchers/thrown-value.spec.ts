/**
 * Anything can be thrown, and NestLens must survive all of it.
 *
 * JavaScript does not require a thrown value to be an `Error`, and applications
 * take that literally: a string from a validation helper, a bare object from a
 * third-party client, `null` from a promise rejected with no reason. NestJS
 * hands every one of them to an interceptor's error handler and an exception
 * filter exactly as thrown.
 *
 * Reading `.status` off `null` inside an RxJS error handler throws a
 * `TypeError` where nothing is left to catch it, and the process goes down.
 * That is the worst outcome available to a monitoring tool: the application was
 * handling its own failure correctly, and NestLens turned it into a crash.
 *
 * Measured before this existed — `throw null` from a controller killed the
 * process, and the request never got a response.
 */
import { HttpException, HttpStatus } from '@nestjs/common';
import { describeThrown } from '../../watchers/thrown-value';

describe('describing a thrown value', () => {
  describe('a real error', () => {
    it('keeps its name and message', () => {
      const described = describeThrown(new TypeError('bad input'));

      expect(described.name).toBe('TypeError');
      expect(described.message).toBe('bad input');
    });

    it('keeps its stack', () => {
      expect(describeThrown(new Error('x')).stack).toContain('Error');
    });

    it('reads the status off an HttpException', () => {
      const described = describeThrown(new HttpException('nope', HttpStatus.FORBIDDEN));

      expect(described.status).toBe(403);
    });

    it('survives an error with no message', () => {
      expect(describeThrown(new Error()).message).toBe('');
    });
  });

  describe('a value that is not an error', () => {
    it.each([
      [null, 'NonErrorThrow', 'null'],
      [undefined, 'NonErrorThrow', 'undefined'],
      ['not found', 'NonErrorThrow:string', 'not found'],
      [42, 'NonErrorThrow:number', '42'],
      [true, 'NonErrorThrow:boolean', 'true'],
    ])('describes %p without throwing', (value, name, message) => {
      const described = describeThrown(value);

      expect(described.name).toBe(name);
      expect(described.message).toBe(message);
    });

    it('describes a symbol', () => {
      expect(describeThrown(Symbol('oops')).message).toContain('oops');
    });

    it('carries no status', () => {
      expect(describeThrown(null).status).toBeUndefined();
    });
  });

  describe('a bare object', () => {
    it('shows what it contained rather than [object Object]', () => {
      const described = describeThrown({ code: 'E_LIMIT', detail: 'too many' });

      expect(described.message).toContain('E_LIMIT');
      expect(described.message).not.toBe('[object Object]');
    });

    it('prefers a message field when there is one', () => {
      expect(describeThrown({ message: 'from a field' }).message).toBe('from a field');
    });

    it('takes a name field when there is one', () => {
      expect(describeThrown({ name: 'AxiosError', message: 'timeout' }).name).toBe('AxiosError');
    });

    it('falls back to a name that says what happened', () => {
      expect(describeThrown({ detail: 'x' }).name).toBe('UnknownError');
    });

    it('reads a plausible status', () => {
      expect(describeThrown({ status: 404, message: 'gone' }).status).toBe(404);
    });

    it('ignores a status that is not an HTTP one', () => {
      // A `status: 'pending'` field on a domain object is not a response code.
      expect(describeThrown({ status: 'pending' }).status).toBeUndefined();
      expect(describeThrown({ status: 7 }).status).toBeUndefined();
    });

    it('reads getStatus() from an HttpException-shaped object', () => {
      // An `HttpException` from a second copy of `@nestjs/common` fails
      // `instanceof` and is otherwise identical.
      expect(describeThrown({ getStatus: () => 429, message: 'slow down' }).status).toBe(429);
    });

    it('survives a getStatus() that throws', () => {
      const value = {
        message: 'x',
        getStatus: () => {
          throw new Error('nope');
        },
      };

      expect(() => describeThrown(value)).not.toThrow();
      expect(describeThrown(value).status).toBeUndefined();
    });

    it('survives a cyclic object', () => {
      const cyclic: Record<string, unknown> = { code: 'E' };
      cyclic.self = cyclic;

      expect(() => describeThrown(cyclic)).not.toThrow();
      expect(describeThrown(cyclic).name).toBe('UnknownError');
    });

    it('survives a toString that throws', () => {
      const hostile = {
        toString() {
          throw new Error('no');
        },
      };

      expect(() => describeThrown(hostile)).not.toThrow();
    });

    it('truncates a very large object', () => {
      const big = { data: 'x'.repeat(5_000) };

      expect(describeThrown(big).message.length).toBeLessThan(600);
    });

    it('keeps a stack when the object carries one', () => {
      expect(describeThrown({ message: 'x', stack: 'at somewhere' }).stack).toBe('at somewhere');
    });

    it('ignores a stack that is not a string', () => {
      expect(describeThrown({ message: 'x', stack: 42 }).stack).toBeUndefined();
    });
  });
});
