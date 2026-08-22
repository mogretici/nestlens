/**
 * How many tags one request may carry.
 *
 * `GET tags/entries` has been bounded at a hundred values since the filters
 * were given validators — the same hundred documented under
 * `security.validation.maxFilterArrayLength`. The body that writes tags was
 * not: `POST tags/entry/:id` with five thousand tags was accepted, and every
 * one of them became a row.
 */
import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { EntryTagsDto, MAX_FILTER_VALUES } from '../../api/dto';
import { NestLensValidationPipe } from '../../api/pipes/nestlens-validation.pipe';

const meta = (): ArgumentMetadata => ({ type: 'body', metatype: EntryTagsDto, data: '' });

const parse = (tags: unknown): Promise<unknown> =>
  new NestLensValidationPipe().transform({ tags }, meta());

const many = (count: number): string[] => Array.from({ length: count }, (_, i) => `t${i}`);

describe('the tags a request may write', () => {
  it('accepts an ordinary list', async () => {
    const result = (await parse(['checkout', 'slow'])) as EntryTagsDto;

    expect(result.tags).toEqual(['checkout', 'slow']);
  });

  it('accepts as many as the filters allow', async () => {
    const result = (await parse(many(MAX_FILTER_VALUES))) as EntryTagsDto;

    expect(result.tags).toHaveLength(MAX_FILTER_VALUES);
  });

  it('refuses one more', async () => {
    await expect(parse(many(MAX_FILTER_VALUES + 1))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses five thousand', async () => {
    await expect(parse(many(5_000))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still refuses an empty list', async () => {
    await expect(parse([])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still refuses a tag longer than a tag', async () => {
    await expect(parse(['x'.repeat(101)])).rejects.toBeInstanceOf(BadRequestException);
  });
});
