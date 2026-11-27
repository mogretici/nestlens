/**
 * `nestlens-mcp` started where the MCP SDK is not installed.
 *
 * The SDK is an optional peer, so this is the first thing most people meet.
 * The bin is compiled on its own into a directory with no `node_modules`, next
 * to a stand-in `cli`, and run as a process: nothing in this repository's own
 * `node_modules` can be found from there unless `NODE_PATH` points at it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const ROOT = resolve(__dirname, '../../..');

describe('nestlens-mcp without the MCP SDK', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'nestlens-mcp-bin-'));
    const source = readFileSync(join(ROOT, 'src/mcp/bin.ts'), 'utf8');
    const { outputText } = transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    });
    writeFileSync(join(dir, 'bin.js'), outputText);
    writeFileSync(
      join(dir, 'cli.js'),
      "exports.main = async () => { process.stdout.write('cli loaded\\n'); };\n",
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (nodePath: string, ...args: string[]): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [join(dir, 'bin.js'), ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: nodePath },
    });

  it.each([[[]], [['--help']]])('says how to install it, in one line, for %j', (args) => {
    const result = run('', ...args);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain('npm install --save-dev @modelcontextprotocol/sdk');
    expect(result.stderr).toContain('npx -y -p nestlens -p @modelcontextprotocol/sdk nestlens-mcp');
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });

  it('starts the CLI once the SDK can be found', () => {
    const result = run(join(ROOT, 'node_modules'), '--help');

    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('cli loaded\n');
    expect(result.status).toBe(0);
  });
});
