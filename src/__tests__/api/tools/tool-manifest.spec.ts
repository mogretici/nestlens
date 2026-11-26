/**
 * The tool manifest: what `GET __nestlens__/api/tools` says the API offers.
 *
 * It is read from the controllers' own metadata, so these tests are less about
 * a list than about the property the MCP server depends on: describe a handler
 * once, where it is written, and it is a tool.
 */
import { Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Body } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { NestLensApiController } from '../../../api/api.controller';
import { TagController } from '../../../api/tag.controller';
import { NestLensTool, buildToolManifest } from '../../../api/tools';
import {
  METHOD_KEY,
  PARAMTYPE_BODY,
  PARAMTYPE_PARAM,
  PARAMTYPE_QUERY,
  PATH_KEY,
  ROUTE_ARGS_KEY,
  toSnakeCase,
} from '../../../api/tools/tool-manifest';
import { ENTRY_TYPES } from '../../../types';
import { MAX_FILTER_VALUES } from '../../../api/dto/transformers';

const manifest = buildToolManifest([NestLensApiController, TagController]);
const tool = (name: string) => {
  const found = manifest.tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};
const parameter = (toolName: string, name: string) => {
  const found = tool(toolName).parameters.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`${toolName} has no parameter ${name}`);
  return found;
};

describe('the keys read from Nest', () => {
  // These are inlined because `@nestjs/common/constants` is not public API. If
  // the framework renames one, this fails here instead of emptying every tool.
  it('match the framework', () => {
    expect(PATH_KEY).toBe(PATH_METADATA);
    expect(METHOD_KEY).toBe(METHOD_METADATA);
    expect(ROUTE_ARGS_KEY).toBe(ROUTE_ARGS_METADATA);
    expect(PARAMTYPE_BODY).toBe(RouteParamtypes.BODY);
    expect(PARAMTYPE_QUERY).toBe(RouteParamtypes.QUERY);
    expect(PARAMTYPE_PARAM).toBe(RouteParamtypes.PARAM);
  });
});

describe('toSnakeCase', () => {
  it.each([
    ['getEntries', 'get_entries'],
    ['getEntriesWithCursor', 'get_entries_with_cursor'],
    ['checkNewEntries', 'check_new_entries'],
  ])('turns %s into %s', (input, expected) => {
    expect(toSnakeCase(input)).toBe(expected);
  });
});

