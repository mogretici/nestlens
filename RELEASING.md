# Release Process

## TL;DR - Single Command

```bash
# Bug fix (0.2.1 → 0.2.2)
npm run publish:patch

# New feature (0.2.1 → 0.3.0)
npm run publish:minor

# Breaking change (0.2.1 → 1.0.0)
npm run publish:major
```

**That's it!** A single command handles:
1. Version bump (package.json)
2. CHANGELOG update
3. Dashboard version sync
4. Git commit + tag
5. Git push
6. npm publish

---

## Version Selection

| Situation | Command | Example |
|-----------|---------|---------|
| Bug fix, small correction | `publish:patch` | 0.2.1 → 0.2.2 |
| New feature (backwards compatible) | `publish:minor` | 0.2.1 → 0.3.0 |
| Breaking change | `publish:major` | 0.2.1 → 1.0.0 |

---

## Commit Messages (Optional but Recommended)

Use conventional commits for automatic CHANGELOG generation:

```bash
git commit -m "feat: add GraphQL subscription support"
git commit -m "fix: handle null response in request watcher"
git commit -m "perf: optimize SQLite query performance"
```

| Prefix | CHANGELOG Section |
|--------|------------------|
| `feat:` | Features |
| `fix:` | Bug Fixes |
| `perf:` | Performance |
| `refactor:` | Code Refactoring |
| `docs:` | (hidden) |
| `test:` | (hidden) |
| `chore:` | (hidden) |

---

## Preparation Only (Without Publishing)

If you only want version bump + changelog:

```bash
npm run release:minor   # Prepare only, don't publish
git push --follow-tags  # Manual push
npm publish             # Manual publish
```

---

## What's Automated

- ✅ `package.json` version is updated
- ✅ `dashboard/package.json` version is synced
- ✅ Dashboard version (sidebar) updates automatically on build
- ✅ `CHANGELOG.md` is updated
- ✅ Git commit + tag is created
- ✅ `prepublishOnly` runs build automatically

---

## Common Scenarios

### "I forgot my commits, I want to publish directly"
```bash
npm run publish:patch  # or minor/major
```
Works independently of commit messages.

### "I just want to test locally"
```bash
npm run release:patch  # Version bump only
npm run build          # Build
# Test...
git push --follow-tags && npm publish  # Then publish
```

### "I need to revert the version"
```bash
git reset --hard HEAD~1  # Revert last commit
git tag -d v0.3.0        # Delete tag
```
