# AGENTS.md — tds-tools-contract-pkg

Authoritative architecture/gotcha doc for this repo. Read before non-trivial changes.

## What this is

The **tools-platform contract**: the SDK the public tools site (`tds-tools-frontend`) and
every tool package (`tds-tool-*`) build against. It is the frontend-only twin of
`tds-frontend-contract-pkg` — modelled directly on it (`defineExtension`→`defineToolPack`,
`composeExtensions`→`composeToolPacks`, `frontendHost`→`toolHost`).

## Architecture

- **Build-time composition, not runtime plugins.** The site imports each pack's
  `ToolPackManifest` and `composeToolPacks` folds them into one `ComposedCatalog`.
  Composition happens during `astro build` (`output:static`, no Node on prod).
- **Frontend-only.** No PHP half (unlike `tds-frontend-contract-pkg`). The dynamic bits
  — admin-controlled catalog (enabled/requires-login/premium/price) and the
  entitlement + Stripe checkout — live in the **`tds-ext-tools-pkg`** frontend
  extension + `tds-core-frontend-api`. A tool declares only *defaults*
  (`requiresLoginDefault`, `premiumDefault`, `priceCentsDefault`); the admin
  catalog overrides them at runtime (merged in the site's `catalog.ts`).
- **Two virtual modules** (`src/astro.ts`): `virtual:tools-catalog` (data) and
  `virtual:tools-components` (generated static imports → `id → Component` map).
  The `[slug]` route template + catalog index live in the **site**, not here, so
  they can use the site's Layout/SEO/ad-slots/premium-gate chrome. `toolHost`
  only registers the Vite plugin.
- **Dependency-free.** `astro.ts` models Astro's integration + Vite plugin shapes
  structurally (`AstroIntegrationLike`, `VitePluginLike`) so the package builds in
  isolation — do not add an `astro` dependency.

## Gotchas / invariants

- **Tool `id` AND `slug` are globally unique across all composed packs.** A
  collision in either is a hard build error (`composeToolPacks` throws) — the
  frontend twin of the Phinx "unique migration class name" rule. Keep them unique.
- **`component` is a package subpath**, resolved via the package `exports`
  (`@…/tds-tool-x/tools/X.astro`), never a local relative path.
- **Stable at 1.x.** Consumers pin `^1.0.0`; ship additive minors, never a
  breaking change in the 1.x line without a major.
- **CI is npm-only** (`_build.yml` has no PHP steps). `npm install
  --no-package-lock`, never `npm ci`. Release bumps `package.json` only (no
  `composer.json` half to keep in lockstep), pushes an **annotated** tag.
- Labels/names/descriptions are **German editable copy** — they live in the
  manifest, never inlined in a site page.

## Commands

```bash
npm install
npm run build        # tsup → dual ESM+CJS + d.ts (index + astro/index)
npm run type-check
npm run test:run     # vitest — composeToolPacks collision/cycle/order coverage
```

Push to `main` auto-releases a patch @latest (+ dispatches a tds-tools-frontend rebuild); the manual "Release" button is for a minor/major bump.

## Tests

```bash
npm run test:run    # vitest, 62 tests
```

- `src/__tests__/registry.test.ts` — the original composition paths.
- `src/__tests__/astro.test.ts` — the build-time site integration, previously
  untested. Routing lives in the SITE (one `/tools/[slug].astro` driven by
  `getStaticPaths`), so the integration's whole job is the two virtual modules —
  and the one that must not drift is `virtual:tools-components`: the template
  resolves a URL to a tool by **slug**, then looks the component up by **id**.
  Keying that map by slug still produces a valid module and a site where every
  page whose id and slug differ (the normal case) renders the wrong tool or
  nothing. Also pinned: composition failures throw while CONSTRUCTING the
  integration, `resolveId` ignores ids it does not own, the components map is
  generated from the same SORTED array as the catalog, and an empty catalog
  still emits a syntactically valid module.
- `src/__tests__/validation.test.ts` — what a tool AUTHOR gets wrong. The price
  is in **cents**, so a fractional `4.99` is rejected (it would round to four
  cents downstream) while a legitimate `0` is accepted. Plus: the fields the
  catalog card renders, kebab id/slug rules, per-tool error attribution, and
  catalog ordering — **category first, then name**, with German collation so
  "Änderung" sorts next to "A" rather than after "Z".

Two invariants worth stating because a plausible refactor breaks them silently:

- **The tool id and slug registries are SEPARATE.** One tool's slug may equal
  another tool's id; a single shared `Set` would reject a valid catalog.
- **Both i18n tables are merged.** An English table that stays empty renders
  raw i18n keys as UI copy on every `/en` page.

Verified by mutation: 37 deliberate breakages introduced, 37 caught.
