# Phase 1: Dev Foundation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish code quality tooling and safety nets (ESLint, Prettier, Vitest, ErrorBoundary, CI) before adding features.

**Architecture:** Add config files for lint/format/test tooling, a single React error boundary component wrapping the converter area, and a GitHub Actions workflow that gates on typecheck → lint → test → build. Zero converter logic changes.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind 3.4, ESLint (next/core-web-vitals), Prettier, Vitest, Testing Library, jsdom

---

## Chunk 1: ESLint, Prettier, Type-check

### Task 1.1: Install ESLint + Prettier devDependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install devDependencies**

```bash
npm install --save-dev eslint eslint-config-next eslint-config-prettier prettier
```

- [ ] **Step 2: Verify packages in package.json**

Run: `node -e "const p = require('./package.json'); console.log(p.devDependencies.eslint, p.devDependencies['eslint-config-next'], p.devDependencies.prettier ? 'OK' : 'MISSING')"`
Expected: version numbers printed, "OK"

### Task 1.2: Create Prettier config

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`

- [ ] **Step 1: Write .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

- [ ] **Step 2: Write .prettierignore**

```
out/
node_modules/
.next/
```

- [ ] **Step 3: Verify format command works**

Run: `npx prettier --check .prettierrc`
Expected: exit 0, "All matched files use Prettier code style!"

### Task 1.3: Create ESLint config

**Files:**
- Create: `.eslintrc.json`
- Create: `.eslintignore`

- [ ] **Step 1: Write .eslintrc.json**

```json
{
  "extends": ["next/core-web-vitals", "next/typescript", "prettier"]
}
```

- [ ] **Step 2: Write .eslintignore**

```
out/
node_modules/
.next/
```

### Task 1.4: Add npm scripts for lint/format/typecheck

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add scripts to package.json**

Add these scripts to the `"scripts"` block:

```json
"lint": "next lint",
"format": "prettier --write .",
"typecheck": "tsc --noEmit"
```

Final scripts block looks like:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "format": "prettier --write .",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 2: Verify eslint config is valid**

Run: `npx eslint --print-config .eslintrc.json > /dev/null`
Expected: exit 0, no errors printed

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck 2>&1 | tee /tmp/typecheck-output.txt`
Expected: Fix type errors in new/modified files (`.eslintrc.json`, `.prettierrc`, `vitest.config.ts`, etc.). For pre-existing type errors in untouched files: file GitHub issues via `gh issue create --title "Type error in <file>" --body "tsc reports: <error>" --label "type-error"` for each distinct offending file.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: Fix lint errors in config files (`.eslintrc.json`, `.prettierrc`) if any. For pre-existing lint errors in untouched source files: file GitHub issues via `gh issue create --title "Lint errors in <file>" --body "next lint reports: <error>" --label "lint"` for each distinct offending file.

- [ ] **Step 5: Run format on new config files only**

Run: `npx prettier --write .eslintrc.json .prettierrc`
Expected: Formats the files if needed. No errors.

- [ ] **Step 6: Commit**

```bash
git add .eslintrc.json .eslintignore .prettierrc .prettierignore package.json package-lock.json
git commit -m "chore: add ESLint, Prettier, typecheck scripts"
```

---

## Chunk 2: Vitest Test Suite

### Task 2.1: Install Vitest devDependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Verify all installed**

Run: `node -e "['vitest','@vitejs/plugin-react','@testing-library/react','@testing-library/jest-dom','jsdom'].forEach(n => { try { require.resolve(n); console.log(n, 'OK'); } catch(e) { console.log(n, 'MISSING'); } })"`
Expected: All "OK"

### Task 2.2: Create vitest.config.ts

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

- [ ] **Step 2: Verify config parses**

Run: `npx vitest --config vitest.config.ts --run --reporter=verbose 2>&1 | head -5`
Expected: "No test files found" (config loaded, just no tests yet)

### Task 2.3: Add test scripts to package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add test scripts**

Add to scripts block:

