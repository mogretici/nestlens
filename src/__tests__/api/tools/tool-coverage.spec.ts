/**
 * Nothing the API can do is missing from the tools.
 *
 * The MCP server is a hub over `GET __nestlens__/api/tools`, so an endpoint
 * that is not a tool is an endpoint no agent can reach — and nobody would
 * notice, because nothing fails. This is the test that notices: add a route to
 * a NestLens controller without `@NestLensTool` and it fails, naming the route.
 */
import { readdirSync } from 'fs';
import { join } from 'path';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { NestLensApiController } from '../../../api/api.controller';
import { NESTLENS_TOOL_METADATA } from '../../../api/tools';
import { NESTLENS_API_PREFIX } from '../../../nestlens.config';

const API_DIR = join(__dirname, '..', '..', '..', 'api');

/**
 * Routes that are deliberately not tools, with the reason.
 *
 * `getTools` is the manifest itself. The SSE stream and the dashboard are not
 * request/response operations an agent could call. Add to this list only with a
 * reason as good as those.
 */
const NOT_TOOLS = new Set(['NestLensApiController.getTools']);

type ControllerClass = new (...args: never[]) => object;

const controllers = (): ControllerClass[] =>
  readdirSync(API_DIR)
    .filter((file) => file.endsWith('.controller.ts'))
    .flatMap((file) => Object.values(require(join(API_DIR, file)) as Record<string, unknown>))
    .filter((value): value is ControllerClass => typeof value === 'function')
    .filter((value) => {
      const path = Reflect.getMetadata(PATH_METADATA, value) as string | undefined;
      return typeof path === 'string' && path.includes(`${NESTLENS_API_PREFIX}/api`);
    });

const routes = (controller: ControllerClass): string[] =>
  Object.getOwnPropertyNames(controller.prototype).filter((name) => {
    const handler = (controller.prototype as Record<string, unknown>)[name];
    return typeof handler === 'function' && Reflect.hasMetadata(METHOD_METADATA, handler);
  });

describe('tool coverage', () => {
  it('finds the controllers whose routes it checks', () => {
    expect(controllers().map((c) => c.name)).toEqual(
      expect.arrayContaining(['NestLensApiController', 'TagController']),
    );
  });

  it('has a tool for every route of every API controller', () => {
    const undecorated = controllers().flatMap((controller) =>
      routes(controller)
        .filter((name) => !NOT_TOOLS.has(`${controller.name}.${name}`))
        .filter(
          (name) =>
            !Reflect.hasMetadata(
              NESTLENS_TOOL_METADATA,
              (controller.prototype as Record<string, unknown>)[name] as object,
            ),
        )
        .map((name) => `${controller.name}.${name}`),
    );

    expect(undecorated).toEqual([]);
  });

  it('serves every one of them from the endpoint', async () => {
    const api = Object.create(NestLensApiController.prototype) as NestLensApiController;
    const served = new Set((await api.getTools()).data.tools.map((tool) => tool.name));

    const missing = controllers().flatMap((controller) =>
      routes(controller)
        .filter((name) => !NOT_TOOLS.has(`${controller.name}.${name}`))
        .map((name) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())
        .filter((name) => !served.has(name)),
    );

    // A controller that has tools but is not in the list `getTools` builds from
    // is the way this goes wrong after a new controller is added.
    expect(missing).toEqual([]);
  });
});
