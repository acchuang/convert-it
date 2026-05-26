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
