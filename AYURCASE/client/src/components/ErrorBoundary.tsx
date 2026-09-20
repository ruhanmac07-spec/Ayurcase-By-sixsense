import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-2xl mx-auto my-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-md bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-2 flex-1">
              <h3 className="text-sm font-bold text-charcoal">
                {this.props.fallbackTitle || 'Display Recovery — Safe Clinical Boundary'}
              </h3>
              <p className="text-xs text-charcoal-muted leading-relaxed">
                An unexpected view error occurred while rendering this clinical component. Your clinical data and database persistence on SIXSENSE Server remain completely intact and unaffected.
              </p>
              {this.state.error && (
                <div className="p-2.5 bg-gray-50 rounded border border-gray-200 text-[11px] font-mono text-gray-700 overflow-x-auto max-h-32">
                  {this.state.error.name}: {this.state.error.message}
                </div>
              )}
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reload Workspace</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
