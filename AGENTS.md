# convert-it

## Purpose

File conversion web app. Next.js static export, no backend — every conversion runs in the browser.

## Ownership

Independent Next.js project deployed via Cloudflare Pages.

## Local Contracts

- Next.js v15+, `type: "module"`. App Router, `output: 'export'`.
- No server code. There is no `functions/` directory and no KV binding — keep it that way.
- Core conversion logic in `lib/`.
- i18n support via `locales/`.
- ESLint + Prettier configured. Vitest for tests.

## Work Guidance

- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npx eslint .`
- Format: `npx prettier --check .`
- Test: `npx vitest run`
- Type-check: `npx tsc --noEmit`

## Child DOX Index

| Path | Purpose |
|---|---|
| `lib/` | Core conversion logic and utilities |
