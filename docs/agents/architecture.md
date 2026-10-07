# Architecture

## Build-time composition, not runtime plugins

The site imports each pack's `ToolPackManifest`, and `composeToolPacks` folds them into
one `ComposedCatalog`. Composition happens during the site's `astro build`.

## Frontend-only

There is no PHP half (unlike `tds-frontend-contract-pkg`). The dynamic parts live
elsewhere:

- The admin-controlled catalog (enabled, requires-login, premium, price) and the
  entitlement + Stripe checkout live in the **`tds-ext-tools-pkg`** frontend extension
  and `tds-core-frontend-api`.
- A tool declares only **defaults**: `requiresLoginDefault`, `premiumDefault`,
  `priceCentsDefault`. The admin catalog overrides them at runtime (merged in the site's
  `catalog.ts`).

## Two virtual modules (`src/astro.ts`)

- `virtual:tools-catalog` — the data.
- `virtual:tools-components` — generated static imports, an `id → Component` map.

The `[slug]` route template and the catalog index live in the **site**, so they can use
the site's layout, SEO, ad slots and premium gate. `toolHost` only registers the Vite
plugin.

The template resolves a URL to a tool by **slug**, then looks up the component by **id**.
Keying the components map by slug still produces a valid module, but every page whose id
and slug differ (the normal case) renders the wrong tool or nothing.

## Dependency-free

`astro.ts` models Astro's integration and Vite plugin shapes structurally
(`AstroIntegrationLike`, `VitePluginLike`), so the package builds in isolation. Don't
add an `astro` dependency.

## Manifest invariants

- **Tool `id` and `slug` are globally unique across all composed packs.** A collision in
  either throws in `composeToolPacks` and fails the build. This is the frontend twin of
  the Phinx "unique migration class name" rule.
- **The id and slug registries are separate.** One tool's slug may equal another tool's
  id; a single shared `Set` would reject a valid catalog.
- **`component` is a package subpath** resolved via the package `exports`
  (`@…/tds-tool-x/tools/X.astro`), never a local relative path.
- **Prices are in cents.** A fractional `4.99` is rejected (it would round to four cents
  downstream); `0` is valid.
- **Both i18n tables are merged.** An English table left empty renders raw i18n keys as
  UI copy on every `/en` page.
- Catalog order: **category first, then name**, with German collation so "Änderung" sorts
  next to "A", not after "Z".
- Labels, names and descriptions are **German editable copy**. They live in the
  manifest, never inlined in a site page.
