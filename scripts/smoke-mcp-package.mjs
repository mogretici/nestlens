#!/usr/bin/env node
/**
 * Starts the *published* `nestlens-mcp` the way an MCP client does, from an
 * empty directory, and speaks MCP to it.
 *
 * The unit tests run the CLI from source. What they cannot see is the package
 * npm serves: a bin that resolves `nestlens/mcp` against the `nestlens` it
 * pinned, with the SDK npm installed beside it. Before this package existed the
 * command a registry client built stopped at "@modelcontextprotocol/sdk is not
 * installed" with every suite green.
 *
 * `initialize` and `tools/list` need no NestLens to answer — the hub's two
 * tools are fixed, and the application is only asked when a tool is called —
 * so nothing else has to be running.
 *
 * Usage:
 *   node scripts/smoke-mcp-package.mjs                  # version in package.json, from npm
 *   node scripts/smoke-mcp-package.mjs 0.19.0           # a specific published version
 *   node scripts/smoke-mcp-package.mjs --tarball nestlens-mcp-x.tgz --library-tarball nestlens-x.tgz
 *                                                       # before publishing: both packages
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { waitForInstallable } from './registry-wait.mjs';

const argv = process.argv.slice(2);
const option = (name) => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : resolve(argv[at + 1] ?? '');
};
const tarball = option('--tarball');
const libraryTarball = option('--library-tarball');
if (Boolean(tarball) !== Boolean(libraryTarball)) {
  console.error('--tarball and --library-tarball go together: the wrapper pins the library.');
  process.exit(2);
}
const version =
  argv.find(
    (argument, index) => !argument.startsWith('--') && !argv[index - 1]?.startsWith('--'),
  ) ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const failures = [];
const check = (description, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${description}`);
    return;
  }
  console.log(`  FAIL ${description}${detail ? ` — ${detail}` : ''}`);
  failures.push(description);
};

const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });

/** Ten minutes, for the reason scripts/smoke-published-package.mjs gives. */
const REGISTRY_ATTEMPTS = 60;

/** The wrapper pins the library at the same version, so install needs both. */
const waitForRegistry = (target) =>
  waitForInstallable(
    [
      ['nestlens-mcp', target],
      ['nestlens', target],
    ],
    { attempts: REGISTRY_ATTEMPTS, intervalMs: 10_000 },
  );

/**
 * Starts the command, sends `initialize` and `tools/list` as newline-delimited
 * JSON-RPC on stdin — the stdio transport — and returns both answers, or the
 * reason there were none.
 */
const handshake = (command, args, cwd) =>
  new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const replies = [];
    let stderr = '';
    const finish = (result) => {
      clearTimeout(timer);
      child.kill();
      resolvePromise({ ...result, stderr });
    };
    // npx downloads the package and its dependencies first.
    const timer = setTimeout(() => finish({ error: 'no answer within 5 minutes' }), 300_000);
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);

    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('exit', (code) => finish({ error: `exited with ${code} before answering` }));
    createInterface({ input: child.stdout }).on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        finish({ error: `wrote something that is not JSON-RPC to stdout: ${line.slice(0, 200)}` });
        return;
      }
      replies.push(message);
      if (replies.length === 1) {
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      } else {
        finish({ initialize: replies[0], tools: replies[1] });
      }
    });

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'nestlens-smoke', version: '0' },
      },
    });
  });

const workspace = mkdtempSync(join(tmpdir(), 'nestlens-mcp-smoke-'));
// Nothing listens here: the handshake must not need NestLens.
const URL_ARGS = ['--url', 'http://127.0.0.1:9/nestlens'];

try {
  let command;
  let args;
  let expected = version;

  if (tarball) {
    console.log(`\nInstalling ${libraryTarball} and ${tarball} into ${workspace}\n`);
    writeFileSync(
      join(workspace, 'package.json'),
      JSON.stringify({ name: 'smoke', private: true }),
    );
    run(
      'npm',
      ['install', '--no-audit', '--no-fund', '--loglevel=error', libraryTarball, tarball],
      {
        cwd: workspace,
        stdio: 'inherit',
      },
    );

    const installed = (path) =>
      JSON.parse(readFileSync(join(workspace, 'node_modules', path, 'package.json'), 'utf8'));
    const wrapper = installed('nestlens-mcp');
    const lock = JSON.parse(readFileSync(join(workspace, 'package-lock.json'), 'utf8'));
    expected = wrapper.version;

    check(
      'the wrapper pins the library tarball it was packed with',
      wrapper.dependencies.nestlens === installed('nestlens').version,
      `wrapper wants ${wrapper.dependencies.nestlens}, tarball is ${installed('nestlens').version}`,
    );
    check(
      'npm used the library tarball rather than fetching one from the registry',
      String(lock.packages['node_modules/nestlens']?.resolved).startsWith('file:') &&
        !existsSync(join(workspace, 'node_modules', 'nestlens-mcp', 'node_modules', 'nestlens')),
    );
    check(
      'the command is the wrapper’s, not a bin of the library',
      !installed('nestlens').bin,
      JSON.stringify(installed('nestlens').bin),
    );

    command = 'npx';
    // Refuses to fetch anything: the bin must come from what was just installed.
    args = ['--yes=false', 'nestlens-mcp', ...URL_ARGS];
  } else {
    console.log(`\nStarting nestlens-mcp@${version} with npx from ${workspace}\n`);
    await waitForRegistry(version);
    command = 'npx';
    args = ['--yes', `nestlens-mcp@${version}`, ...URL_ARGS];
  }

  // The wait reads the same document npx does, but two CDN edges can still
  // disagree for a moment; a version npm says does not exist is worth asking
  // about again rather than failing a release that did publish.
  let result = await handshake(command, args, workspace);
  for (let retry = 1; !tarball && retry <= 3 && /ETARGET/.test(result.stderr); retry += 1) {
    console.log(`  … npx could not see nestlens-mcp@${version} yet, asking again (${retry}/3)`);
    await delay(30_000);
    result = await handshake(command, args, workspace);
  }
  if (result.error) {
    check('answers initialize and tools/list', false, `${result.error}\n${result.stderr}`);
  } else {
    const info = result.initialize.result?.serverInfo;
    const tools = (result.tools.result?.tools ?? []).map((tool) => tool.name).sort();

    check('answers initialize as nestlens', info?.name === 'nestlens', JSON.stringify(info));
    check(`reports version ${expected}`, info?.version === expected, info?.version);
    check(
      'lists the two hub tools',
      JSON.stringify(tools) === JSON.stringify(['nestlens_call_tool', 'nestlens_list_tools']),
      tools.join(', '),
    );
    check(
      'keeps stdout for the protocol: startup notes go to stderr',
      /nestlens-mcp: serving/.test(result.stderr),
      result.stderr.trim().split('\n').pop(),
    );
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nnestlens-mcp started and answered.');
