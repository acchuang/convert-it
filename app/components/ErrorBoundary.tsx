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

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.children !== this.props.children) {
      this.setState({ error: null });
    }
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
            className="px-6 py-2.5 bg-[var(--accent)] text-[var(--accent-text)] text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
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
