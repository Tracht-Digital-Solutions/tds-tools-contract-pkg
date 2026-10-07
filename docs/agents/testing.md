# Testing

`npm run test:run` runs vitest. The suite was mutation-tested: 37 deliberate breakages,
37 caught.

| Suite | Covers |
|---|---|
| `src/__tests__/registry.test.ts` | Composition paths: collisions, cycles, order |
| `src/__tests__/astro.test.ts` | The build-time site integration and its two virtual modules |
| `src/__tests__/validation.test.ts` | What a tool author gets wrong |

## `astro.test.ts`

Routing lives in the site (one `/tools/[slug].astro` driven by `getStaticPaths`), so the
integration's whole job is the two virtual modules. Pinned:

- `virtual:tools-components` is keyed by **id**, not slug.
- Composition failures throw while **constructing** the integration.
- `resolveId` ignores ids it doesn't own.
- The components map is generated from the same **sorted** array as the catalog.
- An empty catalog still emits a syntactically valid module.

## `validation.test.ts`

- Price in cents: fractional `4.99` rejected, `0` accepted.
- The fields the catalog card renders.
- Kebab-case id/slug rules and per-tool error attribution.
- Catalog ordering: category, then name, German collation.

## Invariants a plausible refactor breaks silently

- The tool id and slug registries are **separate** sets.
- Both i18n tables are **merged**.
