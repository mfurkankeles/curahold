// A render error in one screen must not blank the whole page: it is caught here
// and replaced with a plain message and a way back (try again, or reload).
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n';

function Fallback({ onRetry, whole }: { onRetry: () => void; whole?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={whole ? 'center-note' : 'page'} role="alert">
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center', margin: whole ? undefined : '48px auto', maxWidth: 420 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{t('errors.boundary.title')}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t('errors.boundary.body')}
        </p>
        <div className="inline-actions" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={onRetry}>
            {t('common.retry')}
          </button>
          <button className="btn btn--primary" onClick={() => location.reload()}>
            {t('errors.boundary.reload')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** A full-screen fallback (around the whole app shell) instead of one inside the page area. */
  whole?: boolean;
  /** When this changes (a new route), a caught error is cleared and the children render again. */
  resetKey?: string;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (this.state.failed) return <Fallback whole={this.props.whole} onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
