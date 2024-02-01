//

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { html } from "hono/html";
import { Child, ErrorBoundary } from "hono/jsx";
import { jsxRenderer } from "hono/jsx-renderer";
import { Suspense, renderToReadableStream } from "hono/jsx/streaming";
import { logger } from "hono/logger";

//

const env = { VERSION: "_" };
function rewriteAssetRequestPath(path: string) {
  return path.replace(`/assets/${env.VERSION}`, "");
}

const Wait_3_Sec = async ({ children }: { children: Child }) => {
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  return <>{children}</>;
};

function date_to_local_string(date: Date) {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

//

const www = new Hono();

www.use(
  jsxRenderer(
    ({ children }) => {
      return (
        <html hx-ext={["debug", "chunked-transfer"].join(", ")}>
          <head>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1"
            />
            <title>htmx ext : Chunked Transfer</title>
          </head>
          <body>
            <h1>htmx ext : Chunked Transfer</h1>
            <blockquote>
              Stream while wait 3 seconds for a timeout to end.
            </blockquote>
            {children}
          </body>
          {html`
            <script
              type="module"
              src="/assets/${env.VERSION}/node_modules/htmx.org/dist/htmx.js"
            ></script>
            <script
              type="module"
              src="/assets/${env.VERSION}/node_modules/htmx.org/dist/ext/debug.js"
            ></script>
            <script
              type="module"
              src="/assets/${env.VERSION}/htmx-ext-chunked-transfer.js"
            ></script>
          `}
        </html>
      );
    },
    { docType: true, stream: true },
  ),
);

www.get("/", ({ render }) => {
  const start = new Date();
  return render(
    <ErrorBoundary fallback={<div>Fallback 0_O</div>}>
      <h2>{date_to_local_string(start)} - Initial stream</h2>

      <Suspense
        fallback={<div>{date_to_local_string(start)} - Loading ...</div>}
      >
        <Wait_3_Sec>
          <p>{date_to_local_string(new Date())} - Hono Lazy Hello</p>
        </Wait_3_Sec>
      </Suspense>

      <h2>{date_to_local_string(start)} - HTMX stream</h2>
      <button class="btn" hx-get="/magic">
        {date_to_local_string(new Date())} - Click to do the hx-get="/magic"
      </button>
    </ErrorBoundary>,
  );
});

www.get("/magic", ({ body }) => {
  const magic = new Date();
  return body(
    renderToReadableStream(
      <div>
        <ErrorBoundary
          fallback={<div>{date_to_local_string(magic)} - Fallback</div>}
        >
          <Suspense
            fallback={<div>{date_to_local_string(magic)} - Loading ... </div>}
          >
            <Wait_3_Sec>
              {date_to_local_string(magic)} - Click to do the hx-get="/magic"
              again
            </Wait_3_Sec>
          </Suspense>
        </ErrorBoundary>
      </div>,
    ),
  );
});

//

const hono = new Hono();
hono.use(logger());

//

const assets = new Hono()
  .get("/htmx-ext-chunked-transfer.js", async () => {
    const {
      outputs: [output],
    } = await Bun.build({
      entrypoints: ["../index.ts"],
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

//

hono.route(`/`, www);

export default hono;
