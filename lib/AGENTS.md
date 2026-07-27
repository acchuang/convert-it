# convert-it/lib

## Purpose

Core file conversion logic. Shared between frontend and Cloudflare Functions.

## Ownership

Child of `convert-it/`. Must work in both browser and edge runtime.

## Local Contracts

- Imported by both the Next.js app and Cloudflare Functions.
- Must not use Node.js-only APIs.
- Test files in `__tests__/`.

## Work Guidance

- Test: `npx vitest run` (from `convert-it/` root).