describe('the manifest of the real controllers', () => {
  it('has a unique, snake_case name for every tool', () => {
    const names = manifest.tools.map((candidate) => candidate.name);

    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('describes every tool', () => {
    for (const candidate of manifest.tools) {
      expect(candidate.description.length).toBeGreaterThan(20);
    }
  });

  it('does not offer itself', () => {
    expect(manifest.tools.map((candidate) => candidate.name)).not.toContain('get_tools');
  });

  it('gives each route relative to the API root', () => {
    expect(tool('get_entries').path).toBe('/entries');
    expect(tool('get_entry').path).toBe('/entries/:id');
    expect(tool('get_all_tags').path).toBe('/tags');
    expect(tool('add_tags_to_entry').path).toBe('/tags/entry/:id');
  });

  it('is the same wherever NestLens is mounted', () => {
    const before = Reflect.getMetadata(PATH_METADATA, NestLensApiController);
    Reflect.defineMetadata(
      PATH_METADATA,
      'dev/tools/nestlens/__nestlens__/api',
      NestLensApiController,
    );

    try {
      const moved = buildToolManifest([NestLensApiController, TagController]);
      expect(moved).toEqual(manifest);
    } finally {
      Reflect.defineMetadata(PATH_METADATA, before, NestLensApiController);
    }
  });

  it('finds the API root from its end, so a mount that contains one does not confuse it', () => {
    const api = Reflect.getMetadata(PATH_METADATA, NestLensApiController);
    const tags = Reflect.getMetadata(PATH_METADATA, TagController);
    Reflect.defineMetadata(
      PATH_METADATA,
      'dev/__nestlens__/api/__nestlens__/api',
      NestLensApiController,
    );
    Reflect.defineMetadata(
      PATH_METADATA,
      'dev/__nestlens__/api/__nestlens__/api/tags',
      TagController,
    );

    try {
      expect(buildToolManifest([NestLensApiController, TagController])).toEqual(manifest);
    } finally {
      Reflect.defineMetadata(PATH_METADATA, api, NestLensApiController);
      Reflect.defineMetadata(PATH_METADATA, tags, TagController);
    }
  });

  describe('what changes data', () => {
    it('is exactly what is not a GET', () => {
      for (const candidate of manifest.tools) {
        expect(candidate.mutates).toBe(candidate.method !== 'GET');
      }
    });

    it('marks what cannot be undone', () => {
      expect(tool('clear_entries')).toMatchObject({ mutates: true, destructive: true });
      expect(tool('run_pruning')).toMatchObject({ mutates: true, destructive: true });
      expect(tool('resolve_entry')).toMatchObject({ mutates: true, destructive: false });
      expect(tool('get_stats')).toMatchObject({ mutates: false, destructive: false });
    });
  });

  describe('parameters', () => {
    it('reads a path parameter, typed by the handler', () => {
      expect(parameter('get_entry', 'id')).toEqual({
        name: 'id',
        in: 'path',
        required: true,
        type: 'integer',
      });
      expect(parameter('get_entries_by_family_hash', 'hash')).toMatchObject({
        in: 'path',
        type: 'string',
      });
    });

    it('reads the query a handler validates with, down to its enum', () => {
      expect(parameter('get_entries_with_cursor', 'type').enum).toEqual([...ENTRY_TYPES]);
      expect(parameter('get_entries_with_cursor', 'type')).toMatchObject({
        in: 'query',
        required: false,
      });
    });

    it('knows an integer, a boolean, a list and a time', () => {
      expect(parameter('get_entries_with_cursor', 'minDuration')).toMatchObject({
        type: 'integer',
        minimum: 0,
      });
      expect(parameter('get_entries_with_cursor', 'slow').type).toBe('boolean');
      expect(parameter('get_entries_with_cursor', 'levels')).toMatchObject({
        type: 'array',
        items: 'string',
      });
      expect(parameter('get_entries_with_cursor', 'from')).toMatchObject({
        type: 'string',
        format: 'date-time',
      });
    });

    it('takes a type from the compiler where no validator says one', () => {
      class Weighed {
        @IsOptional()
        weight?: number;
      }
      @Controller('__nestlens__/api')
      class Scale {
        @NestLensTool({ description: 'Weigh something, for the compiler-type test.' })
        @Get('weigh')
        weigh(@Query() _query: Weighed): void {}
      }

      expect(buildToolManifest([Scale]).tools[0]?.parameters[0]?.type).toBe('number');
    });

    it('presents a page size as the integer range the API applies', () => {
      for (const toolName of ['get_entries', 'get_entries_with_cursor', 'get_entries_by_tags']) {
        expect(parameter(toolName, 'limit')).toMatchObject({
          type: 'integer',
          minimum: 1,
          maximum: 1000,
        });
      }
      expect(parameter('get_entries_with_cursor', 'beforeSequence')).toMatchObject({
        type: 'integer',
        minimum: 0,
      });
      expect(parameter('get_entries', 'offset')).toMatchObject({
        type: 'integer',
        minimum: 0,
        maximum: 10_000,
      });
    });

    it('puts a per-item length on the items, not on the list', () => {
      for (const toolName of ['add_tags_to_entry', 'get_entries_by_tags']) {
        const tags = parameter(toolName, 'tags');
        expect(tags.maxLength).toBeUndefined();
        expect(tags.itemMaxLength).toBeGreaterThan(0);
      }
    });

    it('carries a bound a validator declares', () => {
      expect(parameter('get_entries', 'offset').maximum).toBe(10_000);
      expect(parameter('add_monitored_tag', 'tag').maxLength).toBeGreaterThan(0);
    });

    it('marks what must be given', () => {
      expect(parameter('get_entries_by_tags', 'tags').required).toBe(true);
      expect(parameter('get_entries_by_tags', 'logic').required).toBe(false);
    });

    it('reads a body as well as a query', () => {
      expect(parameter('add_tags_to_entry', 'tags')).toMatchObject({
        in: 'body',
        type: 'array',
        required: true,
      });
      expect(parameter('pause_recording', 'reason')).toMatchObject({ in: 'body', required: false });
    });

    describe('advertises only what the handler reads', () => {
      const names = (toolName: string): string[] =>
        tool(toolName).parameters.map((candidate) => candidate.name);

      it.each([
        ['get_grouped_entries', ['limit', 'type']],
        ['get_entries_by_family_hash', ['hash', 'limit']],
      ])('%s takes %j and nothing else', (toolName, expected) => {
        expect(names(toolName).sort()).toEqual(expected);
      });

      it.each(['get_requests', 'get_queries', 'get_exceptions', 'get_logs'])(
        '%s does not offer a type it would override',
        (toolName) => {
          expect(names(toolName)).not.toContain('type');
          expect(names(toolName)).toEqual(expect.arrayContaining(['limit', 'offset', 'from']));
        },
      );

      it('keeps what narrows the logs and the queries', () => {
        expect(names('get_logs')).toContain('level');
        expect(names('get_queries')).toContain('slow');
        expect(names('get_entries')).toContain('type');
      });
    });

    describe('under the query validators, which say what each parameter is', () => {
      // The transformed query properties record `design:type` String, so none
      // of this can come from the compiler: it is read off the validators.
      const shape = (toolName: string, name: string): Record<string, unknown> => {
        const { name: _n, in: _i, description: _d, ...rest } = parameter(toolName, name);
        return rest;
      };

      it.each([
        ['get_entries_with_cursor', 'resolved', { type: 'boolean', required: false }],
        ['get_entries_with_cursor', 'slow', { type: 'boolean', required: false }],
        ['get_queries', 'slow', { type: 'boolean', required: false }],
        ['get_entries', 'minDuration', { type: 'integer', required: false, minimum: 0 }],
        [
          'get_entries',
          'offset',
          { type: 'integer', required: false, minimum: 0, maximum: 10_000 },
        ],
        ['get_entries', 'from', { type: 'string', required: false, format: 'date-time' }],
        ['get_entries_with_cursor', 'to', { type: 'string', required: false, format: 'date-time' }],
        [
          'get_entries_by_tags',
          'tags',
          {
            type: 'array',
            items: 'string',
            required: true,
            minItems: 1,
            maxItems: 100,
            itemMaxLength: 100,
          },
        ],
        [
          'add_tags_to_entry',
          'tags',
          {
            type: 'array',
            items: 'string',
            required: true,
            minItems: 1,
            maxItems: 100,
            itemMaxLength: 100,
          },
        ],
        ['get_entries', 'limit', { type: 'integer', required: false, minimum: 1, maximum: 1000 }],
        [
          'get_entries_by_tags',
          'limit',
          { type: 'integer', required: false, minimum: 1, maximum: 1000 },
        ],
        ['check_new_entries', 'afterSequence', { type: 'integer', required: true, minimum: 0 }],
        [
          'get_entries_with_cursor',
          'beforeSequence',
          { type: 'integer', required: false, minimum: 0 },
        ],
        ['get_entries_by_tags', 'logic', { type: 'string', required: false, enum: ['AND', 'OR'] }],
        ['clear_entries', 'type', { type: 'string', required: false, enum: [...ENTRY_TYPES] }],
        [
          'get_entries_with_cursor',
          'type',
          { type: 'string', required: false, enum: [...ENTRY_TYPES] },
        ],
        ['get_entries_with_cursor', 'search', { type: 'string', required: false, maxLength: 500 }],
      ])('%s.%s is %j', (toolName, name, expected) => {
        expect(shape(toolName, name)).toEqual(expected);
      });

      it('says on both cursors that they go one at a time, from the one decorator', () => {
        expect(parameter('get_entries_with_cursor', 'afterSequence').description).toBe(
          'Not together with beforeSequence.',
        );
        expect(parameter('get_entries_with_cursor', 'beforeSequence').description).toBe(
          'Not together with afterSequence.',
        );
      });

      it('bounds every filter list by the number of values the validator allows', () => {
        for (const name of ['levels', 'paths', 'tags', 'statuses']) {
          expect(parameter('get_entries_with_cursor', name).maxItems).toBe(MAX_FILTER_VALUES);
        }
        expect(parameter('get_entries_by_tags', 'tags').maxItems).toBe(MAX_FILTER_VALUES);
      });

      it('marks as required only what has no optional marker, in every tool', () => {
        const required = manifest.tools.flatMap((candidate) =>
          candidate.parameters.filter((p) => p.required).map((p) => `${candidate.name}.${p.name}`),
        );

        expect(required.sort()).toEqual(
          [
            'add_monitored_tag.tag',
            'add_tags_to_entry.id',
            'add_tags_to_entry.tags',
            'check_new_entries.afterSequence',
            'get_entries_by_family_hash.hash',
            'get_entries_by_tags.tags',
            'get_entry.id',
            'get_entry_tags.id',
            'remove_monitored_tag.tag',
            'remove_tags_from_entry.id',
            'remove_tags_from_entry.tags',
            'resolve_entry.id',
            'unresolve_entry.id',
          ].sort(),
        );
      });
    });

    it('lists no parameters for a handler that takes none', () => {
      expect(tool('get_stats').parameters).toEqual([]);
    });
  });
});

describe('a handler that is decorated and nothing else', () => {
  class WidgetQuery {
    @IsOptional()
    @IsIn(['red', 'blue'])
    colour?: 'red' | 'blue';

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    size?: number;
  }

  class RenameBody {
    @IsString()
    @MaxLength(20)
    name!: string;
  }

  @Controller('__nestlens__/api')
  class WidgetController {
    @NestLensTool({ description: 'List widgets, narrowed by colour and size, newest first.' })
    @Get('widgets')
    listWidgets(@Query() _query: WidgetQuery): void {}

    @NestLensTool({ description: 'Rename one widget. Changes data.', destructive: true })
    @Patch('widgets/:id/rename')
    renameWidget(@Param('id', ParseIntPipe) _id: number, @Body() _body: RenameBody): void {}

    @Post('widgets/untouched')
    undecorated(): void {}
  }

  const built = buildToolManifest([WidgetController]);

  it('becomes a tool, with its parameters, without anything else being told', () => {
    const list = built.tools.find((candidate) => candidate.name === 'list_widgets');

    expect(list).toMatchObject({ method: 'GET', path: '/widgets', mutates: false });
    expect(list?.parameters).toEqual([
      { name: 'colour', in: 'query', type: 'string', required: false, enum: ['red', 'blue'] },
      { name: 'size', in: 'query', type: 'integer', required: false, minimum: 1, maximum: 50 },
    ]);
  });

  it('takes its path and body from the handler', () => {
    const rename = built.tools.find((candidate) => candidate.name === 'rename_widget');

    expect(rename).toMatchObject({
      method: 'PATCH',
      path: '/widgets/:id/rename',
      destructive: true,
    });
    expect(rename?.parameters.map((p) => [p.name, p.in, p.type])).toEqual([
      ['id', 'path', 'integer'],
      ['name', 'body', 'string'],
    ]);
  });

  it('leaves out what is not decorated', () => {
    expect(built.tools.map((candidate) => candidate.name)).toEqual([
      'list_widgets',
      'rename_widget',
    ]);
  });

  it('refuses two handlers with one name', () => {
    @Controller('__nestlens__/api')
    class Other {
      @NestLensTool({ description: 'Same name as one in another controller.' })
      @Get('other')
      listWidgets(): void {}
    }

    expect(() => buildToolManifest([WidgetController, Other])).toThrow(/two nestlens tools/i);
  });
});
