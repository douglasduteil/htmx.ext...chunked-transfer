import { $ } from "bun";

await Promise.all([
  $`bun build index.ts --outdir dist`,
  $`bun build index.ts --minify --outfile=dist/index.min.js`,
]);
