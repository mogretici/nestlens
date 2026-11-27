import { describe, it, expect, beforeEach } from 'vitest';
import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { NestLensValidationPipe } from '../../api/pipes/nestlens-validation.pipe';
import { CheckNewQueryDto, CursorQueryDto } from '../../api/dto';

const queryMeta = (): ArgumentMetadata => ({
  type: 'query',
  metatype: CursorQueryDto,
  data: '',
});

describe('NestLensValidationPipe', () => {
  let pipe: NestLensValidationPipe;

  beforeEach(() => {
    pipe = new NestLensValidationPipe();
  });

  describe('transform (normalization)', () => {
    it('parses comma-separated strings into arrays', async () => {
      const result = (await pipe.transform(
        { levels: 'error,warn' },
        queryMeta(),
      )) as CursorQueryDto;
      expect(result.levels).toEqual(['error', 'warn']);
    });

    it('parses comma-separated statuses, keeping the ERR sentinel', async () => {
      const result = (await pipe.transform(
        { statuses: '200,404,ERR' },
        queryMeta(),
      )) as CursorQueryDto;
      expect(result.statuses).toEqual([200, 404, 'ERR']);
    });

    it('coerces the string "true" into a boolean', async () => {
      const result = (await pipe.transform({ slow: 'true' }, queryMeta())) as CursorQueryDto;
      expect(result.slow).toBe(true);
    });

    it('is idempotent when values are already transformed', async () => {
      const result = (await pipe.transform(
        { levels: ['error', 'warn'], slow: true, statuses: [200, 'ERR'] },
        queryMeta(),
      )) as CursorQueryDto;
      expect(result.levels).toEqual(['error', 'warn']);
      expect(result.slow).toBe(true);
      expect(result.statuses).toEqual([200, 'ERR']);
    });

    it('strips unknown (non-whitelisted) properties', async () => {
      const result = (await pipe.transform(
        { levels: 'error', notARealFilter: 'x' },
        queryMeta(),
      )) as Record<string, unknown>;
      expect(result).not.toHaveProperty('notARealFilter');
    });

    it('rejects a value outside the allowed set (still validates)', async () => {
      await expect(
        pipe.transform({ type: 'not-a-real-entry-type' }, queryMeta()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    const refusal = (value: Record<string, unknown>): Promise<string> =>
      pipe.transform(value, queryMeta()).then(
        () => '',
        (error: BadRequestException) => JSON.stringify(error.getResponse()),
      );

    it.each(['beforeSequence', 'afterSequence'])(
      'refuses a %s that is not a number, rather than paging to nothing',
      async (cursor) => {
        expect(await refusal({ [cursor]: 'abc' })).toContain(`${cursor} must be a whole number`);
      },
    );

    it('refuses both cursors at once, which each storage read differently', async () => {
      expect(await refusal({ beforeSequence: '300', afterSequence: '100' })).toContain(
        'Pass beforeSequence or afterSequence, not both',
      );
    });

    it('still takes either cursor alone', async () => {
      const result = (await pipe.transform(
        { afterSequence: '100' },
        queryMeta(),
      )) as CursorQueryDto;
      expect(result.afterSequence).toBe(100);
    });

    it('passes the value through untouched for primitive metatypes', async () => {
      const result = await pipe.transform('raw', { type: 'query', metatype: String, data: '' });
      expect(result).toBe('raw');
    });
  });

  /**
   * The core duplicate-class-transformer regression.
   *
   * When a host application resolves a DIFFERENT copy of class-transformer
   * than nestlens' DTO decorators registered with, the @Transform decorators
   * silently stop running and query params reach validation in their RAW
   * string form. The duplicate-safe validators must accept that raw form so
   * validation does not fail with 400 before NestLensValidationPipe can
   * normalize it. Here we simulate the un-transformed state by assigning raw
   * strings onto a DTO instance and validating directly.
   */
  describe('duplicate class-transformer safety (raw, un-transformed values)', () => {
    it('accepts raw comma-separated strings that @Transform never ran on', async () => {
      const dto = new CursorQueryDto();
      const raw = dto as unknown as Record<string, unknown>;
      raw.levels = 'error,warn';
      raw.statuses = '200,404';
      raw.slow = 'true';
      raw.tags = 'SUCCESS,USER:1';

      const errors = await validate(dto, { whitelist: true });

      expect(errors).toHaveLength(0);
    });

    it('accepts the raw sequence the live tail polls with', async () => {
      const dto = new CheckNewQueryDto();
      (dto as unknown as Record<string, unknown>).afterSequence = '100';

      const errors = await validate(dto, { whitelist: true });

      expect(errors).toHaveLength(0);
    });

    it('accepts a raw sequence that @Transform never ran on', async () => {
      const dto = new CursorQueryDto();
      (dto as unknown as Record<string, unknown>).beforeSequence = '300';

      const errors = await validate(dto, { whitelist: true });

      expect(errors).toHaveLength(0);
    });
  });
});
