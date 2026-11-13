/**
 * The MCP hub against a real NestLens, over real HTTP.
 *
 * Everything the hub does is decided by what the application publishes at
 * `GET __nestlens__/api/tools`, so this is the test that the two halves agree:
 * the hub lists what the controllers declare, and a call it builds from that
 * description is one the API accepts.
 */
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AddressInfo } from 'net';
import { CollectorService } from '../../core/collector.service';
import { NestLensModule } from '../../nestlens.module';
import { NestLensClient } from '../../mcp/client';
import { createNestLensMcpServer } from '../../mcp/server';

@Controller()
class HelloController {
  @Get('hello')
  hello(): { hello: string } {
    return { hello: 'world' };
  }
}

@Module({
  imports: [NestLensModule.forRoot({ enabled: true, path: '/dev/nestlens' })],
  controllers: [HelloController],
})
class AppModule {}

const textOf = (result: unknown): string =>
  ((result as { content: Array<{ text: string }> }).content[0] as { text: string }).text;
const isError = (result: unknown): boolean => (result as { isError?: boolean }).isError === true;
const json = (result: unknown): any => JSON.parse(textOf(result));

describe('nestlens-mcp against a running application', () => {
  let app: INestApplication;
  let baseUrl: string;
  const agents: Client[] = [];

  const connect = async (allowWrite: boolean): Promise<Client> => {
    const server = createNestLensMcpServer({
      client: new NestLensClient({ baseUrl }),
      allowWrite,
    });
    const agent = new Client({ name: 'integration-agent', version: '1.0.0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), agent.connect(clientSide)]);
    agents.push(agent);
    return agent;
  };

  const call = (agent: Client, name: string, args?: Record<string, unknown>) =>
    agent.callTool({ name: 'nestlens_call_tool', arguments: { name, arguments: args } });

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/dev/nestlens`;

    // Give NestLens something to have recorded.
    for (let i = 0; i < 3; i += 1) await fetch(`http://127.0.0.1:${port}/hello`);
    await fetch(`http://127.0.0.1:${port}/missing`);
    // Entries are buffered for a second before they are stored; the hub can
    // only report what has been.
    await app.get(CollectorService).flush();
  });

  afterAll(async () => {
    await Promise.all(agents.map((agent) => agent.close()));
    await app?.close();
  });

  it('lists what the controllers declare, found at a custom mount', async () => {
    const agent = await connect(false);

    const listed = json(await agent.callTool({ name: 'nestlens_list_tools', arguments: {} }));
    const names = listed.tools.map((tool: { name: string }) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'get_stats',
        'get_entries_with_cursor',
        'get_entry',
        'clear_entries',
      ]),
    );
    expect(names).not.toContain('get_tools');
  });

  it('answers a call built from the description', async () => {
    const agent = await connect(false);

    const stats = json(await call(agent, 'get_stats'));

    expect(stats.success).toBe(true);
    expect(stats.data.byType.request).toBeGreaterThanOrEqual(3);
  });

  it('filters with the arguments the description names', async () => {
    const agent = await connect(false);

    const found = json(
      await call(agent, 'get_entries_with_cursor', {
        type: 'request',
        paths: ['/hello'],
        limit: 10,
      }),
    );

    expect(found.data.length).toBeGreaterThanOrEqual(3);
    expect(found.data.every((entry: { type: string }) => entry.type === 'request')).toBe(true);
  });

  it('follows a path parameter to one entry', async () => {
    const agent = await connect(false);
    const [first] = json(await call(agent, 'get_entries', { type: 'request', limit: 1 })).data;

    const one = json(await call(agent, 'get_entry', { id: first.id }));

    expect(one.data.id).toBe(first.id);
  });

  it('carries the API’s own message when it refuses an argument', async () => {
    const agent = await connect(false);

    const result = await call(agent, 'get_entries', { type: 'nonsense' });

    expect(isError(result)).toBe(true);
    expect(textOf(result)).toContain('type');
  });

  it('does not touch the application while read-only', async () => {
    const agent = await connect(false);

    const result = await call(agent, 'pause_recording', { reason: 'hub test' });
    const status = json(await call(agent, 'get_recording_status'));

    expect(isError(result)).toBe(true);
    expect(status.data.isPaused).toBe(false);
  });

  it('changes it when allowed, and the change is visible through the same hub', async () => {
    const agent = await connect(true);

    const paused = json(await call(agent, 'pause_recording', { reason: 'hub test' }));
    const status = json(await call(agent, 'get_recording_status'));
    await call(agent, 'resume_recording');
    const resumed = json(await call(agent, 'get_recording_status'));

    expect(paused.data).toMatchObject({ isPaused: true, pauseReason: 'hub test' });
    expect(status.data.isPaused).toBe(true);
    expect(resumed.data.isPaused).toBe(false);
  });

  describe('a tag that contains a comma', () => {
    // The API reads a comma in a query value as a separator, so a list sent as
    // one comma-joined string cannot say "this one tag has a comma in it".
    it.each([
      ['alone', ['ALPHA,BETA']],
      ['beside another', ['ALPHA,BETA', 'GAMMA']],
    ])('is found as one tag, %s', async (_label, wanted) => {
      const agent = await connect(true);
      const [first, second] = json(
        await call(agent, 'get_entries', { type: 'request', limit: 2 }),
      ).data;
      await call(agent, 'add_tags_to_entry', { id: first.id, tags: ['ALPHA,BETA'] });
      await call(agent, 'add_tags_to_entry', { id: second.id, tags: ['ALPHA'] });

      const found = json(await call(agent, 'get_entries_by_tags', { tags: wanted, logic: 'OR' }));
      const ids = found.data.map((entry: { id: number }) => entry.id);

      expect(ids).toContain(first.id);
      // `ALPHA` alone would match the second entry if the comma had split the tag.
      expect(ids).not.toContain(second.id);
    });
  });

  it('reaches the tag endpoints, whose paths sit under /tags', async () => {
    const agent = await connect(true);

    const added = json(await call(agent, 'add_monitored_tag', { tag: 'HUB' }));
    const monitored = json(await call(agent, 'get_monitored_tags'));
    await call(agent, 'remove_monitored_tag', { tag: 'HUB' });

    expect(added.success).toBe(true);
    expect(JSON.stringify(monitored.data)).toContain('HUB');
  });
});
