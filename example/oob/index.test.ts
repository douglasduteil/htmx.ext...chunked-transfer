import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

describe("Multi-stream OOB updates with chunked-transfer", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!executablePath) {
      throw new Error(
        "PUPPETEER_EXECUTABLE_PATH environment variable is required. " +
          "Set it to your Chrome/Chromium executable path.",
      );
    }

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser?.close();
  });

  test("streams updates to multiple counters via OOB", async () => {
    // Navigate with fast timing query parameters (150ms intervals for better test timing)
    await page.goto("http://localhost:3000?updateInterval=150&chunkDelay=50");

    // Verify initial state
    const counter1Before = await page.$eval(
      "#counter-1 .value",
      (el) => el.textContent,
    );
    const counter2Before = await page.$eval(
      "#counter-2 .value",
      (el) => el.textContent,
    );
    const counter3Before = await page.$eval(
      "#counter-3 .value",
      (el) => el.textContent,
    );

    expect(counter1Before).toBe("0");
    expect(counter2Before).toBe("0");
    expect(counter3Before).toBe("0");

    // Click button to start streaming (button already has fast timing params)
    await page.click('button[hx-get*="/stream-multi"]');

    // Wait for first update (sent at t=0, htmx processing ~50ms)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify first update
    const counter1After1 = await page.$eval(
      "#counter-1 .value",
      (el) => el.textContent,
    );
    const counter2After1 = await page.$eval(
      "#counter-2 .value",
      (el) => el.textContent,
    );
    const counter3After1 = await page.$eval(
      "#counter-3 .value",
      (el) => el.textContent,
    );

    console.log(
      "After 1st update:",
      counter1After1,
      counter2After1,
      counter3After1,
    );

    expect(counter1After1).toBe("1");
    expect(counter2After1).toBe("2");
    expect(counter3After1).toBe("3");

    // Wait for stream to complete (2 delays of 150ms + final + buffer)
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Verify final state
    const counter1Final = await page.$eval(
      "#counter-1 .value",
      (el) => el.textContent,
    );
    const counter2Final = await page.$eval(
      "#counter-2 .value",
      (el) => el.textContent,
    );
    const counter3Final = await page.$eval(
      "#counter-3 .value",
      (el) => el.textContent,
    );
    const statusFinal = await page.$eval(
      "#status",
      (el) => el.textContent?.trim(),
    );

    console.log("Final counters:", counter1Final, counter2Final, counter3Final);
    console.log("Final status:", statusFinal);

    expect(counter1Final).toBe("3");
    expect(counter2Final).toBe("6");
    expect(counter3Final).toBe("9");
    expect(statusFinal).toBe("✓ Streaming complete!");

    // Verify success styling
    const counter1Class = await page.$eval("#counter-1", (el) => el.className);
    expect(counter1Class).toContain("success");
  }, 10000);

  test("status updates correctly via target swap", async () => {
    // Navigate with fast timing query parameters (150ms intervals for better test timing)
    await page.goto("http://localhost:3000?updateInterval=150&chunkDelay=50");

    const statusBefore = await page.$eval(
      "#status",
      (el) => el.textContent?.trim(),
    );
    expect(statusBefore).toBe("Ready to stream");

    // Click button to start streaming (button already has fast timing params)
    await page.click('button[hx-get*="/stream-multi"]');

    // Wait for first status update (sent at t=0)
    await new Promise((resolve) => setTimeout(resolve, 100));

    const statusDuring = await page.$eval(
      "#status",
      (el) => el.textContent?.trim(),
    );
    expect(statusDuring).toContain("Streaming update");

    // Wait for completion (2 delays of 150ms + final + buffer)
    await new Promise((resolve) => setTimeout(resolve, 400));

    const statusAfter = await page.$eval(
      "#status",
      (el) => el.textContent?.trim(),
    );
    expect(statusAfter).toBe("✓ Streaming complete!");
  }, 10000);
});
