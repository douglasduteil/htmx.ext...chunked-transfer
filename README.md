# htmx.ext...chunked-transfer

[![CI][gha-image]][gha-url]
[![NPM version][npm-image]][npm-url]
[![Conventional Commits][conventional-commits-image]][conventional-commits-url]

> Chunked transfer encoding extension for [htmx](https://htmx.org) .

This extension adds Chunked transfer encoding to htmx requests.
\following https://github.com/bigskysoftware/htmx/issues/1911

## Install

```sh
$ npm install htmx.ext...chunked-transfer
```

```html
<script src="https://unpkg.com/htmx.ext...chunked-transfer/dist/index.js"></script>
```

## Usage

```html
<body hx-ext="chunked-transfer">
  ...
</body>
```

### Swap Mode

By default, chunks are appended to the target element. Use `hx-chunked-mode="swap"` to replace the previous chunk with each new one:

```html
<form
  hx-post="/process"
  hx-ext="chunked-transfer"
  hx-chunked-mode="swap">
  <button type="submit">Process</button>
</form>
```

**Append mode (default):** Accumulates all chunks
```
Chunk 1: <p>Loading...</p>
Chunk 2: <p>Loading...</p><p>50%</p>
Chunk 3: <p>Loading...</p><p>50%</p><p>Done!</p>
```

**Swap mode:** Shows only the latest chunk
```
Chunk 1: <p>Loading...</p>
Chunk 2: <p>50%</p>           (replaces previous)
Chunk 3: <p>Done!</p>         (replaces previous)
```

### Comment Filtering

Comment-only chunks (heartbeats) are automatically ignored:

```html
<!-- heartbeat -->              ← Ignored, no DOM update
<p>Content</p>                  ← Processed
<!-- debug --><p>Content</p>    ← Processed (has content)
```

## [Examples](./example/)

- Using [Hono](https://hono.dev/)
- [JSx SSR Suspense](https://hono.dev/guides/jsx#suspense)

[npm-url]: https://npmjs.org/package/htmx.ext...chunked-transfer
[npm-image]: http://img.shields.io/npm/v/htmx.ext...chunked-transfer.svg
[gha-url]: https://github.com/douglasduteil/htmx.ext...chunked-transfer/actions/workflows/ci.yml
[gha-image]: https://github.com/douglasduteil/htmx.ext...chunked-transfer/actions/workflows/ci.yml/badge.svg
[conventional-commits-image]: https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg
[conventional-commits-url]: https://conventionalcommits.org*