```json
"test": "vitest run",
"test:watch": "vitest"
```

### Task 2.4: Write image-converters tests

**Files:**
- Create: `lib/__tests__/image-converters.test.ts`

- [ ] **Step 1: Read image-converters.ts to understand exports**

Check `lib/image-converters.ts` — exports `convertImage(file, sourceExt, targetExt, settings?)`. Returns `Promise<Blob>`. Uses `loadImage`, `svgToImage`, `rasterizeImage`, and `encodeIcoBlob`.

- [ ] **Step 2: Write test file**

```typescript
import { describe, it, expect } from 'vitest';
import { convertImage } from '@/lib/image-converters';

function createTestBlob(data: Uint8Array, type: string): Blob {
  return new Blob([data], { type });
}

describe('convertImage', () => {
  it('rejects with invalid input (empty file)', async () => {
    const emptyFile = new File([], 'empty.png', { type: 'image/png' });
    await expect(convertImage(emptyFile, 'png', 'jpg')).rejects.toThrow();
  });

  it('converts JPEG to PNG', async () => {
    const blob = await createTestImageBlob('image/jpeg');
    const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });
    const result = await convertImage(file, 'jpg', 'png');
    expect(result.type).toBe('image/png');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts PNG to WebP', async () => {
    const blob = await createTestImageBlob('image/png');
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const result = await convertImage(file, 'png', 'webp');
    expect(result.type).toBe('image/webp');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts PNG to JPEG with quality setting', async () => {
    const blob = await createTestImageBlob('image/png');
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const result = await convertImage(file, 'png', 'jpg', { quality: 0.5 } as any);
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBeGreaterThan(0);
  });

  it('converts PNG to ICO', async () => {
    const blob = await createTestImageBlob('image/png');
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const result = await convertImage(file, 'png', 'ico');
    expect(result.type).toBe('image/x-icon');
    expect(result.size).toBeGreaterThan(0);
  });
});

async function createTestImageBlob(mimeType: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'red';
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = 'blue';
  ctx.fillRect(1, 1, 1, 1);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Canvas toBlob failed'));
    }, mimeType);
  });
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run lib/__tests__/image-converters.test.ts`
Expected: All 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts lib/__tests__/image-converters.test.ts package.json package-lock.json
git commit -m "test: add Vitest config and image-converter unit tests"
```

### Task 2.5: Write ErrorBoundary tests

**Files:**
- Create: `app/components/__tests__/ErrorBoundary.test.tsx`

Note: Write the test first (TDD) — it will fail until we create the ErrorBoundary component in Chunk 3. We create the test file now so both test and component are reviewed together.

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '@/app/components/ErrorBoundary';

function NormalChild() {
  return <div>All good</div>;
}

function ExplodingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test explosion');
  }
  return <div>Safe</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <NormalChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeDefined();
  });

  it('renders fallback when child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ExplodingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
    vi.restoreAllMocks();
  });

  it('resets error state on "Try again" click', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary>
        <ExplodingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();

    const button = screen.getByText('Try again');
    fireEvent.click(button);

    rerender(
      <ErrorBoundary>
        <ExplodingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Safe')).toBeDefined();
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Confirm test fails (component doesn't exist yet)**

Run: `npx vitest run app/components/__tests__/ErrorBoundary.test.tsx`
Expected: FAIL — cannot find module ErrorBoundary

- [ ] **Step 3: Commit test file alone**

```bash
git add app/components/__tests__/ErrorBoundary.test.tsx
git commit -m "test: add ErrorBoundary tests (TDD, will fail until component exists)"
```

### Task 2.6: Write JobCard tests

**Files:**
- Create: `app/components/__tests__/JobCard.test.tsx`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobCard } from '@/app/components/JobCard';
import type { FileJob } from '@/app/components/JobCard';

const t = (key: string) => key;

const idleJob: FileJob = {
  id: '1',
  file: new File(['hello'], 'test.csv', { type: 'text/csv' }),
  sourceExt: 'csv',
  targetExt: 'json',
  status: 'idle',
  progress: 0,
  settings: {
    quality: 0.92,
    jsonIndent: 2,
    csvDelimiter: ',',
    xmlRootElement: 'root',
    audioBitrate: 192,
    videoQuality: 23,
    videoPreset: 'medium',
  },
};

const convertingJob: FileJob = {
  ...idleJob,
  id: '2',
  status: 'converting',
  progress: 45,
};

const doneJob: FileJob = {
  ...idleJob,
  id: '3',
  status: 'done',
  resultBlob: new Blob(['{"a":1}']),
};

describe('JobCard', () => {
  it('renders filename and extension', () => {
    render(
      <JobCard
        job={idleJob}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={t}
      />
    );
    expect(screen.getByText('test.csv')).toBeDefined();
    expect(screen.getByText('.CSV')).toBeDefined();
  });

  it('shows Convert button when idle with target', () => {
    render(
      <JobCard
        job={idleJob}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={t}
      />
    );
    expect(screen.getByText('job.convert')).toBeDefined();
  });

  it('shows progress during conversion', () => {
    render(
      <JobCard
        job={convertingJob}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={t}
      />
    );
    expect(screen.getByText('45%')).toBeDefined();
  });

  it('shows Download button when done', () => {
    render(
      <JobCard
        job={doneJob}
        onTargetChange={vi.fn()}
        onConvert={vi.fn()}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
        t={t}
      />
    );
    expect(screen.getByText('job.download')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run JobCard tests**

Run: `npx vitest run app/components/__tests__/JobCard.test.tsx`
Expected: All 4 tests pass (JobCard already exists, imports should work after vitest config aliases `@`)

- [ ] **Step 3: Commit**

```bash
git add app/components/__tests__/JobCard.test.tsx
git commit -m "test: add JobCard component tests"
```

### Task 2.7: Write PreviewPanel tests

**Files:**
- Create: `app/components/__tests__/PreviewPanel.test.tsx`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewPanel } from '@/app/components/PreviewPanel';

const t = (key: string) => key;

describe('PreviewPanel', () => {
  it('renders text preview content', async () => {
    const blob = new Blob(['{"key": "value"}'], { type: 'application/json' });
    render(
      <PreviewPanel blob={blob} targetExt="json" open={true} onClose={vi.fn()} t={t} />
    );
    const pre = await screen.findByText('{"key": "value"}');
    expect(pre).toBeDefined();
  });

  it('shows loading state initially', () => {
    const blob = new Blob(['test content'], { type: 'text/plain' });
    render(
      <PreviewPanel blob={blob} targetExt="txt" open={true} onClose={vi.fn()} t={t} />
    );
    expect(screen.getByText('job.preview')).toBeDefined();
  });

  it('shows preview unavailable for non-text non-image', async () => {
    const blob = new Blob(['data'], { type: 'application/octet-stream' });
    render(
      <PreviewPanel blob={blob} targetExt="bin" open={true} onClose={vi.fn()} t={t} />
    );
    const msg = await screen.findByText('job.previewUnavailable');
    expect(msg).toBeDefined();
  });

  it('renders image preview with blob URL', async () => {
    const blob = new Blob(['fake-image-data'], { type: 'image/png' });
    render(
      <PreviewPanel blob={blob} targetExt="png" open={true} onClose={vi.fn()} t={t} />
    );
    const img = await screen.findByAltText('job.preview');
    expect(img).toBeDefined();
    expect((img as HTMLImageElement).src).toContain('blob:');
  });

  it('does not render when closed', () => {
    const blob = new Blob(['hidden'], { type: 'text/plain' });
    const { container } = render(
      <PreviewPanel blob={blob} targetExt="txt" open={false} onClose={vi.fn()} t={t} />
    );
    expect(container.querySelector('pre')).toBeNull();
  });
});
```

