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
      // Silent fallback — render nothing so the rest of the page still works
      // The page has many sections; one failing should not break the whole page
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}
