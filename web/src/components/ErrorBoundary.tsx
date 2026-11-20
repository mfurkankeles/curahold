// A render error in one screen must not blank the whole page: it is caught here
// and replaced with a plain message and a way back (try again, or reload).
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { ErrorState } from './Empty';

function Fallback({ onRetry, whole }: { onRetry: () => void; whole?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={whole ? 'center-note' : 'page'}>
      <ErrorState className={whole ? undefined : 'errorbox--page'} title={t('errors.boundary.title')} body={t('errors.boundary.body')} onRetry={onRetry} onReload={() => location.reload()} />
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

/**
 * Catches a screen's render error and shows a plain message with try again or reload, so one screen never blanks the page.
 */
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
