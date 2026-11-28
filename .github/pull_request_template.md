## What and why

<!-- What changes, and the problem it solves. Link the issue: "Fixes #123". -->

## How it was checked

<!-- The tests you added, and anything you ran by hand: the example app, a browser, a Redis. -->

## Checklist

- [ ] `npm run lint` and `npm test` pass; `cd dashboard && npm test` too if the dashboard changed
- [ ] New behaviour has a test that fails without the change
- [ ] The documentation under `docs/docs/` says what the code now does
- [ ] Commit messages are [conventional](https://www.conventionalcommits.org) — `fix:` releases a patch, `feat:` a minor, `docs:` / `test:` / `chore:` nothing
- [ ] No line of a commit body starts with `BREAKING CHANGE`, and no type carries `!` — either releases 1.0.0 ([CONTRIBUTING.md](https://github.com/mogretici/nestlens/blob/main/CONTRIBUTING.md#pull-request-process))
