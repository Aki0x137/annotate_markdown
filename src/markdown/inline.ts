export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Safe subset: `code`, **bold**, *italic* / _italic_, and line breaks. */
export function renderBasicMarkdown(src: string): string {
  const escaped = escapeHtml(src);
  const parts: string[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(escaped))) {
    if (match.index > last) {
      parts.push(nl(escaped.slice(last, match.index)));
    }
    if (match[1] !== undefined) {
      parts.push(`<code>${match[1]}</code>`);
    } else if (match[2] !== undefined) {
      parts.push(`<strong>${match[2]}</strong>`);
    } else {
      parts.push(`<em>${match[3] ?? match[4]}</em>`);
    }
    last = match.index + match[0].length;
  }
  if (last < escaped.length) {
    parts.push(nl(escaped.slice(last)));
  }
  return parts.join("");
}

function nl(value: string): string {
  return value.replace(/\n/g, "<br>");
}
