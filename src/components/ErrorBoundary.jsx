/**
 * ErrorBoundary.jsx
 * Catches JavaScript errors in any child component tree,
 * logs them, and displays a fallback UI instead of crashing
 * the entire application.
 */

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/cw-cycle-count-v2/'
  }

  handleReload = () => {
    window.location.href = '/cw-cycle-count-v2/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--bg, #F5F6FA)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          <div style={{
            maxWidth: 480,
            width: '100%',
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, #E2E5ED)',
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            boxShadow: '0 4px 8px rgba(16,24,40,.08)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.4 }}>⚠️</div>
            <h2 style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--text-primary, #0F1117)',
              marginBottom: 8,
            }}>
              Something went wrong
            </h2>
            <p style={{
              fontSize: 14,
              color: 'var(--text-muted, #8A94A6)',
              marginBottom: 20,
              lineHeight: 1.5,
            }}>
              An unexpected error occurred. You can try going back or reloading the page.
            </p>

            {this.state.error && (
              <div style={{
                padding: '10px 14px',
                background: 'var(--red-light, #FEF3F2)',
                border: '1px solid #FDA29B',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--red-text, #B42318)',
                textAlign: 'left',
                marginBottom: 20,
                fontFamily: "'JetBrains Mono', monospace",
                wordBreak: 'break-word',
              }}>
                {this.state.error.message || 'Unknown error'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '9px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: '1px solid var(--border-2, #CDD2DE)',
                  background: 'var(--surface, #fff)',
                  color: 'var(--text-primary, #0F1117)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Try again
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '9px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: '1px solid #3D5AFE',
                  background: '#3D5AFE',
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
