# Release and CI

- **CI is npm-only.** `_build.yml` has no PHP steps. Use `npm install --no-package-lock`,
  never `npm ci`.
- **Every push to `main` publishes a `@latest` patch** and dispatches a
  `tds-tools-frontend` **deploy** (its `release.yml`). The bump commit carries `[skip ci]`, so it doesn't loop.
- The manual "Release" button is for a minor or major bump.
- A release bumps `package.json` only (no `composer.json` half to keep in lockstep) and
  pushes an **annotated** tag.
- Don't bump the version by hand and don't dispatch a second release after a push.
- Use `[skip ci]` for a commit that must not publish (for example docs only).

## Stability

Stable at 1.x. Consumers (the site and every `tds-tool-*` pack) pin `^1.x`. Ship
additive minors only. A breaking change requires a major and a coordinated update of
every consumer.
