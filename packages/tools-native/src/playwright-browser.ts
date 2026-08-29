import { mkdirSync } from "node:fs";
import { hardDenyUrl } from "@crew/core";
import type { BrowserDriver } from "./browser";

type PwPage = {
  goto(url: string): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  locator(sel: string): {
    innerText(): Promise<string>;
    click(): Promise<unknown>;
    fill(text: string): Promise<unknown>;
  };
  screenshot(opts: { path: string }): Promise<unknown>;
};

type PwModule = {
  chromium: {
    launchPersistentContext: (
      dir: string,
      opts: { headless: boolean },
    ) => Promise<{
      pages: () => PwPage[];
      newPage: () => Promise<PwPage>;
    }>;
  };
};

export function lazyPlaywrightBrowser(profileDir: string): BrowserDriver {
  let page: PwPage | undefined;
  const ensure = async (): Promise<PwPage> => {
    if (page) return page;
    mkdirSync(profileDir, { recursive: true });
    let pw: PwModule;
    const unavailable = (detail?: string) =>
      new Error(
        `browser unavailable: install Playwright Chromium with bun add playwright && bunx playwright install chromium${detail ? ` (${detail})` : ""}`,
      );
    try {
      pw = (await import("playwright")) as unknown as PwModule;
    } catch (err) {
      throw unavailable(err instanceof Error ? err.message : String(err));
    }
    try {
      const ctx = await pw.chromium.launchPersistentContext(profileDir, { headless: true });
      page = ctx.pages()[0] ?? (await ctx.newPage());
    } catch (err) {
      throw unavailable(err instanceof Error ? err.message : String(err));
    }
    return page;
  };
  return {
    async goto(url: string) {
      if (hardDenyUrl(url)) throw new Error(`denied url: ${url}`);
      const p = await ensure();
      await p.goto(url);
      return { url: p.url(), title: await p.title() };
    },
    async snapshot() {
      const p = await ensure();
      const text = (await p.locator("body").innerText()).slice(0, 8000);
      return `url: ${p.url()}\ntitle: ${await p.title()}\n${text}`;
    },
    async click(ref: string) {
      const p = await ensure();
      await p.locator(ref).click();
      return { url: p.url(), title: await p.title() };
    },
    async type(ref: string, text: string) {
      const p = await ensure();
      await p.locator(ref).fill(text);
      return `typed into ${ref}`;
    },
    async screenshot(filePath: string) {
      const p = await ensure();
      await p.screenshot({ path: filePath });
    },
  };
}
