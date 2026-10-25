/** Display-only URL tokens: concatenating their text always returns the original message. */
export type MessagePart = { text: string; href?: string };
export function messageParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const pattern = /https?:\/\/[^\s<>"'「」『』【】（）［］｛｝“”‘’。、！？]+/gi;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    let candidate = match[0];
    // Keep balanced URL parentheses, but leave sentence punctuation outside the link.
    for (;;) {
      const previous = candidate;
      candidate = candidate.replace(/[.,!?;:：；]+$/, "");
      for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
        if (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) {
          candidate = candidate.slice(0, -1);
        }
      }
      if (candidate === previous) break;
    }
    let href: string;
    try {
      const url = new URL(candidate);
      if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname) continue;
      href = url.href;
    } catch { continue; }
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: candidate, href });
    cursor = start + candidate.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
