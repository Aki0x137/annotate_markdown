import type { TextQuoteAnchor } from "../store/types";

const CONTEXT = 32;

export function createAnchor(
  source: string,
  start: number,
  end: number,
  lineHint?: number
): TextQuoteAnchor {
  const exact = source.slice(start, end);
  const prefix = source.slice(Math.max(0, start - CONTEXT), start);
  const suffix = source.slice(end, Math.min(source.length, end + CONTEXT));
  return { exact, prefix, suffix, lineHint };
}

export interface ResolveResult {
  start: number;
  end: number;
  score: number;
}

function lineWindow(source: string, lineHint: number | undefined): { from: number; to: number } {
  if (lineHint === undefined || lineHint < 0) {
    return { from: 0, to: source.length };
  }
  const lines = source.split(/\n/);
  const startLine = Math.max(0, lineHint - 8);
  const endLine = Math.min(lines.length, lineHint + 9);
  let from = 0;
  for (let i = 0; i < startLine; i++) {
    from += lines[i].length + 1;
  }
  let to = from;
  for (let i = startLine; i < endLine; i++) {
    to += lines[i].length + (i < lines.length - 1 ? 1 : 0);
  }
  return { from, to: Math.min(source.length, to) };
}

function scoreMatch(source: string, start: number, exact: string, prefix: string, suffix: string): number {
  const before = source.slice(Math.max(0, start - prefix.length), start);
  const after = source.slice(start + exact.length, start + exact.length + suffix.length);
  let score = 1;
  if (prefix && (before.endsWith(prefix) || (before && prefix.endsWith(before)))) {
    score += 2;
  } else {
    score += overlap(before, prefix) * 0.5;
  }
  if (suffix && (after.startsWith(suffix) || (after && suffix.startsWith(after)))) {
    score += 2;
  } else {
    score += overlap(after, suffix) * 0.5;
  }
  return score;
}

function overlap(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) {
    return 0;
  }
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (a[a.length - n + i] === b[b.length - n + i]) {
      c++;
    }
  }
  return c / n;
}

function findAll(haystack: string, needle: string, from: number, to: number): number[] {
  const hits: number[] = [];
  if (!needle) {
    return hits;
  }
  let idx = haystack.indexOf(needle, from);
  while (idx !== -1 && idx + needle.length <= to) {
    hits.push(idx);
    idx = haystack.indexOf(needle, idx + 1);
  }
  return hits;
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }
  const m = a.length;
  const n = b.length;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) {
    row[j] = j;
  }
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

function fuzzyFind(source: string, exact: string, from: number, to: number): { start: number; score: number } | undefined {
  const slice = source.slice(from, to);
  if (exact.length < 4 || slice.length < exact.length) {
    return undefined;
  }
  const window = exact.length;
  const maxDist = Math.max(1, Math.floor(window * 0.2));
  let best: { start: number; dist: number } | undefined;
  const step = Math.max(1, Math.floor(window / 4));
  for (let i = 0; i <= slice.length - window; i += step) {
    const cand = slice.slice(i, i + window);
    const dist = levenshtein(exact, cand);
    if (!best || dist < best.dist) {
      best = { start: from + i, dist };
    }
  }
  if (!best || best.dist > maxDist) {
    return undefined;
  }
  return { start: best.start, score: 1 - best.dist / window };
}

export function resolveAnchor(source: string, anchor: TextQuoteAnchor): ResolveResult | undefined {
  const win = lineWindow(source, anchor.lineHint);
  const local = findAll(source, anchor.exact, win.from, win.to);
  const global = local.length ? local : findAll(source, anchor.exact, 0, source.length);
  if (global.length) {
    let best = global[0];
    let bestScore = -1;
    for (const hit of global) {
      const s = scoreMatch(source, hit, anchor.exact, anchor.prefix, anchor.suffix);
      if (s > bestScore) {
        bestScore = s;
        best = hit;
      }
    }
    return { start: best, end: best + anchor.exact.length, score: bestScore };
  }
  const fuzzy = fuzzyFind(source, anchor.exact, win.from, win.to) ?? fuzzyFind(source, anchor.exact, 0, source.length);
  if (fuzzy) {
    return { start: fuzzy.start, end: fuzzy.start + anchor.exact.length, score: fuzzy.score };
  }
  return undefined;
}

export function offsetToLine(source: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
    }
  }
  return line;
}