- [ ] **Step 2: Run PreviewPanel tests**

Run: `npx vitest run app/components/__tests__/PreviewPanel.test.tsx`
Expected: All 5 tests pass (ErrorBoundary tests excluded — component doesn't exist yet)

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All 14 tests pass (5 image-converter + 4 JobCard + 5 PreviewPanel; ErrorBoundary test excluded — component doesn't exist yet). Run: `npx vitest run --exclude '**/ErrorBoundary*'`

- [ ] **Step 4: Commit**

```bash
git add app/components/__tests__/PreviewPanel.test.tsx
git commit -m "test: add PreviewPanel component tests"
```

---

## Chunk 3: Error Boundary + CI

### Task 3.1: Create ErrorBoundary component

**Files:**
- Create: `app/components/ErrorBoundary.tsx`

- [ ] **Step 1: Write ErrorBoundary.tsx**

```typescript
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div
            className="text-5xl mb-4 text-[var(--error)]"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
          >
            !
          </div>
          <p className="text-[var(--text-primary)] mb-2 text-lg">Something went wrong</p>
          <p className="text-[var(--text-muted)] text-sm mb-6" style={{ fontFamily: 'var(--font-mono)' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-6 py-2.5 bg-[var(--accent)] text-[#0A0A0A] text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Verify ErrorBoundary test now passes**

Run: `npx vitest run app/components/__tests__/ErrorBoundary.test.tsx`
Expected: All 3 tests pass

### Task 3.2: Wrap converter content in ErrorBoundary

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add import**

Add at top of imports in `app/page.tsx`:

```typescript
import ErrorBoundary from './components/ErrorBoundary';
```

- [ ] **Step 2: Wrap converter content**

Find this line (after the `</header>` closing tag, ~line 195):

```tsx
      <div className="max-w-5xl mx-auto px-4 py-8">
```

Wrap everything from that `<div>` through the `</footer>` (but NOT the header) in `<ErrorBoundary>`. 

The structure becomes:

```tsx
      </header>

      <ErrorBoundary>
        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* all existing dropzone, jobs, how-it-works, history, footer content */}
          ...
        </div>
      </ErrorBoundary>
    </main>
```

The `<header>` remains outside the boundary so nav/stats/theme/language stay usable during errors.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Zero new type errors in `page.tsx` or `ErrorBoundary.tsx`

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: Pass

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: All 17 tests pass (5 image-converter + 4 JobCard + 5 PreviewPanel + 3 ErrorBoundary)

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: Static export succeeds, `out/` directory created

- [ ] **Step 7: Commit**

```bash
git add app/components/ErrorBoundary.tsx app/page.tsx
git commit -m "feat: add ErrorBoundary wrapping converter content"
```

### Task 3.3: Setup Testing Library jest-dom matchers

**Files:**
- Create: `vitest-setup.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Create vitest-setup.ts**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Update vitest.config.ts test.setupFiles**

In `vitest.config.ts`, change:

```typescript
setupFiles: [],
```

to:

```typescript
setupFiles: ['./vitest-setup.ts'],
```

- [ ] **Step 3: Verify tests still pass**

Run: `npm run test`
Expected: All 17 tests pass (5 image-converter + 4 JobCard + 5 PreviewPanel + 3 ErrorBoundary)

- [ ] **Step 4: Add tsconfig include for test setup**

In `tsconfig.json`, verify `"include"` already covers `**/*.ts` — no change needed (it does).

- [ ] **Step 5: Commit**

```bash
git add vitest-setup.ts vitest.config.ts
git commit -m "chore: add Testing Library jest-dom matchers setup"
```

### Task 3.4: Create GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      - run: npm run typecheck

      - run: npm run lint

      - run: npm run test

      - run: npm run build
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (typecheck, lint, test, build)"
```

### Task 3.5: Final verification

- [ ] **Step 1: Run all checks locally**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: All pass, zero errors. `out/` directory created.

- [ ] **Step 2: Check git status**

Run: `git status`
Expected: Clean working tree, all changes committed.

- [ ] **Step 3: Push and verify CI**

Push to main and check Actions tab at `https://github.com/acchuang/convert-it/actions` — all steps green.
