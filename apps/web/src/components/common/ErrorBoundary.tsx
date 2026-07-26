import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Nieobsłużony błąd UI:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center p-8 text-center">
          <div>
            <h1 className="text-lg font-semibold">Coś poszło nie tak.</h1>
            <p className="mt-2 text-sm text-gray-500">Odśwież stronę lub wróć do dashboardu.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
