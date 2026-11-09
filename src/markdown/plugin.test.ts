import { describe, it } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";
import { annotatePlugin } from "./plugin";
import { Annotation } from "../store/types";

describe("markdown-it plugin", () => {
  it("wraps anchored text in mark tags via renderer.render when parse has no env", () => {
    const anns: Annotation[] = [
      {
        id: "1",
        type: "highlight",
        color: "yellow",
        createdAt: "",
        updatedAt: "",
        status: "active",
        anchor: { exact: "world", prefix: "Hello ", suffix: "" },
      },
    ];
    const md = annotatePlugin(new MarkdownIt(), (uri) => (uri === "file:///tmp/a.md" ? anns : []));
    // Simulate VS Code's MarkdownItEngine: parse() with currentDocument: undefined, then renderer.render() with currentDocument set
    const tokens = md.parse("Hello world", { currentDocument: undefined });
    const html = md.renderer.render(tokens, md.options, { currentDocument: "file:///tmp/a.md" });
    assert.match(html, /<mark class="ann ann-yellow"/);
    assert.match(html, /data-ann-id="1"/);
    assert.match(html, /data-vscode-context=/);
    assert.match(html, /world<\/mark>/);
    const htmlOther = md.renderer.render(tokens, md.options, { currentDocument: "file:///tmp/b.md" });
    assert.doesNotMatch(htmlOther, /<mark/);
  });

  it("renders comment markdown next to the highlight", () => {
    const anns: Annotation[] = [
      {
        id: "1",
        type: "comment",
        color: "yellow",
        comment: "see `code` and **bold**",
        createdAt: "",
        updatedAt: "",
        status: "active",
        anchor: { exact: "world", prefix: "Hello ", suffix: "" },
      },
    ];
    const md = annotatePlugin(new MarkdownIt(), () => anns);
    const tokens = md.parse("Hello world", {});
    const html = md.renderer.render(tokens, md.options, { currentDocument: "file:///tmp/a.md" });
    assert.match(html, /ann-inline-note/);
    assert.match(html, /<code>code<\/code>/);
    assert.match(html, /<strong>bold<\/strong>/);
  });
});
