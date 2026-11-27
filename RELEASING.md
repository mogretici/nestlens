# Releasing

Releases are not made by hand. Merging to `main` runs
`.github/workflows/release.yml`, and semantic-release decides from the commit
messages whether there is a release and what its version is. Nobody runs
`npm publish` for `nestlens`, and nobody bumps a version in a pull request.

## What decides the version

[Conventional commits](https://www.conventionalcommits.org), read by
`@semantic-release/commit-analyzer` with its default rules:

| Commit | Release | Example |
| --- | --- | --- |
| `fix:` / `perf:` | patch | 0.19.0 → 0.19.1 |
| `feat:` | minor | 0.19.0 → 0.20.0 |
| a `BREAKING CHANGE:` footer, or `!` after the type | major | 0.19.0 → 1.0.0 |
| `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:`, `style:` | none | |

NestLens is pre-1.0, where a minor may break things (SemVer §4), and 1.0 is a
release to be made on purpose: a breaking change before then goes out as a
`feat:` and is written up in
[upgrading](docs/docs/getting-started/upgrading.md), not marked with a
`BREAKING CHANGE:` footer, which would release 1.0.0.

Each release gets a `CHANGELOG.md` section from the same messages, so the
subject is what a reader of the changelog sees.

## What one release does

### The `release` job

1. Installs, builds and runs the full suite, Redis included.
2. Runs semantic-release (`.releaserc.json`), which:
   - bumps `package.json` and `package-lock.json` and writes `CHANGELOG.md`;
   - runs `npm run sync-versions` (`scripts/sync-versions.mjs`), which copies
     the new version into
     `dashboard/package.json`, `dashboard/package-lock.json`,
     `example/package-lock.json` (the `node_modules/nestlens` entry),
     `server.json` (the entry's version and the npm package's) and
     `packages/mcp/package.json` (the wrapper's version and its exact `nestlens`
     dependency);
   - commits `package.json`, `package-lock.json`, `CHANGELOG.md`,
     `dashboard/package.json`, `dashboard/package-lock.json`,
     `example/package-lock.json`, `server.json` and `packages/mcp/package.json`
     as `chore(release): <version> [skip ci]`, tags it `v<version>` and pushes;
   - publishes `nestlens` to npm with trusted publishing and creates the GitHub
     release.
3. Reports the version and whether it changed — `released` is false for a
   merge that released nothing, and the jobs below then do not run.

`src/__tests__/release-versions.spec.ts` fails when any of the synced files
falls behind `package.json`.

### After it

None of these can fail the release or skip another's checks. Each that needs
the new versions checks out the tag, because the commit the workflow ran on
still holds the old ones.

| Job | What it does |
| --- | --- |
| `smoke` | Installs the published `nestlens` into an empty project on the Node floor (22.13.0) and on 26, boots NestJS and checks the dashboard, an asset and the API (`scripts/smoke-published-package.mjs`). |
| `mcp-publish` | Publishes `packages/mcp` — the `nestlens-mcp` package — with trusted publishing. A version npm already has is skipped. |
| `mcp-smoke` | Starts what npm serves with `npx -y nestlens-mcp@<version>` from an empty directory on the same two Node versions and speaks MCP to it: `initialize`, `tools/list` (`scripts/smoke-mcp-package.mjs`). |
| `mcp-registry` | Waits for npm to serve `nestlens-mcp` with its `mcpName`, verifies the pinned `mcp-publisher` with cosign, logs in to the official MCP Registry with GitHub OIDC and publishes `server.json`. |

`src/__tests__/mcp/release-workflow.spec.ts` holds the shape of these jobs.

### When a job after the release fails

Open the release's run and use **Re-run failed jobs**. `mcp-publish` skips a
version that is already on npm, so a re-run finishes whatever came after the
failure without publishing anything twice. The registry refuses a version it
already has and a published entry cannot be edited, so a change to
`server.json` reaches the registry with the next release.

To publish the registry entry by hand instead, from a checkout of the tag:

```bash
mcp-publisher validate            # schema and semantic checks, against the registry
mcp-publisher login github        # device flow in a browser, as mogretici
mcp-publisher publish
```

## Credentials

There are none to keep. Both npm packages are published with npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers): npm accepts the
OIDC token of `release.yml` in this repository, and provenance is attached on
its own. The registry accepts the same kind of token and grants it
`io.github.mogretici/*`. The jobs ask for `id-token: write` and nothing else.

## `nestlens-mcp`

`packages/mcp` is the package MCP clients run (`npx -y nestlens-mcp --url …`):
a one-line `bin.js` calling `runNestLensMcpCli` from `nestlens/mcp`, depending
on exactly the `nestlens` released with it and on the MCP SDK, which is only an
optional peer of `nestlens`. `mcpName` in its `package.json` is what the
registry reads from the published manifest to prove `server.json`'s package is
ours. Neither package ships `server.json`.

`nestlens` has no bin of its own. When both declared `nestlens-mcp`, npm linked
the library's in npx's cache and in projects, refused a global install of the
second with EEXIST, and in a project with `nestlens` but no SDK
`npx -y nestlens-mcp` ran the library's bin and failed.

The wrapper has no build, lockfile or suite of its own
(`src/__tests__/mcp/package.spec.ts` holds its contract). CI type-checks the
bin against the source and starts it from tarballs of both packages. The same,
locally, after `npm run build`:

```bash
packed=$(mktemp -d); npm pack --ignore-scripts --pack-destination "$packed"
(cd packages/mcp && npm pack --ignore-scripts --pack-destination "$packed")
v=$(node -p "require('./package.json').version")
node scripts/smoke-mcp-package.mjs --tarball "$packed/nestlens-mcp-$v.tgz" --library-tarball "$packed/nestlens-$v.tgz"
```

### Its first publish, once

npm only lets a package that exists be given a trusted publisher, so the first
version of `nestlens-mcp` is published by a maintainer. Until then
`mcp-publish` fails with a message pointing here.

1. Let the release run. `nestlens` is published, and `mcp-publish` fails
   because `nestlens-mcp` is not on npm.
2. From a checkout of the tag, with `npm login` done and 2FA on the account:

   ```bash
   cd packages/mcp
   npm publish --access public
   ```

3. Give it a trusted publisher (npm 11.15 or later):

   ```bash
   npm trust github nestlens-mcp --file release.yml --repo mogretici/nestlens --allow-publish
   ```

   or on npmjs.com, under the package's Settings → Trusted publishing, with the
   workflow `release.yml` and "npm publish" allowed. Two npm rules apply:
   a configuration made since September 2026 allows only `npm stage publish`
   unless direct publishing is allowed as above, and a new configuration
   expires unless a publish succeeds through it within two days — set it up
   when the next release is close, and recreate it if it expired.
4. Re-run the failed jobs of the release run: `mcp-publish` finds the version
   on npm and skips, and `mcp-smoke` and `mcp-registry` run.

From the next release on, everything above happens on its own.
