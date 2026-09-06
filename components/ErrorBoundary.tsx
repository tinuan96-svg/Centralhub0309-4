'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-[#0D1117]">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-8 max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">Something went wrong</h2>
            <p className="text-[#C9D1D9] mb-4">
              An error occurred while rendering this component. Please refresh the page.
            </p>
            {this.state.error && (
              <details className="mb-4">
                <summary className="text-sm text-[#8B949E] cursor-pointer hover:text-white">
                  Error details
                </summary>
                <pre className="mt-2 text-xs text-[#F85149] bg-[#0D1117] p-3 rounded overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
