import { parseCliOptions } from '../../mcp/cli';

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

  it('refuses headers that are not a JSON object', () => {
    expect(() => parseCliOptions([], { NESTLENS_HEADERS: 'Authorization: x' })).toThrow(
      /JSON object/,
    );
    expect(() => parseCliOptions([], { NESTLENS_HEADERS: '[1]' })).toThrow(/JSON object/);
  });
});
