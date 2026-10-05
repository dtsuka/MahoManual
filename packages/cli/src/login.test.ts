import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type Browser } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { waitForLoginAndSaveState } from "./login.js";

let server: Server;
let baseUrl: string;
let browser: Browser | undefined;
let workDir: string;

beforeAll(async () => {
  await new Promise<void>((resolveListen) => {
    server = createServer((req, res) => {
      if (req.url === "/login") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": "session=logged-in; Path=/",
        });
        res.end("<!doctype html><title>login</title><p>ok</p>");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><title>top</title>");
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("failed to start test server");
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolveListen();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
});

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "mahomanual-login-"));
});

afterEach(async () => {
  await browser?.close().catch(() => undefined);
  browser = undefined;
  rmSync(workDir, { recursive: true, force: true });
});

function cookieNames(statePath: string): string[] {
  const state = JSON.parse(readFileSync(statePath, "utf8")) as { cookies: Array<{ name: string }> };
  return state.cookies.map((cookie) => cookie.name);
}

describe("waitForLoginAndSaveState", () => {
  it("saves the state when the last page is closed while the browser keeps running", async () => {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const statePath = join(workDir, ".auth", "state.json");

    const waiting = waitForLoginAndSaveState(context, statePath);
    await page.goto(`${baseUrl}/login`);
    // ページ読み込み後に増えたログイン情報も、閉じる時点の保存で取り込まれること
    await context.addCookies([{ name: "late", value: "1", url: baseUrl }]);
    await page.close();

    await expect(waiting).resolves.toBe(true);
    expect(cookieNames(statePath).sort()).toEqual(["late", "session"]);
  }, 8000);

  it("keeps the state saved on navigation when the whole browser is closed", async () => {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const statePath = join(workDir, "state.json");

    const waiting = waitForLoginAndSaveState(context, statePath);
    await page.goto(`${baseUrl}/login`);
    const deadline = Date.now() + 2000;
    while (!existsSync(statePath) && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    await browser.close();

    await expect(waiting).resolves.toBe(true);
    expect(cookieNames(statePath)).toContain("session");
  }, 8000);

  it("reports false when the state file could not be written", async () => {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const notADirectory = join(workDir, "file");
    writeFileSync(notADirectory, "x");
    const statePath = join(notADirectory, "state.json");

    const waiting = waitForLoginAndSaveState(context, statePath);
    await page.goto(`${baseUrl}/login`);
    await page.close();

    await expect(waiting).resolves.toBe(false);
  }, 8000);
});
