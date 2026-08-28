const MENTION = /(^|[^A-Za-z0-9_/])@([A-Za-z][A-Za-z0-9-]*)/g;

/** Replace fenced/inline code with spaces so `@` inside them is not a wake. */
export function maskLiteral(text: string): string {
  const chars = [...text];
  const n = chars.length;
  let i = 0;
  while (i < n) {
    if (chars[i] === "`" || chars[i] === "~") {
      const mark = chars[i];
      let len = 0;
      while (i + len < n && chars[i + len] === mark) len++;
      if (mark === "~" && len < 3) {
        i++;
        continue;
      }
      const fence = mark === "`" && len >= 3;
      const inline = mark === "`" && len < 3;
      const tildeFence = mark === "~" && len >= 3;
      if (fence || tildeFence) {
        let j = i + len;
        while (j < n) {
          if (chars[j] === "\n") {
            j++;
            continue;
          }
          let k = 0;
          while (j + k < n && chars[j + k] === mark) k++;
          if (k >= len) {
            const after = j + k;
            const rest = chars.slice(after, after + 1)[0];
            if (after >= n || rest === "\n") {
              wipe(chars, i, after);
              i = after;
              break;
            }
          }
          j++;
        }
        if (j >= n) {
          wipe(chars, i, n);
          i = n;
        }
        continue;
      }
      if (inline) {
        let j = i + len;
        let found = false;
        while (j < n && chars[j] !== "\n") {
          let k = 0;
          while (j + k < n && chars[j + k] === mark) k++;
          if (k === len) {
            wipe(chars, i, j + k);
            i = j + k;
            found = true;
            break;
          }
          if (k > 0) {
            j += k;
            continue;
          }
          j++;
        }
        if (!found) i += len;
        continue;
      }
    }
    i++;
  }
  return chars.join("");
}

function wipe(chars: string[], from: number, to: number): void {
  for (let k = from; k < to; k++) {
    if (chars[k] !== "\n") chars[k] = " ";
  }
}

export function parseMentions(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of maskLiteral(text).matchAll(MENTION)) {
    const slug = match[2].toLowerCase();
    if (seen.has(slug)) continue;
    seen.add(slug);
    ordered.push(slug);
  }
  return ordered;
}
