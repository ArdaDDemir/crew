import { dirname, join } from "node:path";

export type ServerArgv = {
  cwd?: string;
  port?: number;
  publicDir?: string;
  hostname?: string;
};

export function parseServerArgv(argv: string[]): ServerArgv {
  const out: ServerArgv = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (!flag.startsWith("-")) continue;
    const take = (): string => {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) throw new Error(`missing value for ${flag}`);
      i += 1;
      return next;
    };
    if (flag === "--cwd") out.cwd = take();
    else if (flag === "--port") {
      const raw = take();
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error(`invalid --port: ${raw}`);
      out.port = n;
    } else if (flag === "--public") out.publicDir = take();
    else if (flag === "--hostname") {
      const host = take();
      if (host !== "127.0.0.1" && host !== "localhost") {
        throw new Error("hostname must be 127.0.0.1");
      }
      out.hostname = host === "localhost" ? "127.0.0.1" : host;
    } else throw new Error(`unknown flag: ${flag}`);
  }
  return out;
}

export function flagsFromArgv(argv: string[]): string[] {
  const second = argv[1] ?? "";
  if (/\.(ts|js|mts|cts)$/i.test(second)) return argv.slice(2);
  return argv.slice(1);
}

export function resolvePublicDir(opts: {
  flag?: string;
  execPath: string;
  importMetaDir: string;
}): string {
  if (opts.flag) return opts.flag;
  if (opts.importMetaDir.includes("$bunfs")) return join(dirname(opts.execPath), "public");
  return join(opts.importMetaDir, "..", "public");
}
