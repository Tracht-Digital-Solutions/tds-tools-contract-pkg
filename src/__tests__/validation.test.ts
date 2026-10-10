import { describe, expect, it } from "vitest";

import { composeToolPacks, defineToolPack, validateTool, validateToolPack } from "../registry.js";
import type { ToolDef, ToolPackManifest } from "../types.js";

/**
 * Validation edges + catalog ordering.
 *
 * `registry.test.ts` covers the main paths. This file covers what a tool
 * AUTHOR gets wrong: a missing description (the catalog card renders blank), a
 * price expressed in euros, a slug that collides inside their own pack. Each of
 * these fails at the pack's own build here rather than deep inside the site
 * build, which is the entire reason `defineTool` validates eagerly.
 */

const raw = (over: Partial<ToolDef>): ToolDef =>
  ({
    id: "qr-code",
    slug: "qr-code",
    name: "QR-Code",
    description: "Beschreibung",
    category: "content",
    component: "pack/Tool.astro",
    ...over,
  }) as ToolDef;

const rawPack = (over: Partial<ToolPackManifest>): ToolPackManifest =>
  ({
    id: "pack",
    name: "Pack",
    version: "1.0.0",
    tools: [raw({})],
    ...over,
  }) as ToolPackManifest;

describe("a tool must be presentable", () => {
  it("requires the fields the catalog card renders", () => {
    const errors = validateTool(raw({ name: "", description: "", category: "" as never }));
    expect(errors).toContain("name is required");
    expect(errors).toContain("description is required");
    expect(errors).toContain("category is required");
  });

  it("requires a component specifier to render at all", () => {
    expect(validateTool(raw({ component: "" }))).toContain("component (import specifier) is required");
  });

  it("reports EVERY problem at once", () => {
    // An author fixing one field per build is a bad loop.
    expect(validateTool(raw({ name: "", description: "", category: "" as never, component: "" })).length).toBeGreaterThan(3);
  });

  it("accepts a valid tool with no optional fields", () => {
    expect(validateTool(raw({}))).toEqual([]);
  });
});

describe("the price is in CENTS", () => {
  it("accepts a free tool that states its price explicitly", () => {
    expect(validateTool(raw({ priceCentsDefault: 0 }))).toEqual([]);
  });

  it("accepts an omitted price", () => {
    expect(validateTool(raw({ priceCentsDefault: undefined }))).toEqual([]);
  });

  it("rejects a negative price", () => {
    expect(validateTool(raw({ priceCentsDefault: -1 })).join(" ")).toContain("non-negative integer");
  });

  it("REJECTS a fractional price — euros in a cents field", () => {
    // `4.99` here would be four cents after rounding somewhere downstream.
    expect(validateTool(raw({ priceCentsDefault: 4.99 })).join(" ")).toContain("non-negative integer");
  });

  it("rejects a price that is not a number at all", () => {
    expect(validateTool(raw({ priceCentsDefault: "499" as unknown as number })).join(" ")).toContain(
      "non-negative integer",
    );
  });
});

describe("ids and slugs", () => {
  it("accepts both layouts and an absent one", () => {
    expect(validateTool(raw({ layout: "wide" }))).toEqual([]);
    expect(validateTool(raw({ layout: "default" }))).toEqual([]);
    expect(validateTool(raw({}))).toEqual([]);
  });

  it("rejects an unknown layout instead of silently ignoring it", () => {
    const errors = validateTool(raw({ layout: "full" as unknown as ToolDef["layout"] }));
    expect(errors.join()).toMatch(/layout/);
  });

  it("accepts kebab ids and slugs with digits", () => {
    expect(validateTool(raw({ id: "pdf-2-word", slug: "pdf-2-word" }))).toEqual([]);
  });

  it("rejects ids or slugs that would break a URL or a lookup", () => {
    for (const bad of ["QR", "qr_code", "qr code", "-qr", "qr-", "qr--code", "1qr", ""]) {
      expect(validateTool(raw({ id: bad })).join(" "), `id ${bad}`).toContain("id must be kebab-case");
      expect(validateTool(raw({ slug: bad })).join(" "), `slug ${bad}`).toContain("slug must be kebab-case");
    }
  });

  it("lets a tool's id and slug differ", () => {
    // The normal case: a short id, a search-friendly URL.
    expect(validateTool(raw({ id: "qr", slug: "qr-code-generator" }))).toEqual([]);
  });

  it("flags a duplicate SLUG within one pack", () => {
    const errors = validateToolPack(
      rawPack({ tools: [raw({ id: "a", slug: "same" }), raw({ id: "b", slug: "same" })] }),
    );
    expect(errors).toContain('duplicate tool slug "same" within pack');
  });

  it("attributes a tool's own errors to that tool", () => {
    const errors = validateToolPack(rawPack({ tools: [raw({ id: "broken", name: "" })] }));
    expect(errors.join(" ")).toContain('tool "broken": name is required');
  });
});

