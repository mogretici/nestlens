/**
 * Every query parameter validates in the form it arrives in.
 *
 * class-validator keeps its metadata on `globalThis`, class-transformer keeps
 * its own per copy. A host application with a second copy of class-transformer
 * and a global `ValidationPipe` therefore runs NestLens' validators without
 * NestLens' `@Transform`s, against the strings of the query itself. A validator
 * that only accepts the transformed value — `@IsInt` on `minDuration`, `@IsDate`
 * on `from` — answers every such request with a 400, and the dashboard's
 * duration filter stops working in that application and nowhere else.
 *
 * So each declared property is given a valid value as a string and validated
 * without any transform. The property list comes from class-validator's own
 * metadata, which means a property added later without a row in the table
 * below fails here by name instead of passing unexamined.
 *
 * The second half holds the other side: through `NestLensValidationPipe`,
 * where the transforms do run, what was refused before is still refused, with
 * the message the caller reads today.
 */
import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException, Type } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { getMetadataStorage, validate, ValidationTypes } from 'class-validator';
import * as dtos from '../../api/dto';
import { MAX_OFFSET } from '../../api/dto';
import { NestLensApiController } from '../../api/api.controller';
import { DashboardController } from '../../api/dashboard.controller';
import { NestLensStreamController } from '../../api/stream.controller';
import { TagController } from '../../api/tag.controller';
import { NestLensValidationPipe } from '../../api/pipes/nestlens-validation.pipe';

const LIST = 'a,b';
const INSTANT = '2026-08-22T14:03:00Z';

/** A valid value for every query property, exactly as it sits in a URL. */
const RAW: Record<string, string> = {
  type: 'request',
  limit: '50',
  offset: '100',
  beforeSequence: '300',
  afterSequence: '100',
  from: INSTANT,
  to: INSTANT,
  minDuration: '500',
  maxDuration: '2000',
  requestId: 'req-1',
  level: 'error',
  logic: 'AND',
  search: 'checkout',
  tags: 'SUCCESS,USER:1',
  statuses: '200,404,ERR',
  slow: 'true',
  resolved: 'false',
  hasErrors: 'true',
  hasN1: 'false',
  levels: LIST,
  contexts: LIST,
  queryTypes: LIST,
  sources: LIST,
  methods: 'GET,POST',
  paths: '/a,/b',
  controllers: LIST,
  hostnames: LIST,
  ips: '127.0.0.1,::1',
  names: LIST,
  eventNames: LIST,
  scheduleStatuses: LIST,
  scheduleNames: LIST,
  jobStatuses: LIST,
  jobNames: LIST,
  queues: LIST,
  cacheOperations: LIST,
  mailStatuses: LIST,
  redisStatuses: LIST,
  redisCommands: LIST,
  modelActions: LIST,
  entities: LIST,
  modelSources: LIST,
  notificationTypes: LIST,
  notificationStatuses: LIST,
  viewFormats: LIST,
  viewStatuses: LIST,
  commandStatuses: LIST,
  commandNames: LIST,
  gateNames: LIST,
  gateResults: LIST,
  batchStatuses: LIST,
  batchOperations: LIST,
  dumpStatuses: LIST,
  dumpOperations: LIST,
  dumpFormats: LIST,
  operationTypes: LIST,
  operationNames: LIST,
};

/** The largest raw value each bounded property allows, which must pass too. */
const RAW_AT_THE_BOUND: [string, string][] = [
  ['offset', String(MAX_OFFSET)],
  ['minDuration', '0'],
  ['from', '2026-08-22'],
  ['tags', 'x'.repeat(100)],
  // Each tag is short; the string carrying them is not.
  ['tags', Array.from({ length: 30 }, (_, i) => `tag-${i}`).join(',')],
];

type Dto = Type<object>;

const isClass = (value: unknown): value is Dto =>
  typeof value === 'function' && /^class\s/.test(Function.prototype.toString.call(value));

const metadataOf = (dto: Dto) =>
  getMetadataStorage().getTargetValidationMetadatas(dto, '', true, false);

