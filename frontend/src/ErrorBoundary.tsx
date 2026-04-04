import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Shield, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Catches React render errors to prevent white screen — shows fallback instead. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Navi-Trust] ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 50%, #2563eb 100%)',
            color: '#fff',
            fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Shield size={32} color="#60a5fa" />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 700 }}>Navi-Trust</h1>
          <p style={{ margin: '0 0 24px', color: 'rgba(255,255,255,0.85)', fontSize: '0.95rem' }}>
            Something went wrong. Please try again.
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={16} /> Reload App
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{ marginTop: 24, padding: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 8, fontSize: '0.75rem', overflow: 'auto', maxWidth: '100%' }}>
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