describe("a pack must be releasable", () => {
  it("requires a name and a version", () => {
    const errors = validateToolPack(rawPack({ name: "", version: "" }));
    expect(errors).toContain("name is required");
    expect(errors).toContain("version is required");
  });

  it("rejects a pack with no tools", () => {
    expect(validateToolPack(rawPack({ tools: [] }))).toContain("tools must contain at least one tool");
  });

  it("rejects a pack whose tools are not an array", () => {
    expect(validateToolPack(rawPack({ tools: undefined as unknown as ToolDef[] }))).toContain(
      "tools must contain at least one tool",
    );
  });

  it("names the offending pack when it throws", () => {
    expect(() => defineToolPack(rawPack({ id: "Bad" }))).toThrow(/Invalid tool pack "Bad"/);
  });

  it("returns the manifest unchanged when it is valid", () => {
    const manifest = rawPack({});
    expect(defineToolPack(manifest)).toBe(manifest);
  });
});

describe("catalog ordering", () => {
  const packOf = (id: string, tools: ToolDef[]) => defineToolPack(rawPack({ id, tools }));

  it("groups by CATEGORY FIRST, then sorts by name within it", () => {
    // Deliberately arranged so category-then-name and name-only disagree:
    // by name alone this would be [Alpha, Zebra], which is a flat A–Z list
    // with the category grouping quietly gone.
    // "content" < "media" by category, but "Alpha" < "Zebra" by name — so the
    // two orderings disagree and a name-only sort is visible.
    const p = packOf("p", [
      raw({ id: "a-media", slug: "a-media", name: "Alpha", category: "media" }),
      raw({ id: "z-content", slug: "z-content", name: "Zebra", category: "content" }),
    ]);
    expect(composeToolPacks([p]).tools.map((t) => t.id)).toEqual(["z-content", "a-media"]);
  });

  it("sorts by name WITHIN a category", () => {
    const p = packOf("p", [
      raw({ id: "z-web", slug: "z-web", name: "Zebra", category: "content" }),
      raw({ id: "a-web", slug: "a-web", name: "Anton", category: "content" }),
    ]);
    expect(composeToolPacks([p]).tools.map((t) => t.id)).toEqual(["a-web", "z-web"]);
  });

  it("sorts names with GERMAN collation", () => {
    // "Ä" must sort next to "A", not after "Z" — the site is German.
    const p = packOf("p", [
      raw({ id: "b", slug: "b", name: "Bild", category: "content" }),
      raw({ id: "ae", slug: "ae", name: "Änderung", category: "content" }),
    ]);
    expect(composeToolPacks([p]).tools.map((t) => t.id)).toEqual(["ae", "b"]);
  });

  it("keeps composition order for identical category and name", () => {
    const a = packOf("a", [raw({ id: "one", slug: "one", name: "Same", category: "content" })]);
    const b = packOf("b", [raw({ id: "two", slug: "two", name: "Same", category: "content" })]);
    expect(composeToolPacks([a, b]).tools.map((t) => t.id)).toEqual(["one", "two"]);
    expect(composeToolPacks([b, a]).tools.map((t) => t.id)).toEqual(["two", "one"]);
  });

  it("always returns both i18n tables, even with no i18n at all", () => {
    const catalog = composeToolPacks([packOf("p", [raw({})])]);
    expect(catalog.i18n.de).toEqual({});
    expect(catalog.i18n.en).toEqual({});
  });

  it("merges BOTH languages, not just German", () => {
    // The site is bilingual; an English table that silently stays empty
    // renders raw i18n keys as UI copy on every /en page.
    const a = defineToolPack(rawPack({ id: "a", tools: [raw({ id: "a1", slug: "a1" })], i18n: { de: { "a.k": "A" }, en: { "a.k": "A-en" } } }));
    const b = defineToolPack(rawPack({ id: "b", tools: [raw({ id: "b1", slug: "b1" })], i18n: { de: { "b.k": "B" }, en: { "b.k": "B-en" } } }));
    const catalog = composeToolPacks([a, b]);
    expect(catalog.i18n.de).toEqual({ "a.k": "A", "b.k": "B" });
    expect(catalog.i18n.en).toEqual({ "a.k": "A-en", "b.k": "B-en" });
  });

  it("keeps the id and slug registries SEPARATE", () => {
    // One tool's slug may legitimately equal another tool's id — they are
    // different namespaces. A shared Set would reject this valid catalog.
    const a = defineToolPack(rawPack({ id: "a", tools: [raw({ id: "qr", slug: "qr-code" })] }));
    const b = defineToolPack(rawPack({ id: "b", tools: [raw({ id: "qr-code", slug: "qr-generator" })] }));
    expect(() => composeToolPacks([a, b])).not.toThrow();
    expect(composeToolPacks([a, b]).tools).toHaveLength(2);
  });

  it("keeps independent packs in the order they were passed", () => {
    const a = packOf("a", [raw({ id: "a1", slug: "a1" })]);
    const b = packOf("b", [raw({ id: "b1", slug: "b1" })]);
    const c = packOf("c", [raw({ id: "c1", slug: "c1" })]);
    expect(composeToolPacks([c, a, b]).order).toEqual(["c", "a", "b"]);
  });

  it("rejects a pack that depends on itself", () => {
    const a = defineToolPack(rawPack({ id: "a", dependsOn: ["a"], tools: [raw({})] }));
    expect(() => composeToolPacks([a])).toThrow(/Dependency cycle/);
  });
});
