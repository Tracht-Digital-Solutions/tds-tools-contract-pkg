# AGENTS.md — tds-tools-contract-pkg

The **tools-platform contract**: the SDK that the public tools site (`tds-tools-frontend`)
and every tool pack (`tds-tool-*`) build against. It is the frontend-only twin of
`tds-frontend-contract-pkg` (`defineExtension` → `defineToolPack`, `composeExtensions` →
`composeToolPacks`, `frontendHost` → `toolHost`).

## Commands

```bash
npm install --no-package-lock   # never npm ci; CI has no lockfile
npm run build                   # tsup → dual ESM+CJS + d.ts (index + astro/index)
npm run dev                     # tsup --watch
npm run type-check
npm run test:run                # vitest
```

## Hard rules

- **Every push to `main` publishes a `@latest` patch** and rebuilds `tds-tools-frontend`.
  The manual "Release" button is for minor/major. A docs-only commit carries `[skip ci]`.
- **Stable at 1.x.** Consumers pin `^1.x`. Ship additive minors; a breaking change needs a major
  and a coordinated migration of every pack and the site.
- Tool `id` and `slug` are globally unique; `composeToolPacks` throws on a collision.
- Stay dependency-free. Never add an `astro` dependency.
- Labels, names and descriptions are German editable copy in the manifest, never inlined in a site page.

## Topic files

| File | Read before |
|---|---|
| [docs/agents/architecture.md](docs/agents/architecture.md) | Changing composition, the virtual modules or the manifest shape |
| [docs/agents/testing.md](docs/agents/testing.md) | Writing or changing tests, or refactoring the registries |
| [docs/agents/release.md](docs/agents/release.md) | Releasing or changing CI |

Workspace rules: `../CLAUDE.md`. Cross-repo state: `../MIGRATION-STATUS.md`.
