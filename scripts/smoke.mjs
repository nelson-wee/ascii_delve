/**
 * The smoke test (docs/roadmap.md, Section 3). Node only.
 *
 *   npm run smoke
 *
 * It builds the game, serves the build, and plays one short session in a
 * headless Chromium: the base, a deployment, a level, the level-over screen,
 * one level deeper, the return to base, a slot of the loadout, auto-equip,
 * and a reload that must keep the roster. It fails on a missing screen, a
 * missing button, or any error in the page.
 *
 * `CHROMIUM_PATH` names a Chromium to use. Without it, Playwright uses its own
 * (`npx playwright-core install chromium`).
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

const PORT = Number(process.env.SMOKE_PORT ?? 4179);
const URL = `http://localhost:${PORT}/#seed=42`;

/** Start `vite preview` and wait until it answers. */
async function startServer() {
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`);
      if (response.ok) return server;
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  server.kill();
  throw new Error(`vite preview did not answer on port ${PORT}`);
}

function step(text) {
  console.log(`  ✓ ${text}`);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const skip = page.locator("#controls button", { hasText: "Skip" });

    await page.goto(URL);
    await page.getByRole("heading", { name: "ASCII Delve · Base" }).waitFor();
    step("the base opens");

    await page.getByRole("button", { name: "Deploy" }).click();
    await page.locator("#status", { hasText: "depth 1" }).waitFor();
    step("a deployment starts depth 1");

    await skip.click();
    await page.getByRole("heading", { name: /Depth 1|wiped at depth 1/ }).waitFor();
    step("the level ends and the level-over screen opens");

    const deeper = page.getByRole("button", { name: "Push deeper" });
    if ((await deeper.count()) > 0) {
      await deeper.click();
      await page.locator("#status", { hasText: "depth 2" }).waitFor();
      await skip.click();
      await page.getByRole("heading", { name: /Depth 2|wiped at depth 2/ }).waitFor();
      step("the squad pushes deeper to depth 2");
    }

    await page.getByRole("button", { name: "Return to base" }).click();
    await page.getByRole("heading", { name: /The last delve/ }).waitFor();
    step("the squad returns to base, and the base reports the delve");

    const slot = page.locator(".marine").first().locator(".slot").first();
    await slot.click();
    await page.locator(".picker").waitFor();
    await page.getByRole("button", { name: "Close" }).click();
    step("a slot opens its choices and closes");

    await page.getByRole("button", { name: "Auto-equip the best items" }).click();
    const before = await page.locator(".base-hub").innerText();
    await page.reload();
    await page.getByRole("heading", { name: "ASCII Delve · Base" }).waitFor();
    const after = await page.locator(".base-hub").innerText();
    if (before !== after) throw new Error("the base after a reload is not the base before it");
    step("a reload keeps the roster");

    if (errors.length > 0) throw new Error(`errors in the page:\n${errors.join("\n")}`);
    step("no errors in the page");
  } finally {
    await browser.close();
    server.kill();
  }
}

main().then(
  () => console.log("smoke: pass"),
  (error) => {
    console.error(`smoke: FAIL\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
