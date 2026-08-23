/**
 * A body has to be an object before a DTO can say anything about it.
 *
 * `plainToInstance` maps an array into an array of instances, which carries
 * none of the DTO's properties and therefore breaks none of its rules. So a
 * JSON array posted to a tagging endpoint passed validation and arrived at the
 * storage as `undefined`:
 *
 * ```text
 * POST tags/entry/1  []   ->  500  TypeError: tags is not iterable
 * ```
 *
 * — a caller's mistake reported as a server fault, with a stack trace in the
 * response. Found by firing malformed bodies at every endpoint; it was the one
 * 5xx among them.
 */
import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { EntryTagsDto, PauseRecordingDto } from '../../api/dto';
import { NestLensValidationPipe } from '../../api/pipes/nestlens-validation.pipe';

const asBody = (metatype: unknown): ArgumentMetadata =>
  ({ type: 'body', metatype, data: '' }) as ArgumentMetadata;

const parse = (value: unknown, metatype: unknown = EntryTagsDto): Promise<unknown> =>
  new NestLensValidationPipe().transform(value, asBody(metatype));

describe('a body that is not an object', () => {
  it.each([
    ['an array', []],
    ['an array with content', [{ tags: ['x'] }]],
    ['a string', 'x'],
    ['a number', 123],
    ['a boolean', true],
  ])('refuses %s', async (_name, value) => {
    await expect(parse(value)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('says what was wrong with it', async () => {
    const reported = await parse([]).then(
      () => '',
      (error: BadRequestException) => JSON.stringify(error.getResponse()),
    );

    expect(reported).toContain('must be an object');
  });

  it('still refuses an object that breaks the rules', async () => {
    await expect(parse({ tags: 'not-an-array' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still accepts a valid body', async () => {
    const result = (await parse({ tags: ['checkout'] })) as EntryTagsDto;

    expect(result.tags).toEqual(['checkout']);
  });

  it('still accepts a missing body where every field is optional', async () => {
    const result = (await parse(undefined, PauseRecordingDto)) as PauseRecordingDto;

    expect(result).toBeInstanceOf(PauseRecordingDto);
  });

  it('leaves query parameters alone, which arrive as strings', async () => {
    // The query pipe path: values are strings by definition and the DTO's
    // transformers turn them into what the filters expect.
    const { EntriesQueryDto } = await import('../../api/dto');
    const result = (await new NestLensValidationPipe().transform({ limit: '10' }, {
      type: 'query',
      metatype: EntriesQueryDto,
      data: '',
    } as ArgumentMetadata)) as { limit?: number };

    expect(result.limit).toBe(10);
  });
});
