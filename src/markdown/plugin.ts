import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";
import type { Annotation } from "../store/types";
import { resolveAnchor } from "../anchoring/anchor";

export type AnnotationLookup = (uri?: string) => Annotation[];

export function annotatePlugin(md: MarkdownIt, lookup: AnnotationLookup): MarkdownIt {
  const defaultRender = md.renderer.render.bind(md.renderer);
  md.renderer.render = (tokens, options, env) => {
    const uri = documentUri(env);
    const annotations = lookup(uri).filter((a) => a.status !== "orphaned");
    if (!annotations.length) {
      return defaultRender(tokens, options, env);
    }
    const source = tokens.map((t) => t.content || "").join("\n");
    const ranges = annotations
      .map((a) => {
        const hit = resolveAnchor(source, a.anchor);
        return hit ? { a, hit } : { a, hit: { start: 0, end: a.anchor.exact.length, score: 1 } };
      })
      .filter((x) => !!x.a.anchor.exact);

    const cloned = cloneTokens(tokens, ranges, uri);
    return defaultRender(cloned, options, env);
  };

  md.core.ruler.push("annotate_md", (state: StateCore) => {
    void state;
  });
  return md;
}

function documentUri(
  env: { currentDocument?: { toString?: () => string; fsPath?: string } | string } | undefined
): string | undefined {
  const cur = env?.currentDocument;
  if (!cur) {
    return undefined;
  }
  if (typeof cur === "string") {
    return cur;
  }
  if (typeof cur.toString === "function") {
    return cur.toString();
  }
  return cur.fsPath;
}

function cloneTokens(
  tokens: Token[],
  ranges: { a: Annotation; hit: { start: number; end: number } }[],
  uri: string | undefined
): Token[] {
  return tokens.map((token) => {
    if (!token.children?.length) {
      return token;
    }
    const copy = Object.assign(Object.create(Object.getPrototypeOf(token)), token) as Token;
    copy.children = wrapInline(token.children, ranges, uri);
    return copy;
  });
}

function wrapInline(
  children: Token[],
  ranges: { a: Annotation; hit: { start: number; end: number } }[],
  uri: string | undefined
): Token[] {
  const next: Token[] = [];
  for (const child of children) {
    if (child.children?.length) {
      const copy = Object.assign(Object.create(Object.getPrototypeOf(child)), child) as Token;
      copy.children = wrapInline(child.children, ranges, uri);
      next.push(copy);
      continue;
    }
    if (child.type !== "text" || !child.content) {
      next.push(child);
      continue;
    }
    next.push(...splitText(child, ranges, uri));
  }
  return next;
}

function splitText(
  token: Token,
  ranges: { a: Annotation; hit: { start: number; end: number } }[],
  uri: string | undefined
): Token[] {
  let remaining = token.content;
  const out: Token[] = [];
  let matched = false;
  for (const r of ranges) {
    const idx = remaining.indexOf(r.a.anchor.exact);
    if (idx < 0) {
      continue;
    }
    matched = true;
    if (idx > 0) {
      out.push(makeToken(token, "text", remaining.slice(0, idx)));
    }
    const ctx = JSON.stringify({
      webviewSection: "annotateMdMark",
      id: r.a.id,
      resource: uri ?? "",
      color: r.a.color,
      comment: r.a.comment ?? "",
      url: r.a.url ?? "",
    });
    const open = makeToken(
      token,
      "html_inline",
      `<mark class="ann ann-${escapeAttr(r.a.color)}" data-ann-id="${escapeAttr(r.a.id)}" data-ann-type="${escapeAttr(r.a.type)}" data-ann-comment="${escapeAttr(r.a.comment ?? "")}" data-ann-url="${escapeAttr(r.a.url ?? "")}" data-ann-color="${escapeAttr(r.a.color)}" data-vscode-context="${escapeAttr(ctx)}">`
    );
    out.push(open);
    out.push(makeToken(token, "text", r.a.anchor.exact));
    out.push(makeToken(token, "html_inline", "</mark>"));
    remaining = remaining.slice(idx + r.a.anchor.exact.length);
  }
  if (!matched) {
    return [token];
  }
  if (remaining) {
    out.push(makeToken(token, "text", remaining));
  }
  return out;
}

function makeToken(proto: Token, type: string, content: string): Token {
  const t = Object.assign(Object.create(Object.getPrototypeOf(proto)), proto) as Token;
  t.type = type;
  t.tag = "";
  t.attrs = null;
  t.map = null;
  t.nesting = 0;
  t.level = proto.level;
  t.children = null;
  t.content = content;
  t.markup = "";
  t.info = "";
  t.meta = null;
  t.block = false;
  t.hidden = false;
  return t;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/\n/g, " ");
}
