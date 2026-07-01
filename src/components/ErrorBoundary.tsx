import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
    // In a real app, log to Sentry/Datadog here.
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 bg-brand-primary">
          <div className="max-w-md w-full bg-brand-secondary border border-red-500/20 rounded-2xl p-8 text-center shadow-lg">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">
              Application Error
            </h2>
            
            <p className="text-neutral-600 dark:text-neutral-400 mb-6 leading-relaxed">
              We encountered an unexpected problem rendering this component. 
              Your data is safe, but we need to refresh the view.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Recover & Retry
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center w-full py-3 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium rounded-xl transition-colors border border-brand-border cursor-pointer"
              >
                Reload Entire Page
              </button>
            </div>
            
            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="mt-8 text-left">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">Technical Details:</p>
                <div className="bg-neutral-950 p-4 rounded-lg overflow-x-auto">
                  <pre className="text-[10px] text-red-400 font-mono">
                    {this.state.error.toString()}
                    {"\n\n"}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
