export function workspaceRelPath(raw, cwd = "") {
  let p = String(raw ?? "").replace(/\\/g, "/").trim();
  if (!p) return "";
  const root = String(cwd ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (root) {
    const low = p.toLowerCase();
    const rootLow = root.toLowerCase();
    if (low === rootLow) return ".";
    if (low.startsWith(`${rootLow}/`)) p = p.slice(root.length + 1);
  }
  p = p.replace(/^[A-Za-z]:\//, "").replace(/^\/+/, "");
  if (!p) return "";
  const parts = p.split("/").filter((s) => s && s !== ".");
  if (!parts.length) return ".";
  if (parts.some((s) => s === ".." || s === ".env" || s === ".ssh")) return "";
  return parts.join("/");
}

export function resolveWorkspaceHint(picked, listedPaths) {
  const p = String(picked ?? "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (!p) return "";
  const listed = (listedPaths ?? []).map((x) => String(x).replace(/\\/g, "/"));
  if (listed.includes(p)) return p;
  const asFile = listed.filter((x) => x === p || x.endsWith(`/${p}`));
  if (asFile.length === 1) return asFile[0];
  const dirs = new Set();
  for (const x of listed) {
    const parts = x.split("/");
    const i = parts.indexOf(p);
    if (i >= 0) dirs.add(parts.slice(0, i + 1).join("/"));
  }
  if (dirs.size === 1) return [...dirs][0];
  return p;
}

export function sanitizeFolderHints(raw, cwd = "") {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split("\n");
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const p = workspaceRelPath(item, cwd);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}
