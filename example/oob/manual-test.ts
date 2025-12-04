import puppeteer from "puppeteer-core";

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!executablePath) {
  throw new Error(
    "PUPPETEER_EXECUTABLE_PATH environment variable is required. " +
      "Set it to your Chrome/Chromium executable path.",
  );
}

const browser = await puppeteer.launch({
  executablePath,
  headless: false, // Show browser
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();

// Enable console logging from the page
page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

await page.goto("http://localhost:3000");

console.log("Clicking button...");
await page.click('button[hx-get="/stream-with-oob"]');

// Wait for first chunk
await page.waitForSelector("#placeholder-1", { timeout: 2000 });

const initialContent = await page.$eval(
  "#placeholder-1",
  (el) => el.textContent,
);
const initialClass = await page.$eval("#placeholder-1", (el) => el.className);

console.log("Initial content:", initialContent);
console.log("Initial class:", initialClass);

// Wait for second chunk
console.log("Waiting 3 seconds for OOB swap...");
await new Promise((resolve) => setTimeout(resolve, 3000));

const finalContent = await page.$eval("#placeholder-1", (el) => el.textContent);
const finalClass = await page.$eval("#placeholder-1", (el) => el.className);

console.log("Final content:", finalContent);
console.log("Final class:", finalClass);

console.log("\nPress Ctrl+C to close browser...");
await new Promise(() => {}); // Keep open
