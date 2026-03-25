import { Component, type ReactNode, type FC } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/** Lightweight inline error boundary for sections (map, journey, admin) */
export class SectionErrorBoundary extends Component<
  { children: ReactNode; name?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; name?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.name || 'Section'}] Error:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 gap-4 min-h-[200px]">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-muted-foreground text-sm">
            {this.props.name ? `${this.props.name} failed to load.` : 'This section failed to load.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-muted-foreground">
                We encountered an unexpected error. This might be a temporary issue.
              </p>
              
              {this.state.error && process.env.NODE_ENV === "development" && (
                <div className="rounded-md bg-muted p-3 text-sm font-mono overflow-auto max-h-32">
                  {this.state.error.message}
                </div>
              )}
              
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={this.handleRetry}
                  data-testid="button-error-retry"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  data-testid="button-error-home"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
