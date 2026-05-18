import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallbackTitle?: string
  onReset?: () => void
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }
  }

  reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-title">{this.props.fallbackTitle || 'Something went wrong'}</div>
          <pre className="error-boundary-message">{this.state.error.message}</pre>
          <button className="btn small" onClick={this.reset}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
