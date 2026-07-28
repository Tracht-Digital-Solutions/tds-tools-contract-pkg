import { describe, expect, it } from "vitest";

import { toolHost } from "../astro.js";
import { defineTool, defineToolPack } from "../registry.js";
import type { ToolDef, ToolPackManifest } from "../types.js";

/**
 * The Astro site integration — the build-time half of the tools contract.
 *
 * Routing lives in the SITE (one `/tools/[slug].astro` driven by
 * `getStaticPaths()`), so this integration's whole job is the two virtual
 * modules. The one that must not drift is `virtual:tools-components`: the
 * `[slug]` template looks a tool up **by id** in that map, while the URL is
 * built from the **slug**. Keying the map by slug would still produce a valid
 * module and a site where every tool page renders the wrong tool — or nothing.
 */

const tool = (over: Partial<ToolDef> & Pick<ToolDef, "id">): ToolDef =>
  defineTool({
    slug: over.slug ?? over.id,
    name: over.name ?? over.id,
    description: over.description ?? "Beschreibung",
    category: over.category ?? "content",
    component: over.component ?? `pack/${over.id}.astro`,
    ...over,
  } as ToolDef);

const pack = (over: Partial<ToolPackManifest> & Pick<ToolPackManifest, "id">): ToolPackManifest =>
  defineToolPack({
    name: over.name ?? over.id,
    version: over.version ?? "1.0.0",
    tools: over.tools ?? [tool({ id: over.id })],
    ...over,
  } as ToolPackManifest);

function runSetup(host: ReturnType<typeof toolHost>) {
  const configs: Record<string, unknown>[] = [];
  const logs: string[] = [];
  host.hooks["astro:config:setup"]!({
    updateConfig: (c) => configs.push(c),
    logger: { info: (m) => logs.push(m), warn: () => undefined },
  });
  return { configs, logs };
}

function plugin(configs: Record<string, unknown>[]) {
  const vite = configs[0]!.vite as {
    plugins: Array<{ name: string; resolveId(id: string): string | undefined; load(id: string): string | undefined }>;
  };
  return vite.plugins[0]!;
}

const QR = pack({
  id: "qr",
  tools: [tool({ id: "qr-code", slug: "qr-code-generator", name: "QR-Code", category: "content", component: "qr/QrTool.astro" })],
});

describe("composition failures fail the BUILD", () => {
  it("throws while constructing the integration, before any hook runs", () => {
    const a = pack({ id: "a", tools: [tool({ id: "dup" })] });
    const b = pack({ id: "b", tools: [tool({ id: "dup", slug: "other" })] });
    expect(() => toolHost({ packs: [a, b] })).toThrow(/Conflicting tool id "dup"/);
  });

  it("throws on a slug collision across packs", () => {
    const a = pack({ id: "a", tools: [tool({ id: "one", slug: "same" })] });
    const b = pack({ id: "b", tools: [tool({ id: "two", slug: "same" })] });
    expect(() => toolHost({ packs: [a, b] })).toThrow(/Conflicting tool slug "same"/);
  });

  it("throws on an unsatisfied dependency", () => {
    const dep = pack({ id: "needs", dependsOn: ["missing"] });
    expect(() => toolHost({ packs: [dep] })).toThrow(/depends on "missing"/);
  });

  it("composes an empty pack set without complaint", () => {
    const { logs } = runSetup(toolHost({ packs: [] }));
    expect(logs[0]).toContain("0 pack(s)");
  });
});

describe("the integration", () => {
  it("registers a Vite plugin and nothing else", () => {
    // Routing belongs to the site; injecting routes here would fight the
    // site's own [slug] template.
    const { configs } = runSetup(toolHost({ packs: [QR] }));
    expect(configs).toHaveLength(1);
    expect(Object.keys(configs[0]!)).toEqual(["vite"]);
    expect(plugin(configs).name).toBe("tools-catalog");
  });

  it("names itself so the build log is attributable", () => {
    expect(toolHost({ packs: [QR] }).name).toBe("tools-host");
  });

  it("logs the composed packs and tool count", () => {
    const { logs } = runSetup(toolHost({ packs: [QR] }));
    expect(logs[0]).toContain("1 pack(s) [qr]");
    expect(logs[0]).toContain("1 tool(s)");
  });
});

