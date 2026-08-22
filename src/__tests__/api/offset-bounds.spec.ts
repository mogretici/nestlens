/**
 * How far an offset may reach into the list.
 *
 * Offset paging asks the storage for `offset + limit` entries and drops the
 * ones already shown — the work is set by the offset, not by the page — and
 * nothing bounded the offset. Against a store told to keep everything
 * (`maxEntries: 0`), which is a supported setting, `?offset=1000000` reads a
 * million rows with their payloads into memory to answer with fifty.
 *
 * Measured against a store holding the default ten thousand, where the ceiling
 * caps the damage: 2ms for a page, 27ms for a large offset, all of it blocking
 * the application's event loop.
 *
 * Refused rather than clamped: a clamped offset answers a different question
 * than the one asked and looks like an answer. `entries/cursor` pages to any
 * depth at constant cost, and the message says so.
 */
import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { EntriesQueryDto, MAX_OFFSET } from '../../api/dto';
import { NestLensValidationPipe } from '../../api/pipes/nestlens-validation.pipe';

const meta = (): ArgumentMetadata => ({ type: 'query', metatype: EntriesQueryDto, data: '' });

const parse = (query: Record<string, string>): Promise<unknown> =>
  new NestLensValidationPipe().transform(query, meta());

describe('the offset bound', () => {
  it('accepts an ordinary offset', async () => {
    const result = (await parse({ offset: '100' })) as EntriesQueryDto;

    expect(result.offset).toBe(100);
  });

  it('accepts the largest offset it allows', async () => {
    const result = (await parse({ offset: String(MAX_OFFSET) })) as EntriesQueryDto;

    expect(result.offset).toBe(MAX_OFFSET);
  });

  it('refuses one past it', async () => {
    await expect(parse({ offset: String(MAX_OFFSET + 1) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a million', async () => {
    await expect(parse({ offset: '1000000' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('says where to page instead', async () => {
    // What the caller reads in the response body.
    const reported = await parse({ offset: '1000000' }).then(
      () => '',
      (error: BadRequestException) => JSON.stringify(error.getResponse()),
    );

    expect(reported).toContain('entries/cursor');
  });

  it('still refuses a negative offset by treating it as none', async () => {
    const result = (await parse({ offset: '-5' })) as EntriesQueryDto;

    expect(result.offset).toBe(0);
  });
});
