import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const tauriDir = join(root, "apps", "desktop", "src-tauri");
const releaseDir = join(tauriDir, "target", "release");
const publicSrc = join(root, "apps", "web", "public");
const bun = process.execPath;
const sidecar = join(releaseDir, "crew-server.exe");

function run(cmd: string[], cwd: string) {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} exited ${proc.exitCode}`);
  }
}

mkdirSync(releaseDir, { recursive: true });
console.log("compile crew-server.exe");
run(
  [bun, "build", "--compile", join(root, "apps", "web", "src", "server.ts"), "--outfile", sidecar],
  root,
);
cpSync(publicSrc, join(releaseDir, "public"), { recursive: true });

console.log("tauri build");
const tauriExe = join(root, "apps", "desktop", "node_modules", ".bin", "tauri.exe");
const tauriJs = join(root, "apps", "desktop", "node_modules", "@tauri-apps", "cli", "tauri.js");
function tauriCmd(mode: "all" | "none" | "nsis" | "msi") {
  const flag =
    mode === "all" ? [] : mode === "none" ? ["--no-bundle"] : ["--bundles", mode];
  if (existsSync(tauriExe)) return [tauriExe, "build", ...flag];
  if (existsSync(tauriJs)) return [bun, tauriJs, "build", ...flag];
  return [bun, "x", "@tauri-apps/cli", "build", ...flag];
}
const desktopDir = join(root, "apps", "desktop");
function tryTauri(mode: "all" | "none" | "nsis" | "msi"): boolean {
  try {
    run(tauriCmd(mode), desktopDir);
    return true;
  } catch {
    return false;
  }
}
if (!tryTauri("all")) {
  console.log("combined NSIS+MSI bundle failed; trying each installer, then portable");
  const nsisOk = tryTauri("nsis");
  if (!nsisOk) console.log("NSIS bundle failed (install NSIS for the .exe installer)");
  const msiOk = tryTauri("msi");
  if (!msiOk) console.log("MSI bundle failed (install WiX for the .msi)");
  if (!nsisOk && !msiOk && !tryTauri("none")) throw new Error("tauri portable build failed");
}

const built = ["Crew.exe", "crew-desktop.exe"]
  .map((name) => join(releaseDir, name))
  .find((p) => existsSync(p));
if (!built) throw new Error("Crew.exe missing after tauri build");

const dist = join(root, "dist", "crew-windows");
mkdirSync(dist, { recursive: true });
cpSync(built, join(dist, "Crew.exe"));
if (existsSync(sidecar)) cpSync(sidecar, join(dist, "crew-server.exe"));
cpSync(publicSrc, join(dist, "public"), { recursive: true });
console.log(`portable folder  ${dist}`);
const nsisDir = join(tauriDir, "target", "release", "bundle", "nsis");
if (existsSync(nsisDir)) {
  const out = join(root, "dist", "crew-windows-nsis");
  mkdirSync(out, { recursive: true });
  cpSync(nsisDir, out, { recursive: true });
  console.log(`NSIS installer  ${out}`);
}
const msiDir = join(tauriDir, "target", "release", "bundle", "msi");
if (existsSync(msiDir)) {
  const out = join(root, "dist", "crew-windows-msi");
  mkdirSync(out, { recursive: true });
  cpSync(msiDir, out, { recursive: true });
  console.log(`MSI installer   ${out}`);
}
