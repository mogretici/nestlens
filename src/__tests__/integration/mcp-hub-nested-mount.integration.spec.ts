/**
 * A mount point that itself contains `__nestlens__/api`.
 *
 * `path` accepts it, and the controllers then sit under
 * `dev/__nestlens__/api/__nestlens__/api`. The manifest drops everything up to
 * the API root to make its paths mount-independent, and took the first
 * occurrence for the root: `get_stats` was advertised as
 * `/__nestlens__/api/stats`, which the client then appended to its own root
 * and asked for a URL that does not exist. Listing worked; every call failed.
 */
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AddressInfo } from 'net';
import { NestLensModule } from '../../nestlens.module';
import { NestLensClient } from '../../mcp/client';
import { createNestLensMcpServer } from '../../mcp/server';

@Module({ imports: [NestLensModule.forRoot({ enabled: true, path: '/dev/__nestlens__/api' })] })
class AppModule {}

const textOf = (result: unknown): string =>
  ((result as { content: Array<{ text: string }> }).content[0] as { text: string }).text;

describe('nestlens-mcp with the API root inside the mount path', () => {
  let app: INestApplication;
  let agent: Client;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;

    const server = createNestLensMcpServer({
      client: new NestLensClient({ baseUrl: `http://127.0.0.1:${port}/dev/__nestlens__/api` }),
    });
    agent = new Client({ name: 'nested-mount-agent', version: '1.0.0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), agent.connect(clientSide)]);
  });

  afterAll(async () => {
    await agent?.close();
    await app?.close();
  });

  it('advertises routes relative to the real API root', async () => {
    const listed = JSON.parse(
      textOf(
        await agent.callTool({ name: 'nestlens_list_tools', arguments: { names: ['get_stats'] } }),
      ),
    );

    expect(listed.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_stats']);
  });

  it('calls a tool at the real address, for the API and for tags', async () => {
    for (const name of ['get_stats', 'get_all_tags']) {
      const result = await agent.callTool({ name: 'nestlens_call_tool', arguments: { name } });

      expect({ name, isError: (result as { isError?: boolean }).isError }).toEqual({
        name,
        isError: undefined,
      });
      expect(JSON.parse(textOf(result)).success).toBe(true);
    }
  });
});
