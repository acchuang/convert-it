# Phase 1: Dev Foundation

## Goal

Establish code quality tooling and safety nets before adding features. No converter logic changes.

## Items

### 1. ESLint + Prettier
- `.eslintrc.json` extending `next/core-web-vitals` and `next/typescript`
- `.prettierrc` with 2-space indent, single quotes, trailing commas, 100 char width, `endOfLine: "lf"`
- `.prettierignore` and `.eslintignore` both ignoring `out/`, `node_modules/`, `.next/`
- `package.json` scripts: `lint` (`next lint`), `format` (`prettier --write .`)
- Fix lint errors only in files that are new or modified in this phase
- File GitHub issues for any pre-existing lint errors found in untouched files

### 2. Type-check Script
- `package.json` script: `typecheck` (`tsc --noEmit`)
- Fix type errors only in files that are new or modified in this phase
- File GitHub issues for any pre-existing type errors found in untouched files

### 3. Vitest Test Suite
- Dev dependencies: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- `vitest.config.ts` with React plugin, resolve alias `@` → `.`, `environment: 'jsdom'`
- `package.json` scripts: `test` (`vitest run`), `test:watch` (`vitest`)
- Test files co-located near the source files they test

**Test coverage this phase:**

| Test file | What it covers |
|-----------|---------------|
| `lib/__tests__/image-converters.test.ts` | `convertImage` with valid/invalid inputs, `blobToCanvas`, supported format round-trips |
| `app/components/__tests__/ErrorBoundary.test.tsx` | Renders children normally, catches thrown error and shows fallback, "Try again" resets state and re-renders children |
| `app/components/__tests__/JobCard.test.tsx` | Renders with job data, shows progress bar when converting, fires download callback |
| `app/components/__tests__/PreviewPanel.test.tsx` | Renders text preview content, renders image preview with blob URL, handles empty/error states |

### 4. Error Boundary
- New `app/components/ErrorBoundary.tsx` — React class component
- Catches unhandled errors via `componentDidCatch`
- State: `{ error: Error | null }`
- Fallback UI: error message with a "Try again" button that calls `this.setState({ error: null })` to trigger React to remount the children
- Wraps main converter content in `app/page.tsx` only. Header/nav/title live in `app/layout.tsx` and are NOT wrapped, so they remain usable during errors

### 5. GitHub Actions CI
- `.github/workflows/ci.yml`
- One job: checkout → `npm ci` → `typecheck` → `lint` → `test` → `build`
- Triggers: push to main, pull_request to main
- Cache `~/.npm` keyed on `package-lock.json` hash (npm's package cache, compatible with `npm ci`)

## Files Changed
```
.eslintrc.json                     (new)
.eslintignore                      (new)
.prettierrc                        (new)
.prettierignore                    (new)
vitest.config.ts                   (new)
.github/workflows/ci.yml           (new)
app/components/ErrorBoundary.tsx   (new)
app/components/__tests__/ErrorBoundary.test.tsx  (new)
lib/__tests__/image-converters.test.ts           (new)
app/components/__tests__/JobCard.test.tsx        (new)
app/components/__tests__/PreviewPanel.test.tsx   (new)
app/page.tsx                       (edit — wrap with ErrorBoundary)
package.json                       (edit — add scripts, devDeps)
```

## Acceptance Criteria
- `npm run typecheck` passes with zero errors in new/modified files
- `npm run lint` passes
- `npm run test` passes (all tests green)
- `npm run build` succeeds
- CI workflow runs all four steps and passes on GitHub
- Throwing an error in the converter area shows the error fallback with a working "Try again" reset, not a white screen
