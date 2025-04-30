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

const Wait_X_Sec = async ({
  children,
  seconds = 0,
}: {
  children: Child;
  seconds?: number;
}) => {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1_000));
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
            <title>htmx ext : Chunked Transfer using htmx.org@2</title>
          </head>
          <body>
            <h1>htmx ext : Chunked Transfer using htmx.org@2</h1>
            <blockquote>
              Stream while wait 3 seconds for a timeout to end.
            </blockquote>
            {children}
          </body>
          {html`
            <script src="/assets/${env.VERSION}/node_modules/htmx.org/dist/htmx.js"></script>
            <script src="/assets/${env.VERSION}/node_modules/htmx-ext-debug/debug.js"></script>
            <script src="/assets/${env.VERSION}/htmx-ext-chunked-transfer.js"></script>
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
        fallback={<p>{date_to_local_string(start)} - Loading 0 seconds...</p>}
      >
        <Wait_X_Sec>
          <p>{date_to_local_string(new Date())} -Hono Lazy Hello</p>
        </Wait_X_Sec>
      </Suspense>
      <Suspense
        fallback={<p>{date_to_local_string(start)} - Loading 1 seconds...</p>}
      >
        <Wait_X_Sec seconds={1}>
          <p>{date_to_local_string(new Date())} - Loaded after 1 second</p>
        </Wait_X_Sec>
      </Suspense>
      <Suspense
        fallback={<p>{date_to_local_string(start)} - Loading 2 seconds...</p>}
      >
        <Wait_X_Sec seconds={2}>
          <p>{date_to_local_string(new Date())} - Loaded after 2 second</p>
        </Wait_X_Sec>
      </Suspense>
      <Suspense
        fallback={<p>{date_to_local_string(start)} - Loading 3 seconds...</p>}
      >
        <Wait_X_Sec seconds={3}>
          <p>{date_to_local_string(new Date())} - Loaded after 3 second</p>
        </Wait_X_Sec>
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
            <Wait_X_Sec>
              {date_to_local_string(magic)} - Click to do the hx-get="/magic"
              again
            </Wait_X_Sec>
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

//

hono.route(`/`, www);

export default hono;
