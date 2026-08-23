/**
 * `__proto__` is a key a client can send, and an entry has to show it.
 *
 * Masking, sanitising and header capture all rebuild a payload key by key. That
 * one is not a key like the others: `target[key] = value` reaches the accessor
 * every object inherits from `Object.prototype` and replaces the prototype
 * instead of adding a member. Measured on `maskBody` before this was fixed,
 * with a body any client is free to send:
 *
 *     {"__proto__": {"isAdmin": true}, "safe": 1}
 *
 *     keys           [ 'safe' ]        the interesting half, gone
 *     prototype      replaced
 *     out.isAdmin    true              answered from the client's object
 *
 * `Object.prototype` is never touched, so this is not global pollution. What it
 * is, is a debugging tool omitting the part of a request somebody would most
 * want to read, and a payload object that answers questions with what the
 * client put in it.
 */
import { DataMaskerService } from '../../core/data-masker.service';
import { assignKey } from '../../core/safe-assign';
import { sanitizeVariables } from '../../watchers/graphql/utils/variable-sanitizer';

/** Built the way a request body arrives: parsed from text. */
const hostile = (json: string): Record<string, unknown> =>
  JSON.parse(json) as Record<string, unknown>;

describe('a payload carrying __proto__', () => {
  describe('the masker', () => {
    const masker = new DataMaskerService({});

    it('keeps the key in the entry', () => {
      const masked = masker.maskBody(hostile('{"__proto__": {"isAdmin": true}, "safe": 1}'));

      expect(Object.keys(masked as object)).toEqual(['__proto__', 'safe']);
      expect(JSON.stringify(masked)).toContain('isAdmin');
    });

    it('leaves the prototype where it was', () => {
      const masked = masker.maskBody(hostile('{"__proto__": {"isAdmin": true}}'));

      expect(Object.getPrototypeOf(masked)).toBe(Object.prototype);
      expect((masked as { isAdmin?: unknown }).isAdmin).toBeUndefined();
    });

    it('does not touch Object.prototype', () => {
      masker.maskBody(hostile('{"__proto__": {"nestlensPolluted": true}}'));

      expect(({} as Record<string, unknown>).nestlensPolluted).toBeUndefined();
    });

    it('still masks what is sensitive alongside it', () => {
      const masked = masker.maskBody(
        hostile('{"__proto__": {"x": 1}, "password": "hunter2"}'),
      ) as Record<string, unknown>;

      expect(masked.password).not.toBe('hunter2');
    });

    it('keeps it nested as well', () => {
      const masked = masker.maskBody(hostile('{"order": {"__proto__": {"x": 1}, "id": 7}}'));

      expect(JSON.stringify(masked)).toContain('"__proto__"');
    });

    it('survives the round trip through storage', () => {
      // SQLite and Redis hold the payload as text; `JSON.parse` makes
      // `__proto__` an own property again rather than a prototype.
      const masked = masker.maskBody(hostile('{"__proto__": {"isAdmin": true}, "safe": 1}'));
      const restored = JSON.parse(JSON.stringify(masked)) as Record<string, unknown>;

      expect(Object.keys(restored)).toEqual(['__proto__', 'safe']);
      expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
    });
  });

  describe('the GraphQL variable sanitizer', () => {
    it('keeps the key', () => {
      const sanitized = sanitizeVariables(hostile('{"__proto__": {"x": 1}, "a": 2}'), [
        'password',
      ]) as Record<string, unknown>;

      expect(Object.keys(sanitized)).toEqual(['__proto__', 'a']);
      expect(Object.getPrototypeOf(sanitized)).toBe(Object.prototype);
    });

    it('masks it when it is named sensitive', () => {
      const sanitized = sanitizeVariables(hostile('{"__proto__": {"x": 1}}'), [
        '__proto__',
      ]) as Record<string, unknown>;

      expect(JSON.stringify(sanitized)).toContain('***');
    });
  });

  describe('the helper itself', () => {
    it('writes an ordinary key by assignment', () => {
      const target: Record<string, unknown> = {};

      assignKey(target, 'a', 1);

      expect(target).toEqual({ a: 1 });
    });

    it('writes __proto__ as an own, enumerable, writable property', () => {
      const target: Record<string, unknown> = {};

      assignKey(target, '__proto__', { x: 1 });

      const descriptor = Object.getOwnPropertyDescriptor(target, '__proto__');
      expect(descriptor).toMatchObject({ enumerable: true, writable: true, configurable: true });
      expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    });

    it('can be called twice for the same key', () => {
      const target: Record<string, unknown> = {};

      assignKey(target, '__proto__', { x: 1 });
      assignKey(target, '__proto__', { x: 2 });

      expect((target as { __proto__?: { x: number } }).__proto__?.x).toBe(2);
    });
  });
});
