# Install

## Windows (start here)

1. Download **[Crew_0.12.9_x64-setup.exe](https://github.com/ArdaDDemir/crew/releases/download/v0.12.9/Crew_0.12.9_x64-setup.exe)** (or the [MSI](https://github.com/ArdaDDemir/crew/releases/download/v0.12.9/Crew_0.12.9_x64_en-US.msi)).
2. The [release page](https://github.com/ArdaDDemir/crew/releases/tag/v0.12.9) also has a portable zip.
3. Install. WebView2 is Windows 11 / current Edge.
4. Launch Crew. Pick a **project folder**. Crew writes `.crew/` in that folder.
5. Settings → Providers → paste an [OpenRouter](https://openrouter.ai) API key (or another OpenAI-compatible base URL).

Portable: **[Crew-0.12.9-windows-portable.zip](https://github.com/ArdaDDemir/crew/releases/download/v0.12.9/Crew-0.12.9-windows-portable.zip)**. Unzip so `Crew.exe`, `crew-server.exe`, and `public/` sit together. Double-click `Crew.exe`.

Chromium for browser tools is **not** inside Crew.exe. If a person uses `browser_*` tools: `bunx playwright install chromium`.

## From source

[Bun](https://bun.sh) 1.4+. Window build also needs [Rust](https://rustup.rs) 1.77+.

```powershell
git clone https://github.com/ArdaDDemir/crew.git
cd crew
bun install
bun test
$env:OPENROUTER_API_KEY="sk-or-..."
bun run crew -- config set key $env:OPENROUTER_API_KEY
bun run ui
```

Office: http://127.0.0.1:7734  
Window: `bun run desktop`  
Installers: `bun run desktop:build`

CLI `crew` is tests and scripts, not a TUI.

## Loopback daemon

`bun run serve` / `crew serve` is the same office on `127.0.0.1`. `--hostname` must be loopback. Guest invites: `Authorization: Bearer` or JSON `token`. Invalid token is HTTP 401. Still not `0.0.0.0`.
