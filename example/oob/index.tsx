import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { html } from "hono/html";
import { jsxRenderer } from "hono/jsx-renderer";
import { logger } from "hono/logger";
import { stream } from "hono/streaming";

const env = { VERSION: "_" };
function rewriteAssetRequestPath(path: string) {
  return path.replace(`/assets/${env.VERSION}`, "");
}

const www = new Hono();

www.use(
  jsxRenderer(
    ({ children }) => {
      return (
        <html hx-ext="chunked-transfer">
          <head>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <title>Multi-Stream OOB Updates</title>
            <style>{`
              body { font-family: sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
              .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 2rem 0; }
              .card { padding: 1.5rem; border-radius: 8px; background: #f3f4f6; border: 2px solid #e5e7eb; }
              .card h3 { margin: 0 0 0.5rem 0; font-size: 1rem; color: #6b7280; }
              .card .value { font-size: 2rem; font-weight: bold; color: #111827; }
              .card.active { background: #dbeafe; border-color: #3b82f6; }
              .card.success { background: #d1fae5; border-color: #10b981; }
              button { padding: 0.75rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; font-weight: 500; }
              button:hover { background: #2563eb; }
              button.htmx-request { opacity: 0.7; cursor: not-allowed; }
              #status { margin-top: 1rem; padding: 1rem; background: #fef3c7; border-radius: 6px; }
            `}</style>
          </head>
          <body>{children}</body>
          {html`
            <script src="/assets/${env.VERSION}/node_modules/htmx.org/dist/htmx.js"></script>
            <script src="/assets/${env.VERSION}/htmx-ext-chunked-transfer.js"></script>
          `}
        </html>
      );
    },
    { docType: true },
  ),
);

www.get("/", ({ render, req }) => {
  const updateInterval = parseInt(req.query("updateInterval") || "1000");
  const chunkDelay = parseInt(req.query("chunkDelay") || "100");
  return render(
    <main>
      <h1>Multi-Stream OOB Updates</h1>
      <p>
        Click the button to stream updates to multiple parts of the page
        simultaneously. Each card updates independently every second for 3
        seconds.
      </p>

      <button
        hx-get={`/stream-multi?updateInterval=${updateInterval}&chunkDelay=${chunkDelay}`}
        hx-target="#status"
        hx-chunked-mode="swap"
      >
        Start Multi-Stream Updates
      </button>

      <div class="grid">
        <div class="card" id="counter-1">
          <h3>Counter 1</h3>
          <div class="value">0</div>
        </div>
        <div class="card" id="counter-2">
          <h3>Counter 2</h3>
          <div class="value">0</div>
        </div>
        <div class="card" id="counter-3">
          <h3>Counter 3</h3>
          <div class="value">0</div>
        </div>
      </div>

      <div id="status">Ready to stream</div>
    </main>,
  );
});

www.get("/stream-multi", (c) => {
  // Query params to control timing (in milliseconds)
  const updateInterval = parseInt(c.req.query("updateInterval") || "1000");
  const chunkDelay = parseInt(c.req.query("chunkDelay") || "100");

  return stream(c, async (stream) => {
    // Stream updates at specified intervals
    for (let i = 1; i <= 3; i++) {
      // Status update (goes to #status target)
      // + OOB updates to all three counters
      await stream.write(
        `<div>Streaming update ${i}/3...</div>` +
          `<div class="card ${
            i === 3 ? "success" : "active"
          }" id="counter-1" hx-swap-oob="true"><h3>Counter 1</h3><div class="value">${i}</div></div>` +
          `<div class="card ${
            i === 3 ? "success" : "active"
          }" id="counter-2" hx-swap-oob="true"><h3>Counter 2</h3><div class="value">${
            i * 2
          }</div></div>` +
          `<div class="card ${
            i === 3 ? "success" : "active"
          }" id="counter-3" hx-swap-oob="true"><h3>Counter 3</h3><div class="value">${
            i * 3
          }</div></div>`,
      );

      if (i < 3) {
        await new Promise((resolve) => setTimeout(resolve, updateInterval));
      }
    }

    // Small delay to ensure final status is a separate chunk
    await new Promise((resolve) => setTimeout(resolve, chunkDelay));

    // Final status update
    await stream.write(`<div>✓ Streaming complete!</div>`);
  });
});

const hono = new Hono();
hono.use(logger());

const assets = new Hono()
  .get("/htmx-ext-chunked-transfer.js", async () => {
    const {
      outputs: [output],
    } = await Bun.build({
      entrypoints: ["../../index.ts"],
      external: [],
    });
    return new Response(output);
  })
  .use(
    "/node_modules/*",
    serveStatic({
      rewriteRequestPath: rewriteAssetRequestPath,
    }),
  );

hono.route(`/assets/${env.VERSION}`, assets);
hono.route(`/`, www);

export default hono;