const propertiesOf = (dto: Dto): string[] => [
  ...new Set(metadataOf(dto).map((metadata) => metadata.propertyName)),
];

const requiredOf = (dto: Dto): string[] => {
  const optional = new Set(
    metadataOf(dto)
      .filter((metadata) => metadata.type === ValidationTypes.CONDITIONAL_VALIDATION)
      .map((metadata) => metadata.propertyName),
  );

  return propertiesOf(dto).filter((property) => !optional.has(property));
};

/** What the controllers bind with `@Query()` — the DTOs a URL is parsed into. */
const boundToQuery = (): Set<Dto> => {
  const bound = new Set<Dto>();
  const controllers = [
    NestLensApiController,
    TagController,
    NestLensStreamController,
    DashboardController,
  ];

  for (const controller of controllers) {
    for (const method of Object.getOwnPropertyNames(controller.prototype)) {
      const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {}) as Record<
        string,
        { index: number }
      >;
      const types = (Reflect.getMetadata('design:paramtypes', controller.prototype, method) ??
        []) as Dto[];

      for (const [key, arg] of Object.entries(args)) {
        if (key.split(':')[0] === String(RouteParamtypes.QUERY)) {
          bound.add(types[arg.index]);
        }
      }
    }
  }

  return bound;
};

const QUERY_DTOS = Object.values(dtos)
  .filter(isClass)
  .filter((dto) => dto.name.endsWith('QueryDto'));

/** The raw object a URL carrying only `properties` turns into. */
const rawInstance = (dto: Dto, properties: string[]): object => {
  const instance = new dto() as Record<string, unknown>;
  for (const property of properties) {
    instance[property] = RAW[property];
  }
  return instance;
};

const errorsFor = async (instance: object): Promise<string[]> =>
  (await validate(instance, { whitelist: true })).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );

describe('query DTOs, given the raw strings of a URL', () => {
  it('finds every DTO a controller parses a query into, and only those', () => {
    const bound = boundToQuery();

    expect(QUERY_DTOS.length).toBeGreaterThanOrEqual(7);
    expect([...bound].map((dto) => dto.name).sort()).toEqual(
      QUERY_DTOS.map((dto) => dto.name).sort(),
    );
  });

  it('has a raw value for every property a query DTO declares', () => {
    const missing = QUERY_DTOS.flatMap((dto) =>
      propertiesOf(dto)
        .filter((property) => !(property in RAW))
        .map((property) => `${dto.name}.${property}`),
    );

    expect(missing).toEqual([]);
  });

  it('has no raw value no DTO declares, so the table cannot go stale', () => {
    const declared = new Set(QUERY_DTOS.flatMap(propertiesOf));

    expect(Object.keys(RAW).filter((property) => !declared.has(property))).toEqual([]);
  });

  /**
   * Implicit conversion — a host's, and the one NestLens' own pipe asks for —
   * converts by `design:type` before any `@Transform` runs, so a `Boolean` or
   * `Number` there reads `'false'` as `true` and `''` as `0` whatever the
   * transform beside it says. `Date` is left: `new Date(value)` is the parse
   * `TransformDate` makes.
   */
  it('declares no property with a type implicit conversion would misread', () => {
    const misread = QUERY_DTOS.flatMap((dto) =>
      propertiesOf(dto)
        .map((property) => ({
          property,
          type: Reflect.getMetadata('design:type', dto.prototype, property) as unknown,
        }))
        .filter(({ type }) => type === Boolean || type === Number)
        .map(({ property, type }) => `${dto.name}.${property}: ${(type as Dto).name}`),
    );

    expect(misread).toEqual([]);
  });

  it('accepts each property as a string, without any transform', async () => {
    const refused: string[] = [];

    for (const dto of QUERY_DTOS) {
      const required = requiredOf(dto);

      for (const property of propertiesOf(dto)) {
        const errors = await errorsFor(rawInstance(dto, [...new Set([...required, property])]));
        if (errors.length > 0) {
          refused.push(`${dto.name}.${property}=${RAW[property]}: ${errors.join('; ')}`);
        }
      }
    }

    expect(refused).toEqual([]);
  });

  it('accepts the bound values as strings too', async () => {
    const refused: string[] = [];

    for (const dto of QUERY_DTOS) {
      for (const [property, value] of RAW_AT_THE_BOUND) {
        if (!propertiesOf(dto).includes(property)) continue;

        const instance = rawInstance(dto, requiredOf(dto)) as Record<string, unknown>;
        instance[property] = value;
        const errors = await errorsFor(instance);
        if (errors.length > 0) {
          refused.push(`${dto.name}.${property}=${value}: ${errors.join('; ')}`);
        }
      }
    }

    expect(refused).toEqual([]);
  });

  it('answers the same raw query through the pipe as well', async () => {
    const refused: string[] = [];

    for (const dto of QUERY_DTOS) {
      const required = requiredOf(dto);

      for (const property of propertiesOf(dto)) {
        const query: Record<string, string> = {};
        for (const name of [...new Set([...required, property])]) query[name] = RAW[name];

        await new NestLensValidationPipe()
          .transform(query, { type: 'query', metatype: dto, data: '' })
          .catch((error: BadRequestException) =>
            refused.push(`${dto.name}.${property}: ${JSON.stringify(error.getResponse())}`),
          );
      }
    }

    expect(refused).toEqual([]);
  });
});

