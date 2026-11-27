import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseCliOptions, USAGE } from '../../mcp/cli';
import { runNestLensMcpCli } from '../../mcp';

describe('parseCliOptions', () => {
  it('defaults to a local application, read-only', () => {
    expect(parseCliOptions([], {})).toEqual({
      url: 'http://localhost:3000/nestlens',
      headers: {},
      allowWrite: false,
      http: false,
      help: false,
    });
  });

  it('reads the environment', () => {
    const options = parseCliOptions([], {
      NESTLENS_URL: 'http://app:4000/dev/nestlens',
      NESTLENS_HEADERS: '{"Authorization":"Bearer x"}',
      NESTLENS_MCP_ALLOW_WRITE: '1',
    });

    expect(options).toMatchObject({
      url: 'http://app:4000/dev/nestlens',
      headers: { Authorization: 'Bearer x' },
      allowWrite: true,
    });
  });

  it('lets a flag override the environment', () => {
    const options = parseCliOptions(['--url', 'http://other/nestlens'], {
      NESTLENS_URL: 'http://env/nestlens',
    });

    expect(options.url).toBe('http://other/nestlens');
  });

  it('takes repeated headers, splitting at the first colon', () => {
    const options = parseCliOptions(['--header', 'X-A: 1', '--header', 'Cookie: a=b:c'], {});

    expect(options.headers).toEqual({ 'X-A': '1', Cookie: 'a=b:c' });
  });

  it('takes the HTTP options, and the token from the environment', () => {
    expect(
      parseCliOptions(['--http', '--host', '0.0.0.0', '--port', '9000'], {
        NESTLENS_MCP_TOKEN: 'secret',
      }),
    ).toMatchObject({ http: true, host: '0.0.0.0', port: 9000, token: 'secret' });
    expect(
      parseCliOptions(['--http', '--token', 'flag'], { NESTLENS_MCP_TOKEN: 'env' }).token,
    ).toBe('flag');
    expect(parseCliOptions([], { NESTLENS_MCP_PORT: '9100' }).port).toBe(9100);
  });

  it('refuses a port that is not one', () => {
    expect(() => parseCliOptions(['--port', 'http'], {})).toThrow(/port number/);
    expect(() => parseCliOptions(['--port', '70000'], {})).toThrow(/port number/);
  });

  it('takes --allow-write, --timeout and --help', () => {
    expect(parseCliOptions(['--allow-write', '--timeout', '500', '-h'], {})).toMatchObject({
      allowWrite: true,
      timeoutMs: 500,
      help: true,
    });
  });

  it.each([
    [['--nope'], /Unknown option --nope/],
    [['--url'], /--url needs a value/],
    [['--header', 'no-colon'], /expects "Name: value"/],
    [['--timeout', 'soon'], /whole number of milliseconds/],
  ])('refuses %j in one line', (argv, message) => {
    expect(() => parseCliOptions(argv, {})).toThrow(message);
  });

  it('names a malformed header without repeating it, since it may be a secret', () => {
    const attempt = (): unknown => parseCliOptions(['--header', 'Bearer s3cr3t-token'], {});

    expect(attempt).toThrow(/--header expects "Name: value"/);
    expect(attempt).not.toThrow(/s3cr3t/);
  });

  it.each([
    [['--url', 'http://user:hunter2@localhost:3000/nestlens'], {}],
    [[], { NESTLENS_URL: 'http://user:hunter2@localhost:3000/nestlens' }],
  ])('refuses a URL with credentials in it, without repeating them (%j, %j)', (argv, env) => {
    const attempt = (): unknown => parseCliOptions(argv, env);

    expect(attempt).toThrow(/contains credentials.*--header/s);
    expect(attempt).not.toThrow(/hunter2/);
  });

  it('refuses a URL with no scheme, which is not one fetch can use', () => {
    const attempt = (): unknown => parseCliOptions(['--url', 'u:hunter2@localhost:3000'], {});

    expect(attempt).toThrow(/must be an http:\/\/ or https:\/\/ address/);
    expect(attempt).not.toThrow(/hunter2/);
  });

  it('refuses headers that are not a JSON object', () => {
    expect(() => parseCliOptions([], { NESTLENS_HEADERS: 'Authorization: x' })).toThrow(
      /JSON object/,
    );
    expect(() => parseCliOptions([], { NESTLENS_HEADERS: '[1]' })).toThrow(/JSON object/);
  });
});

/**
 * What the `nestlens-mcp` package's bin calls. It lives here, behind the
 * `nestlens/mcp` entry point, so the package that ships the command is one
 * line and the CLI is tested where it is written.
 */
describe('runNestLensMcpCli', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('is what nestlens/mcp exports for a bin to call', async () => {
    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });

    await runNestLensMcpCli(['--help'], {});

    expect(written.join('')).toBe(USAGE);
  });

  it('answers a mistake on the command line with exit code 2 and one line', async () => {
    const errors: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      errors.push(String(chunk));
      return true;
    });

    await runNestLensMcpCli(['--bogus'], {});

    expect(process.exitCode).toBe(2);
    expect(errors).toEqual(['nestlens-mcp: Unknown option --bogus. Try --help.\n']);
  });

  it('exits 1 with the reason when the server cannot start, without a stack trace', async () => {
    const errors: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      errors.push(String(chunk));
      return true;
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await runNestLensMcpCli(['--http', '--host', '0.0.0.0', '--port', '0'], {});

    expect(exit).toHaveBeenCalledWith(1);
    expect(errors.join('')).toMatch(/^nestlens-mcp: .*token/);
    expect(errors.join('')).not.toMatch(/\n\s+at /);
  });
});
