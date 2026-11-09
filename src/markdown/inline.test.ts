import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderBasicMarkdown } from "./inline";

describe("renderBasicMarkdown", () => {
  it("renders code, bold, and italic", () => {
    const html = renderBasicMarkdown("use `foo`, **bold**, and *italic* plus _also_");
    assert.equal(html, "use <code>foo</code>, <strong>bold</strong>, and <em>italic</em> plus <em>also</em>");
  });

  it("escapes HTML in comments", () => {
    const html = renderBasicMarkdown("<script>x</script> **ok**");
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /<strong>ok<\/strong>/);
  });
});
