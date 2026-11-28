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
3. Reports the version, and whether it was released: the version changed and
   its tag `v<version>` reached the remote. It does so even when step 2
   failed part-way — see below.

`src/__tests__/release-versions.spec.ts` fails when any of the synced files
falls behind `package.json`.

### After it

None of these can fail the release or skip another's checks, and each runs
unless the run was cancelled — also when the `release` job failed after
publishing. Each that needs the new versions checks out the tag, because the
commit the workflow ran on still holds the old ones.

| Job | Runs when | What it does |
| --- | --- | --- |
| `smoke` | the `release` job reported a version | Installs the published `nestlens` into an empty project on the Node floor (22.13.0) and on 26, boots NestJS and checks the dashboard, an asset and the API (`scripts/smoke-published-package.mjs`). |
| `mcp-publish` | a version was released | Waits for npm to serve that `nestlens`, then publishes `packages/mcp` — the `nestlens-mcp` package — with trusted publishing. A version npm already has is skipped. |
| `mcp-smoke` | `mcp-publish` succeeded | Starts what npm serves with `npx -y nestlens-mcp@<version>` from an empty directory on the same two Node versions and speaks MCP to it: `initialize`, `tools/list` (`scripts/smoke-mcp-package.mjs`). |
| `mcp-registry` | `mcp-publish` and `mcp-smoke` succeeded | Waits for npm to serve `nestlens-mcp` with its `mcpName`, verifies the pinned `mcp-publisher` with cosign, logs in to the official MCP Registry with GitHub OIDC and publishes `server.json`. An entry cannot be edited once published, so a wrapper that does not start never gets one. |

`src/__tests__/mcp/release-workflow.spec.ts` holds the shape of these jobs.

### When something fails

**A job after the release** (`smoke`, `mcp-publish`, `mcp-smoke`,
`mcp-registry`): open the run and re-run that job — **Re-run failed jobs**, or
the job's own re-run button. GitHub re-runs the jobs that depend on it, and the
jobs it leaves alone keep their outputs from the first attempt, version
included ([re-running workflows and jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)).
`mcp-publish` skips a version that is already on npm, so nothing is published
twice.

**The `release` job, after it published** — semantic-release pushes the tag,
publishes to npm and only then creates the GitHub release, so a failure there
leaves the library out and the job red. The jobs after it still run for that
version: the version is read after a failed step too, and counts as released
once its tag is on the remote; `mcp-publish` waits for npm to serve the library
first, so a tag whose npm publish failed publishes nothing that pins it. Do
**not** re-run the `release` job itself, or **Re-run failed jobs** while it is
among them: a second semantic-release finds `main` behind the remote, releases
nothing and reports `released=false`, and the jobs after it are skipped. Re-run
the failed jobs after it one by one instead, and create the missing GitHub
release by hand from the tag and the `CHANGELOG.md` section.

The registry refuses a version it already has and a published entry cannot be
edited, so a change to `server.json` reaches the registry with the next release.

To publish the registry entry by hand instead, from a checkout of the tag:

```bash
mcp-publisher validate            # schema and semantic checks, against the registry
mcp-publisher login github        # device flow in a browser, as mogretici
mcp-publisher publish
```

## Credentials

A release needs none. Both npm packages are published with npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers): npm accepts the
OIDC token of `release.yml` in this repository, and provenance is attached on
its own. The registry accepts the same kind of token and grants it
`io.github.mogretici/*`. The jobs ask for `id-token: write` and nothing else.

The one secret the repository keeps is outside the release.
`.github/workflows/context7.yml` asks [Context7](https://context7.com) to
re-read the documentation when `README.md`, `context7.json` or `docs/docs/`
changes on `main`, so an agent that looks NestLens up there gets the current
docs. On its own, Context7 refreshes a public library on a schedule that
follows the library's popularity, not its commits. The workflow
needs a Context7 API key, created once in the
[Context7 dashboard](https://context7.com/dashboard) by a member of the
teamspace that owns `/mogretici/nestlens`:

```bash
gh secret set CONTEXT7_API_KEY -R mogretici/nestlens   # paste the key at the prompt
```

Without the secret the workflow passes with a notice and refreshes nothing.
Actions → **Context7** → *Run workflow* refreshes on demand.

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

npm only gives a trusted publisher to a package that exists, so the first
version of `nestlens-mcp` is published by a maintainer, from a laptop.

**Until then `npx -y nestlens-mcp` fails with a 404.** The release that first
ships the package — and the documentation, which deploys from `main` — already
tell people to run it. Publish it as soon as that release run finishes. This one
version has no provenance attestation; npm adds one only to versions published
through trusted publishing.

1. Merge, and let the release run. `nestlens` is published, and `mcp-publish`
   fails: `nestlens-mcp is not on npm yet`.
2. At once, from a checkout of the tag, with `npm login` done and 2FA on the
   account:

   ```bash
   git checkout v<version>
   cd packages/mcp
   npm publish --access public
   ```

3. Re-run the failed jobs of that release run. `mcp-publish` finds the version
   on npm and skips, then `mcp-smoke` and `mcp-registry` run. Nothing here
   needs trusted publishing yet.
4. Before the **next** release is merged — not earlier than two days before
   it — give the package a trusted publisher (npm 11.15 or later):

   ```bash
   npm trust github nestlens-mcp --file release.yml --repo mogretici/nestlens --allow-publish
   ```

   or on npmjs.com, under the package's Settings → Trusted publishing, with the
   workflow `release.yml` and direct publishing allowed. Two rules from npm's
   [trusted publishers](https://docs.npmjs.com/trusted-publishers) page decide
   the timing and the flag:
   - "A newly created trusted publisher configuration must complete its first
     successful publish within 2 days", or it expires and has to be deleted and
     created again. The first publish through it is the next release's
     `mcp-publish`, so set it up when that release is close.
   - "Configurations created after Sep 03, 2026 are automatically set to allow
     `npm stage publish`", with direct publishing a choice. `mcp-publish` runs
     `npm publish`, so allow it — the CLI asks for at least one of
     `--allow-publish` and `--allow-stage-publish`
     ([npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust)).

   A release merged with no valid configuration fails `mcp-publish` at
   `npm publish`; npm's page names the error "Unable to authenticate"
   (`ENEEDAUTH`). Publish that version by hand as in step 2 and re-run the
   failed jobs, as in step 3.

From then on, everything above happens on its own.
