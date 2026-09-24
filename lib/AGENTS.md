# convert-it/lib

## Purpose

Core file conversion logic: one module per format family, the converter registry (`converters.ts`), the worker pool, and job management.

## Ownership

Child of `convert-it/`. Everything here runs in the browser — on the main thread or inside the conversion Web Workers (`convert.worker.ts` via `worker-pool.ts`). There is no server or edge runtime.

## Local Contracts

- Must not use Node.js-only APIs.
- Anything that runs in the worker pool must not touch the DOM (`document`, `DOMParser`, `Image`). Converters that still need it are listed in `runsOnMainThread` in `worker-pool.ts`.
- Hand-written XML/HTML output goes through `markup.ts`; HTML → text through `html-text.ts` (see root `AGENTS.md`).
- Heavy dependencies and wasm load lazily (`import()` / fetch on first use), never at module top level of a hot path.
- Test files in `__tests__/`, fixtures in `__tests__/fixtures/`.

## Work Guidance

- Test: `npx vitest run` (from `convert-it/` root).
