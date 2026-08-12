# Security Policy

NestLens records what an application does — request bodies, query text, exception
stacks, cache keys, mail payloads. A defect in it exposes data the application
never meant to show. Reports are taken seriously and fixed quickly.

## Reporting a vulnerability

Use GitHub's private reporting form:
**[Report a vulnerability](https://github.com/mogretici/nestlens/security/advisories/new)**

It opens a channel visible only to the maintainers, so the details stay out of
public view until a fix is released. Please do not open a public issue, a pull
request or a discussion for a suspected vulnerability.

A useful report contains:

- the NestLens version, and the NestJS and Node versions around it
- the relevant part of your `forRoot()` configuration
- what an attacker can reach, and what they need in order to reach it
- a minimal reproduction if you have one

If you would rather not use GitHub, email **lutfuogretici@gmail.com** with
`NestLens security` in the subject.

### What to expect

| | |
|---|---|
| First reply | within 72 hours |
| Assessment and severity | within 7 days |
| Fix released | as soon as it is ready — a high-severity fix is not batched with other work |
| Credit | your name in the advisory, unless you prefer otherwise |

Fixes ship as a normal release, followed by a published GitHub Security Advisory
so that `npm audit` and Dependabot can see it.

## Supported versions

NestLens is pre-1.0. Fixes land on the **latest released version only** — there
are no backport branches, and an upgrade within `0.x` is the supported path out
of a vulnerability. This changes at `1.0`, where a support window will be
published alongside the version support matrix.

| Version | Supported |
|---|---|
| latest `0.8.x` | ✅ |
| everything older | ❌ upgrade |

## What counts as a vulnerability

NestLens is a debugging tool, and some of what it does looks alarming out of
context. The line runs like this.

**In scope** — anything that lets data escape the boundary the configuration
draws:

- the authorization guard being bypassable (IP whitelisting, `canAccess`,
  role checks, environment gating)
- data that `security.dataMasking` should have redacted being stored or served
  in the clear
- path traversal, injection, or any other way to read something outside the
  dashboard bundle and the entry store
- the dashboard or its API being reachable in an environment where the
  configuration says it should not be

**Out of scope** — working as documented:

- the dashboard showing recorded data to someone who is *authorized* to see it.
  That is the product. Restricting who is authorized is
  [your configuration](https://mogretici.github.io/nestlens/docs/security/access-control)
- NestLens being enabled in production and therefore recording production data.
  It is off in production by default (`allowedEnvironments` is
  `['development', 'local', 'test']`); turning it on is a deliberate act, and
  [the production guide](https://mogretici.github.io/nestlens/docs/security/production-usage)
  covers what to do about it
- vulnerabilities in a peer dependency, unless NestLens is what makes them
  reachable — report those upstream

If you are unsure which side something falls on, report it. Deciding is the
maintainers' job, not the reporter's.

## Published advisories

| Advisory | Severity | Affected | Summary |
|---|---|---|---|
| [GHSA-6j6j-5mp3-j5hf](https://github.com/mogretici/nestlens/security/advisories/GHSA-6j6j-5mp3-j5hf) | High | `< 0.8.13` | Recorded request bodies were never masked |
| [GHSA-2rh2-q3cq-qxxv](https://github.com/mogretici/nestlens/security/advisories/GHSA-2rh2-q3cq-qxxv) | High | `< 0.8.7` | IP whitelist could be bypassed with an `X-Forwarded-For` header |

## Safe harbour

Testing against **your own** installation, in good faith, following this policy,
is welcome and will not be met with a complaint. Do not test against anyone
else's deployment, and do not access, modify or retain data that is not yours.