describe("virtual:tools-catalog", () => {
  const setup = (packs: ToolPackManifest[]) => plugin(runSetup(toolHost({ packs })).configs);

  it("resolves both virtual ids to internal module names", () => {
    const p = setup([QR]);
    expect(p.resolveId("virtual:tools-catalog")).toBe("\0virtual:tools-catalog");
    expect(p.resolveId("virtual:tools-components")).toBe("\0virtual:tools-components");
  });

  it("ignores an id it does not own", () => {
    const p = setup([QR]);
    expect(p.resolveId("virtual:panel-registry")).toBeUndefined();
    expect(p.resolveId("astro:content")).toBeUndefined();
    expect(p.load("\0virtual:panel-registry")).toBeUndefined();
  });

  it("serves the composed catalog as data", () => {
    const p = setup([QR]);
    const code = p.load("\0virtual:tools-catalog")!;
    expect(code).toContain("export const catalog =");
    const json = JSON.parse(code.slice(code.indexOf("{"), code.lastIndexOf("}") + 1));
    expect(json.order).toEqual(["qr"]);
    expect(json.tools).toHaveLength(1);
  });

  it("carries the SLUG the site builds its URLs from", () => {
    // getStaticPaths maps over this; a missing slug means no page at all.
    const p = setup([QR]);
    const code = p.load("\0virtual:tools-catalog")!;
    const json = JSON.parse(code.slice(code.indexOf("{"), code.lastIndexOf("}") + 1));
    expect(json.tools[0].slug).toBe("qr-code-generator");
    expect(json.tools[0].id).toBe("qr-code");
  });

  it("carries the premium metadata the gate reads", () => {
    const premium = pack({
      id: "media",
      tools: [tool({ id: "pdf", slug: "pdf", requiresLogin: true, premium: true, priceCentsDefault: 499 } as Partial<ToolDef> & Pick<ToolDef, "id">)],
    });
    const p = setup([premium]);
    const code = p.load("\0virtual:tools-catalog")!;
    expect(code).toContain('"premium":true');
    expect(code).toContain('"priceCentsDefault":499');
  });
});

describe("virtual:tools-components", () => {
  const setup = (packs: ToolPackManifest[]) => plugin(runSetup(toolHost({ packs })).configs);

  it("statically imports each tool's component", () => {
    // Astro cannot hydrate a component named by a runtime string.
    const p = setup([QR]);
    const code = p.load("\0virtual:tools-components")!;
    expect(code).toContain(`import __C0 from "qr/QrTool.astro";`);
    expect(code).toContain("export const components = {");
  });

  it("keys the map by tool ID, not by slug", () => {
    // The [slug] template resolves the URL to a tool, then looks the COMPONENT
    // up by id. Keying by slug renders the wrong tool (or nothing at all) on
    // every page where the two differ — which is the normal case.
    const p = setup([QR]);
    const code = p.load("\0virtual:tools-components")!;
    expect(code).toContain(`"qr-code": __C0`);
    expect(code).not.toContain(`"qr-code-generator": __C0`);
  });

  it("gives every tool its own import binding", () => {
    const many = pack({
      id: "many",
      tools: [
        tool({ id: "one", component: "x/One.astro" }),
        tool({ id: "two", component: "x/Two.astro" }),
        tool({ id: "three", component: "x/Three.astro" }),
      ],
    });
    const code = setup([many]).load("\0virtual:tools-components")!;
    expect(code).toContain(`import __C0 from`);
    expect(code).toContain(`import __C1 from`);
    expect(code).toContain(`import __C2 from`);
    expect(new Set(code.match(/__C\d+/g)).size).toBe(6 / 2);
  });

  it("maps every tool from every pack", () => {
    const a = pack({ id: "a", tools: [tool({ id: "a-tool" })] });
    const b = pack({ id: "b", tools: [tool({ id: "b-tool" })] });
    const code = setup([a, b]).load("\0virtual:tools-components")!;
    expect(code).toContain(`"a-tool":`);
    expect(code).toContain(`"b-tool":`);
  });

  it("emits a VALID empty module for a site with no tools", () => {
    const code = setup([]).load("\0virtual:tools-components")!;
    expect(code).toContain("export const components = {");
    expect(code).toContain("};");
    expect(code).not.toContain("import __C");
  });

  it("escapes the specifier so a quote cannot break the module", () => {
    const odd = pack({ id: "odd", tools: [tool({ id: "odd", component: 'x/We"ird.astro' })] });
    const code = setup([odd]).load("\0virtual:tools-components")!;
    expect(code).toContain('import __C0 from "x/We\\"ird.astro";');
  });

  it("lines the component map up with the SORTED catalog order", () => {
    // The catalog is sorted (category, then name); the generated map indexes
    // by position, so the two must be generated from the same array.
    const mixed = pack({
      id: "mixed",
      tools: [
        tool({ id: "zulu", name: "Zulu", category: "content", component: "x/Z.astro" }),
        tool({ id: "alpha", name: "Alpha", category: "content", component: "x/A.astro" }),
      ],
    });
    const p = setup([mixed]);
    const catalogCode = p.load("\0virtual:tools-catalog")!;
    const json = JSON.parse(catalogCode.slice(catalogCode.indexOf("{"), catalogCode.lastIndexOf("}") + 1));
    const componentsCode = p.load("\0virtual:tools-components")!;
    // First catalog entry must be bound to the first import.
    expect(json.tools[0].id).toBe("alpha");
    expect(componentsCode).toContain(`import __C0 from "x/A.astro";`);
    expect(componentsCode).toContain(`"alpha": __C0`);
  });
});
