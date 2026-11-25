import FormattedText from './FormattedText.jsx';
import { AlertIcon, CloseIcon, CopyIcon, SparklesIcon } from './icons.jsx';

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// AI summary shown beside the board (not over it), so people can keep drawing
// and compare the description with the drawing.
export default function SummaryPanel({
  isOpen,
  onClose,
  boardId,
  summary,
  loading,
  error,
  updatedAt,
  onRegenerate,
  cooldownRemaining = 0,
  onCopy,
}) {
  if (!isOpen) return null;

  const regenerateLabel = loading
    ? 'Summarizing…'
    : cooldownRemaining > 0
      ? `Summarize again (${cooldownRemaining}s)`
      : 'Summarize again';

  return (
    <aside className="side-panel panel" aria-label="AI board summary">
      <header className="side-panel-header">
        <span className="side-panel-icon">
          <SparklesIcon size={16} />
        </span>
        <div className="side-panel-heading">
          <h2 className="side-panel-title">AI summary</h2>
          <p className="side-panel-meta">
            #{boardId}
            {updatedAt && !loading && <> · {formatTime(updatedAt)}</>}
          </p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close summary">
          <CloseIcon />
        </button>
      </header>

      <div className="side-panel-body" aria-live="polite" aria-busy={loading}>
        {loading && (
          <div className="summary-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            <p>Reading the board with Gemini…</p>
            <div className="skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="summary-error" role="alert">
            <AlertIcon />
            <p>{error}</p>
          </div>
        )}

        {summary && !loading && (
          <div className="summary-content">
            <FormattedText text={summary} />
          </div>
        )}
      </div>

      <footer className="side-panel-footer">
        <button
          type="button"
          className="button button-ghost"
          onClick={onCopy}
          disabled={!summary || loading}
        >
          <CopyIcon size={16} />
          Copy
        </button>
        <button
          type="button"
          className="button button-soft"
          onClick={onRegenerate}
          disabled={loading || cooldownRemaining > 0}
        >
          <SparklesIcon size={16} />
          {regenerateLabel}
        </button>
      </footer>
    </aside>
  );
}
