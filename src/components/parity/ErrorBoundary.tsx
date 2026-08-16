"use client";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for debugging but don't crash the page
    console.error(`[ErrorBoundary:${this.props.label || "unnamed"}]`, error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const label = this.props.label || "unnamed";
      return (
        <section
          role="alert"
          aria-label={`Error in ${label}`}
          className="m-6 rounded-xl border border-red-500/30 bg-red-950/60 p-6 text-sm shadow-xl backdrop-blur-md dark:bg-red-950/40"
          style={{ color: "var(--foreground)", borderColor: "rgba(239,68,68,0.3)" }}
        >
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-red-400">
            Component Error — {label}
          </h3>
          <p className="mb-4 opacity-90">{this.state.error?.message || "Unknown error"}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-red-500 active:scale-[0.98]"
          >
            Retry
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
