import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAnchor, resolveAnchor } from "./anchor";

describe("anchoring", () => {
  const source = "Hello world.\nThis is a test of markdown annotations.\nGoodbye.";

  it("creates and resolves an exact match", () => {
    const start = source.indexOf("markdown annotations");
    const end = start + "markdown annotations".length;
    const anchor = createAnchor(source, start, end, 1);
    const hit = resolveAnchor(source, anchor);
    assert.ok(hit);
    assert.equal(source.slice(hit.start, hit.end), "markdown annotations");
  });

  it("prefers the match with matching prefix/suffix", () => {
    const src = "foo bar foo";
    const start = src.lastIndexOf("foo");
    const anchor = createAnchor(src, start, start + 3);
    const hit = resolveAnchor(src, anchor);
    assert.ok(hit);
    assert.equal(hit.start, start);
  });

  it("marks missing text as unresolved", () => {
    const anchor = createAnchor(source, 0, 5);
    const hit = resolveAnchor("completely different document", anchor);
    assert.equal(hit, undefined);
  });

  it("fuzzy-matches small edits", () => {
    const start = source.indexOf("markdown annotations");
    const anchor = createAnchor(source, start, start + "markdown annotations".length, 1);
    const edited = source.replace("markdown annotations", "markdown annotatons");
    const hit = resolveAnchor(edited, { ...anchor, exact: "markdown annotations" });
    assert.ok(hit);
  });
});
