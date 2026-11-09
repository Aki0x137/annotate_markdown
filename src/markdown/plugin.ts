import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { Annotation } from "../store/types";
import { resolveAnchor } from "../anchoring/anchor";

export type AnnotationLookup = (uri?: string) => Annotation[];

type TokenCtor = new (type: string, tag: string, nesting: number) => Token;

export function annotatePlugin(md: MarkdownIt, lookup: AnnotationLookup): MarkdownIt {
  const marked = md as MarkdownIt & { __annotateMd?: boolean };
  if (marked.__annotateMd) {
    return md;
  }
  marked.__annotateMd = true;

  const defaultRender = md.renderer.render.bind(md.renderer);
  md.renderer.render = (tokens, options, env) => {
    try {
      const uri = documentUri(env);
      const annotations = (lookup(uri) ?? []).filter((a) => a.status !== "orphaned" && a.anchor?.exact);
      if (!annotations.length) {
        return defaultRender(tokens, options, env);
      }
      const source = collectSource(tokens);
      const ranges = annotations
        .map((a) => {
          const hit = resolveAnchor(source, a.anchor);
          return hit ? { a, hit } : undefined;
        })
        .filter((x): x is { a: Annotation; hit: { start: number; end: number } } => !!x);
      if (!ranges.length) {
        return defaultRender(tokens, options, env);
      }
      return defaultRender(cloneTokens(tokens, ranges, uri), options, env);
    } catch {
      return defaultRender(tokens, options, env);
    }
  };
  return md;
}

function collectSource(tokens: Token[]): string {
  const parts: string[] = [];
  const walk = (list: Token[]) => {
    for (const token of list) {
      if (token.type === "text" && token.content) {
        parts.push(token.content);
      }
      if (token.children?.length) {
        walk(token.children);
      }
    }
  };
  walk(tokens);
  return parts.join("");
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
    if (token.type === "code_inline" || token.type === "code_block" || token.type === "fence") {
      return token;
    }
    if (!token.children?.length) {
      return token;
    }
    const copy = shallowToken(token);
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
    if (child.type === "code_inline") {
      next.push(child);
      continue;
    }
    if (child.children?.length) {
      const copy = shallowToken(child);
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
    const exact = r.a.anchor.exact;
    if (!exact) {
      continue;
    }
    const idx = remaining.indexOf(exact);
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
    });
    out.push(
      makeToken(
        token,
        "html_inline",
        `<mark class="ann ann-${escapeAttr(r.a.color)}" data-ann-id="${escapeAttr(r.a.id)}" data-ann-type="${escapeAttr(r.a.type)}" data-ann-comment="${escapeAttr(r.a.comment ?? "")}" data-ann-url="${escapeAttr(r.a.url ?? "")}" data-ann-color="${escapeAttr(r.a.color)}" data-vscode-context="${escapeAttr(ctx)}">`
      )
    );
    out.push(makeToken(token, "text", exact));
    out.push(makeToken(token, "html_inline", "</mark>"));
    remaining = remaining.slice(idx + exact.length);
  }
  if (!matched) {
    return [token];
  }
  if (remaining) {
    out.push(makeToken(token, "text", remaining));
  }
  return out;
}

function shallowToken(token: Token): Token {
  const copy = makeToken(token, token.type, token.content);
  copy.tag = token.tag;
  copy.attrs = token.attrs ? token.attrs.map((a) => [...a]) : null;
  copy.map = token.map;
  copy.nesting = token.nesting;
  copy.level = token.level;
  copy.markup = token.markup;
  copy.info = token.info;
  copy.meta = token.meta;
  copy.block = token.block;
  copy.hidden = token.hidden;
  return copy;
}

function makeToken(proto: Token, type: string, content: string): Token {
  const Ctor = proto.constructor as TokenCtor;
  const t = new Ctor(type, "", 0);
  t.content = content;
  t.level = proto.level;
  return t;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/\n/g, " ");
}