describe('query DTOs, through NestLensValidationPipe', () => {
  const refusal = async (dto: Dto, query: Record<string, unknown>): Promise<string[]> => {
    const meta: ArgumentMetadata = { type: 'query', metatype: dto, data: '' };

    try {
      await new NestLensValidationPipe().transform(query, meta);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      return [...((error as BadRequestException).getResponse() as { message: string[] }).message];
    }

    return [];
  };

  const DURATION = (name: string): string => `${name} must be a whole number of milliseconds`;
  const DATE = (name: string): string =>
    `${name} must be a date the runtime can read, such as an ISO 8601 string`;
  const OFFSET = `offset must be at most ${MAX_OFFSET}; use entries/cursor to page further`;
  const TAG_LENGTH = 'each value in tags must be shorter than or equal to 100 characters';
  const TAG_REQUIRED = 'tags is required and must name at least one tag';
  const TAG_LIST =
    'tags must be a comma-separated string or an array of strings, with at most 100 values';

  /**
   * The messages a caller read before, less one: an unreadable duration also
   * said `must not be less than 0`, which `@Min(0)` reported for anything that
   * was not a number at all.
   */
  const cases: [string, Dto, Record<string, unknown>, string[]][] = [
    [
      'an unreadable minDuration',
      dtos.EntriesQueryDto,
      { minDuration: 'abc' },
      [DURATION('minDuration')],
    ],
    [
      'an unreadable maxDuration',
      dtos.EntriesQueryDto,
      { maxDuration: 'abc' },
      [DURATION('maxDuration')],
    ],
    [
      'an unreadable cursor minDuration',
      dtos.CursorQueryDto,
      { minDuration: 'abc' },
      [DURATION('minDuration')],
    ],
    [
      'an unreadable cursor maxDuration',
      dtos.CursorQueryDto,
      { maxDuration: 'slow' },
      [DURATION('maxDuration')],
    ],
    [
      'an offset past the bound',
      dtos.EntriesQueryDto,
      { offset: String(MAX_OFFSET + 1) },
      [OFFSET],
    ],
    ['a million offset on logs', dtos.LogsQueryDto, { offset: '1000000' }, [OFFSET]],
    ['an unreadable from', dtos.EntriesQueryDto, { from: 'yesterday' }, [DATE('from')]],
    ['an unreadable to', dtos.QueriesQueryDto, { to: 'yesterday' }, [DATE('to')]],
    ['a from that reads as NaN', dtos.LogsQueryDto, { from: 'NaN' }, [DATE('from')]],
    ['no tags', dtos.TagEntriesQueryDto, {}, [TAG_LENGTH, TAG_REQUIRED, TAG_LIST]],
    ['tags that name nothing', dtos.TagEntriesQueryDto, { tags: ',,' }, [TAG_REQUIRED]],
    [
      'a tag longer than a tag',
      dtos.TagEntriesQueryDto,
      { tags: `a,${'x'.repeat(101)}` },
      [TAG_LENGTH],
    ],
    [
      'a tag that is not a string',
      dtos.TagEntriesQueryDto,
      { tags: ['a', 5] },
      [TAG_LENGTH, TAG_LIST],
    ],
    [
      'a live tail without a sequence',
      dtos.CheckNewQueryDto,
      {},
      ['afterSequence must be a whole number'],
    ],
  ];

  it.each(cases)('refuses %s, saying why', async (_name, dto, query, messages) => {
    expect(await refusal(dto, query)).toEqual(messages);
  });

  /**
   * How a number has been read until now. Implicit conversion applied
   * `Number()` before `TransformToInt` saw the value, so `12abc` was refused
   * and `1e3` was a thousand; taking implicit conversion out of the path must
   * not change that.
   */
  it.each([
    ['1e3', 1000],
    ['1.5', 1],
    [' 12 ', 12],
    ['-5', 0],
  ])('reads minDuration=%p as %p, as it always has', async (raw, expected) => {
    const result = (await new NestLensValidationPipe().transform(
      { minDuration: raw },
      { type: 'query', metatype: dtos.CursorQueryDto, data: '' },
    )) as dtos.CursorQueryDto;

    expect(result.minDuration).toBe(expected);
  });

  it.each(['12abc', 'Infinity', '0x'])('refuses minDuration=%p, as it always has', async (raw) => {
    expect(await refusal(dtos.CursorQueryDto, { minDuration: raw })).toEqual([
      DURATION('minDuration'),
    ]);
  });

  it.each([
    ['1e3', 1000],
    ['abc', 50],
    ['0', 1],
  ])('reads limit=%p as %p, as it always has', async (raw, expected) => {
    const result = (await new NestLensValidationPipe().transform(
      { limit: raw },
      { type: 'query', metatype: dtos.CursorQueryDto, data: '' },
    )) as dtos.CursorQueryDto;

    expect(result.limit).toBe(expected);
  });

  /**
   * `Boolean()` read anything but a blank as `true`, so `?slow=yes` narrowed
   * to the slow queries and `?resolved=false` to the resolved exceptions. A
   * value that is neither word is now the validator's to refuse, as an
   * unreadable number already was.
   */
  it.each(['yes', '1', 'FALSE'])('refuses slow=%p rather than reading it as true', async (raw) => {
    expect(await refusal(dtos.CursorQueryDto, { slow: raw })).toEqual([
      "slow must be a boolean or 'true'/'false'",
    ]);
  });

  it('still reads what it accepts into numbers and dates', async () => {
    const result = (await new NestLensValidationPipe().transform(
      { offset: String(MAX_OFFSET), minDuration: '500', from: INSTANT },
      { type: 'query', metatype: dtos.EntriesQueryDto, data: '' },
    )) as dtos.EntriesQueryDto;

    expect(result.offset).toBe(MAX_OFFSET);
    expect(result.minDuration).toBe(500);
    expect(result.from).toEqual(new Date(INSTANT));
  });
});

describe('query DTOs, given a value a host pipe already converted', () => {
  it('refuses a Date that is not one', async () => {
    const instance = new dtos.EntriesQueryDto() as Record<string, unknown>;
    instance.from = new Date('yesterday');

    expect(await errorsFor(instance)).toEqual([
      'from must be a date the runtime can read, such as an ISO 8601 string',
    ]);
  });

  it('refuses a number past the offset bound', async () => {
    const instance = new dtos.EntriesQueryDto() as Record<string, unknown>;
    instance.offset = MAX_OFFSET + 1;

    expect(await errorsFor(instance)).toEqual([
      `offset must be at most ${MAX_OFFSET}; use entries/cursor to page further`,
    ]);
  });

  it('refuses a raw offset past the bound', async () => {
    const instance = new dtos.EntriesQueryDto() as Record<string, unknown>;
    instance.offset = String(MAX_OFFSET + 1);

    expect(await errorsFor(instance)).toEqual([
      `offset must be at most ${MAX_OFFSET}; use entries/cursor to page further`,
    ]);
  });
});
