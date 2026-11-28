/**
 * The Claude Code plugin in `plugins/nestlens`, listed by the marketplace in
 * `.claude-plugin/marketplace.json`.
 *
 * Nothing in the plugin is compiled or run by this repository, so nothing else
 * notices when it drifts. Its skill names NestLens operations for an agent to
 * call, and a name that no longer exists is refused at the worst moment: in
 * the middle of somebody's debugging session. Its server is started with
 * `npx`, so a renamed package or a wrong default URL installs cleanly and then
 * fails. `claude plugin validate` checks the shape, not these.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { NestLensApiController } from '../../api/api.controller';
import { TagController } from '../../api/tag.controller';
import { buildToolManifest } from '../../api/tools';
import { parseCliOptions } from '../../mcp/cli';

const ROOT = resolve(__dirname, '..', '..', '..');
const PLUGIN = join(ROOT, 'plugins', 'nestlens');

const read = (path: string): string => readFileSync(path, 'utf8');
const json = <T>(path: string): T => JSON.parse(read(path)) as T;

interface Marketplace {
  readonly name: string;
  readonly plugins: readonly { readonly name: string; readonly source: string }[];
}

interface PluginManifest {
  readonly name: string;
  readonly userConfig: Record<string, { readonly default?: string }>;
}

interface McpConfig {
  readonly mcpServers: Record<string, { readonly command: string; readonly args: string[] }>;
}

const HUB_TOOLS = ['nestlens_list_tools', 'nestlens_call_tool'];

const skill = (): string => read(join(PLUGIN, 'skills', 'debug', 'SKILL.md'));

describe('the Claude Code plugin', () => {
  it('is listed under the name its manifest gives it, at the path it lives in', () => {
    const marketplace = json<Marketplace>(join(ROOT, '.claude-plugin', 'marketplace.json'));
    const manifest = json<PluginManifest>(join(PLUGIN, '.claude-plugin', 'plugin.json'));

    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: manifest.name, source: './plugins/nestlens' }),
    ]);
  });

  it('starts the published MCP package, at the URL the user configures', () => {
    const { name } = json<{ name: string }>(join(ROOT, 'packages', 'mcp', 'package.json'));
    const { mcpServers } = json<McpConfig>(join(PLUGIN, '.mcp.json'));

    expect(mcpServers.nestlens).toEqual({
      command: 'npx',
      args: ['-y', name, '--url', '${user_config.url}'],
    });
  });

  it('defaults that URL to the one nestlens-mcp itself defaults to', () => {
    const { userConfig } = json<PluginManifest>(join(PLUGIN, '.claude-plugin', 'plugin.json'));

    expect(userConfig.url?.default).toBe(parseCliOptions([], {}).url);
  });

  describe('its skill', () => {
    const offered = buildToolManifest([NestLensApiController, TagController]).tools.map(
      (tool) => tool.name,
    );
    /** Every `snake_case` name in backticks that reads as an operation. */
    const named = (): string[] => [
      ...new Set(
        [...skill().matchAll(/`([a-z]+(?:_[a-z0-9]+)+)`/g)]
          .map((match) => match[1] as string)
          .filter((name) => /^(get|check|run|clear|resolve|pause|nestlens)_/.test(name)),
      ),
    ];

    it('names operations at all, so the check below is not vacuous', () => {
      expect(named().length).toBeGreaterThan(10);
    });

    it('names only operations the API offers, or the two hub tools', () => {
      const unknown = named().filter(
        (name) => !HUB_TOOLS.includes(name) && !offered.includes(name),
      );

      expect(unknown).toEqual([]);
    });

    it('has the frontmatter a skill is matched by', () => {
      const frontmatter = /^---\nname: debug\ndescription: (.+)\n---\n/.exec(skill());

      expect(frontmatter?.[1]).toMatch(/NestJS/);
      expect(frontmatter?.[1]?.length).toBeLessThanOrEqual(1536);
    });
  });
});
