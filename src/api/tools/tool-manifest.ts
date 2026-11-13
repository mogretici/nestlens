import { RequestMethod } from '@nestjs/common';
import { NESTLENS_API_PREFIX } from '../../nestlens.config';
import { ToolParameter, describeDto } from './dto-schema';
import { NESTLENS_TOOL_METADATA, NestLensToolOptions } from './tool.decorator';

/**
 * The keys Nest writes its route metadata under.
 *
 * Inlined rather than imported from `@nestjs/common/constants`, which is not
 * part of the public API (the same reasoning as `HTTP_CODE_METADATA` in the
 * response interceptor). `tool-manifest.spec.ts` asserts each still matches the
 * framework's constant, so a rename fails a test and not every tool at once.
 */
export const PATH_KEY = 'path';
export const METHOD_KEY = 'method';
export const ROUTE_ARGS_KEY = '__routeArguments__';

/** `RouteParamtypes` from `@nestjs/common/enums`, for the three kinds read here. */
export const PARAMTYPE_BODY = 3;
export const PARAMTYPE_QUERY = 4;
export const PARAMTYPE_PARAM = 5;

export type ToolHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface NestLensToolDescriptor {
  /** The handler's method name in snake_case: stable, and one per handler. */
  name: string;
  description: string;
  method: ToolHttpMethod;
  /** Relative to the API root, with `:name` placeholders: `/entries/:id`. */
  path: string;
  /** Anything but a GET. Reading is always safe; this is not. */
  mutates: boolean;
  /** Cannot be undone. Only ever set on something that `mutates`. */
  destructive: boolean;
  parameters: ToolParameter[];
}

export interface NestLensToolManifest {
  /** Bumped when the shape of a descriptor changes, so a client can refuse one it does not know. */
  version: 1;
  tools: NestLensToolDescriptor[];
}

type Controller = new (...args: never[]) => object;

interface RouteArgument {
  index: number;
  data?: string;
}

const METHODS: Record<number, ToolHttpMethod | undefined> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

export const toSnakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const firstPath = (value: unknown): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : '';
};

const joinPath = (...parts: string[]): string => {
  const joined = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter((part) => part.length > 0)
    .join('/');
  return `/${joined}`;
};

/**
 * Where the controller sits relative to the API root.
 *
 * The prefix is rewritten at runtime to follow `NestLensConfig.path` (see
 * `NestLensModule.mountControllersAt`), so it is read here rather than assumed,
 * and everything up to and including `__nestlens__/api` is dropped. What is
 * left — nothing, or `tags` — is the same wherever NestLens is mounted, which
 * is what lets a client know only the one URL.
 */
const relativeControllerPath = (controller: Controller): string => {
  const full = firstPath(Reflect.getMetadata(PATH_KEY, controller));
  const marker = `${NESTLENS_API_PREFIX}/api`;
  const at = full.indexOf(marker);
  return at === -1 ? full : full.slice(at + marker.length);
};

const pathParameters = (
  target: object,
  handler: string,
  args: Record<string, RouteArgument>,
): ToolParameter[] => {
  const types = (Reflect.getMetadata('design:paramtypes', target, handler) ?? []) as unknown[];
  const found: ToolParameter[] = [];

  for (const [key, argument] of Object.entries(args)) {
    if (key.split(':')[0] !== String(PARAMTYPE_PARAM) || !argument.data) continue;
    found.push({
      name: argument.data,
      in: 'path',
      required: true,
      type: types[argument.index] === Number ? 'integer' : 'string',
    });
  }

  return found;
};

const dtoParameters = (
  target: object,
  handler: string,
  args: Record<string, RouteArgument>,
  paramtype: number,
  location: 'query' | 'body',
): ToolParameter[] => {
  const types = (Reflect.getMetadata('design:paramtypes', target, handler) ?? []) as unknown[];
  const found: ToolParameter[] = [];

  for (const [key, argument] of Object.entries(args)) {
    if (key.split(':')[0] !== String(paramtype)) continue;
    const dto = types[argument.index];

    // `@Query() query: SomeDto` — every property of the class is a parameter.
    if (!argument.data && typeof dto === 'function' && dto !== Object) {
      found.push(...describeDto(dto as new (...args: never[]) => object, location));
    }
  }

  return found;
};

const describeHandler = (
  controller: Controller,
  handler: string,
): NestLensToolDescriptor | null => {
  const target = controller.prototype as Record<string, unknown>;
  const fn = target[handler];
  if (typeof fn !== 'function') return null;

  const options = Reflect.getMetadata(NESTLENS_TOOL_METADATA, fn) as
    NestLensToolOptions | undefined;
  if (!options) return null;

  const method = METHODS[Reflect.getMetadata(METHOD_KEY, fn) as number];
  if (!method) {
    throw new Error(`${controller.name}.${handler} is a tool but not an HTTP route`);
  }

  const args = (Reflect.getMetadata(ROUTE_ARGS_KEY, controller, handler) ?? {}) as Record<
    string,
    RouteArgument
  >;

  const mutates = method !== 'GET';

  return {
    name: toSnakeCase(handler),
    description: options.description,
    method,
    path: joinPath(
      relativeControllerPath(controller),
      firstPath(Reflect.getMetadata(PATH_KEY, fn)),
    ),
    mutates,
    destructive: mutates && options.destructive === true,
    parameters: [
      ...pathParameters(target, handler, args),
      ...dtoParameters(target, handler, args, PARAMTYPE_QUERY, 'query'),
      ...dtoParameters(target, handler, args, PARAMTYPE_BODY, 'body'),
    ],
  };
};

/**
 * Everything the API offers as a tool, read from the controllers themselves.
 *
 * Built on request, from the live metadata, rather than kept as a list: a list
 * is the thing that goes stale. Reading the controllers means the manifest is
 * the API, so the MCP server that consumes it never has to be updated when an
 * endpoint is added.
 */
export const buildToolManifest = (controllers: readonly Controller[]): NestLensToolManifest => {
  const tools: NestLensToolDescriptor[] = [];
  const seen = new Set<string>();

  for (const controller of controllers) {
    for (const handler of Object.getOwnPropertyNames(controller.prototype)) {
      const descriptor = describeHandler(controller, handler);
      if (!descriptor) continue;

      if (seen.has(descriptor.name)) {
        throw new Error(`Two NestLens tools are named "${descriptor.name}"; rename one handler`);
      }
      seen.add(descriptor.name);
      tools.push(descriptor);
    }
  }

  return { version: 1, tools };
};
