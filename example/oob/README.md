# hx-swap-oob Issue Reproduction

This example reproduces [Issue #117](https://github.com/douglasduteil/htmx.ext...chunked-transfer/issues/117) - `hx-swap-oob` doesn't work with chunked-transfer extension.

## The Problem

When streaming chunked responses, elements with `hx-swap-oob="true"` are not processed correctly. Instead of replacing the target element out-of-band, the content is appended or ignored.

## Test Case

1. First chunk sends a placeholder: `<p id="placeholder-1">Loading....</p>`
2. After 2 seconds, second chunk sends: `<p id="placeholder-1" hx-swap-oob="true">Real data</p>`

**Expected:** The placeholder is replaced with "Real data"
**Actual:** The placeholder remains, OOB swap is ignored

## Running

### Manual Testing

```bash
bun install
bun run dev
```

Open http://localhost:3000 and click "Start Multi-Stream Updates"

### Automated Testing

Requires a running server and `PUPPETEER_EXECUTABLE_PATH` env var:

```bash
# Terminal 1: Start the server
bun install
bun run start

# Terminal 2: Run tests
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser bun test
```

The test uses puppeteer-core to verify OOB updates in a real browser. Requires Chrome/Chromium installed.

## Expected vs Actual Behavior

### Expected (how htmx SSE extension works)

- Chunk 1: Placeholder appears
- Chunk 2: Placeholder is replaced via OOB swap

### Actual (current chunked-transfer behavior)

- Chunk 1: Placeholder appears
- Chunk 2: OOB swap is ignored, placeholder stays

## Root Cause

The chunked-transfer extension uses low-level swap APIs (`api.swap()` / `api.selectAndSwap()`) that bypass htmx's OOB swap processing. The `hx-swap-oob` attribute is only processed during htmx's standard request/response flow.
