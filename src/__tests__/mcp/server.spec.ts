/**
 * The hub: two tools that between them reach everything the API publishes.
 *
 * The property worth the most here is the last describe block. A tool that
 * appears in the application after the MCP server has started is listed and
 * callable at once, which is the reason the server is a hub and not a list of
 * endpoints written out by hand.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { NestLensToolDescriptor, NestLensToolManifest } from '../../api/tools';
import { NestLensClient } from '../../mcp/client';
import { createNestLensMcpServer, type NestLensMcpServerOptions } from '../../mcp/server';

const read = (
  name: string,
  overrides: Partial<NestLensToolDescriptor> = {},
): NestLensToolDescriptor => ({
  name,
  description: `Reads ${name} for the test.`,
  method: 'GET',
  path: `/${name}`,
  mutates: false,
  destructive: false,
  parameters: [],
  ...overrides,
});

const clear = read('clear_things', {
  method: 'DELETE',
  mutates: true,
  destructive: true,
  parameters: [{ name: 'type', in: 'query', type: 'string', required: false, enum: ['a', 'b'] }],
});

const fakeClient = (tools: () => NestLensToolDescriptor[]) => {
  const invoke = jest.fn(
    async (tool: NestLensToolDescriptor, args?: Record<string, unknown>): Promise<unknown> => ({
      success: true,
      data: { ran: tool.name, args },
    }),
  );
  const manifest = jest.fn(async (): Promise<NestLensToolManifest> => ({
    version: 1,
    tools: tools(),
  }));
  return { client: { manifest, invoke } as unknown as NestLensClient, invoke, manifest };
};

const connect = async (
  options: Omit<NestLensMcpServerOptions, 'client'> & { client: NestLensClient },
) => {
  const server = createNestLensMcpServer(options);
  const agent = new Client({ name: 'test-agent', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), agent.connect(clientSide)]);
  return { agent, server };
};

const textOf = (result: unknown): string =>
  ((result as { content: Array<{ text: string }> }).content[0] as { text: string }).text;
const isError = (result: unknown): boolean => (result as { isError?: boolean }).isError === true;

describe('the hub', () => {
  it('offers two tools, whatever the application offers', async () => {
    const { client } = fakeClient(() => [read('a'), read('b'), read('c')]);
    const { agent } = await connect({ client });

    const { tools } = await agent.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(['nestlens_list_tools', 'nestlens_call_tool']);
  });

  it('tells the agent where to start', async () => {
    const { client } = fakeClient(() => []);
    const { agent } = await connect({ client });

    expect(agent.getInstructions()).toContain('nestlens_list_tools');
  });

  describe('nestlens_list_tools', () => {
    it('lists every operation with its description and arguments', async () => {
      const { client } = fakeClient(() => [read('get_stats'), clear]);
      const { agent } = await connect({ client, allowWrite: true });

      const result = await agent.callTool({ name: 'nestlens_list_tools', arguments: {} });
      const listed = JSON.parse(textOf(result)) as { tools: Array<Record<string, unknown>> };

      expect(listed.tools.map((tool) => tool.name)).toEqual(['get_stats', 'clear_things']);
      expect(listed.tools[1]).toMatchObject({
        name: 'clear_things',
        readOnly: false,
        destructive: true,
        enabled: true,
        arguments: {
          type: 'object',
          properties: { type: { type: 'string', enum: ['a', 'b'] } },
          required: [],
        },
      });
    });

    it('says which tools are switched off while read-only', async () => {
      const { client } = fakeClient(() => [read('get_stats'), clear]);
      const { agent } = await connect({ client });

      const listed = JSON.parse(
        textOf(await agent.callTool({ name: 'nestlens_list_tools', arguments: {} })),
      ) as { tools: Array<Record<string, unknown>> };

      expect(listed.tools[0]).toMatchObject({ enabled: true });
      expect(listed.tools[1]).toMatchObject({ enabled: false });
      expect(String(listed.tools[1]?.disabled)).toContain('--allow-write');
    });

    it('can be narrowed to some names, and reports a name it does not know', async () => {
      const { client } = fakeClient(() => [read('a'), read('b')]);
      const { agent } = await connect({ client });

      const listed = JSON.parse(
        textOf(
          await agent.callTool({ name: 'nestlens_list_tools', arguments: { names: ['b', 'zzz'] } }),
        ),
      ) as { tools: Array<{ name: string }>; unknown: string[] };

      expect(listed.tools.map((tool) => tool.name)).toEqual(['b']);
      expect(listed.unknown).toEqual(['zzz']);
    });

    it('reports a failure to reach the application as an error the agent can read', async () => {
      const client = {
        manifest: async () => {
          throw new Error('Could not reach NestLens at http://x');
        },
      } as unknown as NestLensClient;
      const { agent } = await connect({ client });

      const result = await agent.callTool({ name: 'nestlens_list_tools', arguments: {} });

      expect(isError(result)).toBe(true);
      expect(textOf(result)).toContain('Could not reach NestLens');
    });
  });

  describe('nestlens_call_tool', () => {
    it('runs a tool by name with its arguments', async () => {
      const { client, invoke } = fakeClient(() => [read('get_stats', { parameters: [] })]);
      const { agent } = await connect({ client });

      const result = await agent.callTool({
        name: 'nestlens_call_tool',
        arguments: { name: 'get_stats', arguments: { limit: 3 } },
      });

      expect(isError(result)).toBe(false);
      expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ name: 'get_stats' }), {
        limit: 3,
      });
      expect(JSON.parse(textOf(result))).toMatchObject({ data: { ran: 'get_stats' } });
    });

    it('refuses a change while read-only, without sending anything', async () => {
      const { client, invoke } = fakeClient(() => [clear]);
      const { agent } = await connect({ client });

      const result = await agent.callTool({
        name: 'nestlens_call_tool',
        arguments: { name: 'clear_things' },
      });

      expect(isError(result)).toBe(true);
      expect(textOf(result)).toContain('--allow-write');
      expect(invoke).not.toHaveBeenCalled();
    });

    it('runs a change once it is allowed', async () => {
      const { client, invoke } = fakeClient(() => [clear]);
      const { agent } = await connect({ client, allowWrite: true });

      const result = await agent.callTool({
        name: 'nestlens_call_tool',
        arguments: { name: 'clear_things', arguments: { type: 'a' } },
      });

      expect(isError(result)).toBe(false);
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('names the tools there are when one is not found', async () => {
      const { client } = fakeClient(() => [read('get_stats'), read('get_logs')]);
      const { agent } = await connect({ client });

      const result = await agent.callTool({
        name: 'nestlens_call_tool',
        arguments: { name: 'nope' },
      });

      expect(isError(result)).toBe(true);
      expect(textOf(result)).toContain('get_stats, get_logs');
    });

    it('turns a refusal from the API into an error the agent can act on', async () => {
      const { client, invoke } = fakeClient(() => [read('get_entries')]);
      invoke.mockRejectedValueOnce(
        Object.assign(new Error('Validation failed: type must be one of: request'), {
          name: 'NestLensApiError',
        }),
      );
      const { agent } = await connect({ client });

      const result = await agent.callTool({
        name: 'nestlens_call_tool',
        arguments: { name: 'get_entries' },
      });

      expect(isError(result)).toBe(true);
      expect(textOf(result)).toContain('type must be one of: request');
    });

    it.each([
      [{}, /`name` is required/],
      [{ name: 'get_stats', arguments: 'limit=3' }, /`arguments` must be an object/],
    ])('rejects %j before doing anything', async (args, message) => {
      const { client, invoke } = fakeClient(() => [read('get_stats')]);
      const { agent } = await connect({ client });

      const result = await agent.callTool({ name: 'nestlens_call_tool', arguments: args });

      expect(isError(result)).toBe(true);
      expect(textOf(result)).toMatch(message);
      expect(invoke).not.toHaveBeenCalled();
    });

    it('cuts a very long answer short and says so', async () => {
      const { client, invoke } = fakeClient(() => [read('get_logs')]);
      invoke.mockResolvedValueOnce({ data: 'x'.repeat(5_000) });
      const { agent } = await connect({ client, maxResponseChars: 200 });

      const result = await agent.callTool({
        name: 'nestlens_call_tool',
        arguments: { name: 'get_logs' },
      });

      expect(textOf(result)).toContain('Cut off: 200 of');
      expect(textOf(result).length).toBeLessThan(500);
    });
  });

  describe('when NestLens gains a tool after the server started', () => {
    it('lists it at once, with nothing changed here', async () => {
      let offered = [read('get_stats')];
      const { client } = fakeClient(() => offered);
      const { agent } = await connect({ client });

      const before = JSON.parse(
        textOf(await agent.callTool({ name: 'nestlens_list_tools', arguments: {} })),
      ) as { tools: Array<{ name: string }> };
      offered = [...offered, read('get_widgets')];
      const after = JSON.parse(
        textOf(await agent.callTool({ name: 'nestlens_list_tools', arguments: {} })),
      ) as { tools: Array<{ name: string }> };

      expect(before.tools.map((tool) => tool.name)).toEqual(['get_stats']);
      expect(after.tools.map((tool) => tool.name)).toEqual(['get_stats', 'get_widgets']);
    });

    it('can call it before anything has re-listed, because an unknown name refreshes the list', async () => {
      let offered = [read('get_stats')];
      const { client, invoke } = fakeClient(() => offered);
      const { agent } = await connect({ client });
      await agent.callTool({ name: 'nestlens_call_tool', arguments: { name: 'get_stats' } });

      offered = [...offered, read('get_widgets')];
      const result = await agent.callTool({
        name: 'nestlens_call_tool',
        arguments: { name: 'get_widgets' },
      });

      expect(isError(result)).toBe(false);
      expect(invoke).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'get_widgets' }), {});
    });
  });
});
