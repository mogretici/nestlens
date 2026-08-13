---
sidebar_position: 5
---

# Versioning and support

What NestLens promises about changing, and for how long.

## What a version number means

NestLens follows [semantic versioning](https://semver.org). From `1.0` onward:

- **Major** (`1.0` → `2.0`) — something documented behaves differently, or is
  gone. Read the upgrade notes before taking it.
- **Minor** (`1.0` → `1.1`) — new watchers, new configuration, new dashboard
  features. Safe to take.
- **Patch** (`1.0` → `1.0.1`) — a fix. Safe to take.

Releases are published by CI from `main`, and every one of them is installed
into an empty project and booted before it is considered done — the same check
that runs locally as `npm run test:smoke`.

## The API that is frozen

Only what the package publishes is covered:

```ts
import { NestLensModule /* … */ } from 'nestlens';
import { SqliteStorage } from 'nestlens/storage/sqlite';
import { RedisStorage } from 'nestlens/storage/redis';
```

Anything reachable only by writing a path into the build output is not part of
the API and never was. The `exports` map makes that mechanical rather than a
matter of trust: `require('nestlens/dist/…')` fails with
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

Also covered: the shape of `NestLensConfig`, the `Entry` types, the
`StorageInterface` contract, and the HTTP routes the dashboard is served on.
Not covered: the dashboard's internal components, the exact HTML it renders, and
the wording of log messages.

## Supported NestJS and Node versions

Every release is tested against this matrix in CI, on both the Express and
Fastify adapters:

| | Node 20 | Node 22 | Node 24 |
| --- | --- | --- | --- |
| **NestJS 9** | ✅ | ✅ | ✅ |
| **NestJS 10** | ✅ | ✅ | ✅ |
| **NestJS 11** | ✅ | ✅ | ✅ |

`engines` asks for Node 20 or newer, and a contract test fails the build if the
floor of that matrix and the floor in `engines` ever disagree — a version cannot
be claimed without being run.

### How long a version stays supported

- **Node** — a Node release leaves the matrix when it reaches end-of-life, in
  the first NestLens minor after that date. Node 18 left this way.
- **NestJS** — a NestJS major leaves the matrix when NestLens can no longer
  support it without compromising the others, and never in a patch release.

Dropping either is a minor release before `1.0` and a **major** release after
it: `engines` narrowing is a breaking change for whoever it excludes.

## Watcher maturity

Watchers differ in what they depend on, so they differ in what can be promised.

### Stable — under the 1.0 guarantee

`request` · `query` · `exception` · `log` · `graphql`

These read from NestJS itself or from interfaces that have been stable for
years. Their entry shapes and configuration will not change without a major
release.

### Opt-in — depends on a third-party library

`cache` · `redis` · `model` · `mail` · `job` · `event` · `schedule` ·
`httpClient` · `notification` · `view` · `command` · `gate` · `batch` · `dump`

These attach to a library NestLens does not control, by wrapping methods that
library exposes. When that library changes its shape in a major release, the
watcher can stop collecting until NestLens catches up.

**What that means in practice:** a watcher in this list breaking after an
upstream major is fixed in a patch release, not treated as a violation of the
1.0 promise. The application keeps running either way — a watcher that cannot
attach logs why and stays out of the way.

Every watcher is enabled by configuration, so none of them is a surprise.

## Removing something after 1.0

An API is never removed without warning:

1. **Deprecated in a minor release.** The documentation says what to use
   instead, and the type carries a `@deprecated` note that shows in an editor.
   The old path keeps working exactly as before.
2. **It stays for at least two minor releases** after that, so an application
   upgrading one minor at a time always meets the warning before the removal.
3. **Removed in the next major**, with a line in the upgrade guide naming the
   replacement.

A deprecation never changes behaviour. If something must behave differently, it
gets a new name and the old one is deprecated — no configuration key quietly
means something else than it did last week.

Security is the one exception. A vulnerability that cannot be fixed
compatibly is fixed anyway, in a patch, with an advisory explaining what
changed and why. See [the security policy](https://github.com/mogretici/nestlens/security/policy).

## Reporting

- Bugs and feature requests: [GitHub issues](https://github.com/mogretici/nestlens/issues)
- Vulnerabilities: [private reporting](https://github.com/mogretici/nestlens/security/advisories/new),
  never a public issue
