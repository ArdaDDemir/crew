# Todo: desktop app (low-RAM window)

Status: **shipped** — portable `dist/crew-windows/` plus GitHub Release NSIS/MSI (`Crew.exe` + `crew-server.exe` + `public/`)  
Owner: Arda  
Date: 2026-08-28  
ADR: **0032**  
Spec: `docs/superpowers/specs/2026-08-28-desktop-app-design.md`

## Wanted

A real **Crew.exe** window, not a website tab. Must not be RAM-hungry (no Electron / no bundled Chromium).

## Approach (shipped in code)

1. `bun build --compile` the existing `apps/web` server + `public/` into `crew-server.exe`.
2. Wrap it in **Tauri 2 + WebView2**. Same engine, native window.
3. First launch: pick a project folder (cwd). Last path: `%APPDATA%\Crew\last-project.json`.

```
bun run desktop          # Tauri dev (Bun sidecar source)
bun run desktop:build    # compile sidecar + Crew.exe → dist/crew-windows/; NSIS/MSI if those tools exist
```

Portable folder (double-click): `dist/crew-windows/Crew.exe` next to `crew-server.exe` and `public/`. Last project: `%APPDATA%\Crew\last-project.json`.

Not Electron. Not `crew serve`.

## Still later

macOS/Linux. NSIS/MSI on `desktop:build`. Tray + opt-in update check are in (`ADR-0039`). Signed auto-install still needs a public CDN.
