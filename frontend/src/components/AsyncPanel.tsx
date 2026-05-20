import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Props = {
  title: string;
  /** First load with no cached content */
  loading?: boolean;
  /** Background refresh — keep showing children */
  refreshing?: boolean;
  error?: boolean;
  empty?: boolean;
  loadingMessage?: string;
  refreshingMessage?: string;
  errorMessage?: string;
  emptyMessage?: string;
  children?: ReactNode;
  className?: string;
};

export function AsyncPanel({
  title,
  loading,
  refreshing,
  error,
  empty,
  loadingMessage = 'Please wait while we gather the latest information from your shipments.',
  refreshingMessage = 'Updating with the latest on-chain data…',
  errorMessage = 'We could not refresh this section right now. Your shipments and escrow are still available below.',
  emptyMessage = 'Nothing to show here yet. It will appear after your first corridor is registered and reviewed.',
  children,
  className = '',
}: Props) {
  const hasContent = !!children && !empty;
  const showInitialLoad = loading && !hasContent;
  const showEmpty = empty && !hasContent && !loading;
  const showErrorOnly = error && !hasContent && !loading;
  const showRefreshing = refreshing && hasContent;

  return (
    <section
      className={`async-panel card ${showRefreshing ? 'async-panel--refreshing' : ''} ${className}`.trim()}
      aria-busy={loading || refreshing}
    >
      <div className="async-panel__headrow">
        <h3 className="async-panel__title">{title}</h3>
        {showRefreshing ? (
          <span className="async-panel__badge">
            <Loader2 size={12} className="async-panel__spin" aria-hidden /> Updating
          </span>
        ) : null}
      </div>

      {showInitialLoad ? (
        <div className="async-panel__state">
          <Loader2 size={22} className="async-panel__spin" aria-hidden />
          <p className="async-panel__lead">{loadingMessage}</p>
        </div>
      ) : showErrorOnly ? (
        <div className="async-panel__state async-panel__state--warn">
          <p className="async-panel__lead">{errorMessage}</p>
        </div>
      ) : showEmpty ? (
        <div className="async-panel__state async-panel__state--soft">
          <p className="async-panel__lead">{emptyMessage}</p>
        </div>
      ) : (
        <>
          {error && hasContent ? (
            <p className="async-panel__inline-warn">{errorMessage}</p>
          ) : null}
          <div className={showRefreshing ? 'async-panel__content async-panel__content--dim' : 'async-panel__content'}>
            {children}
          </div>
        </>
      )}
    </section>
  );
}
