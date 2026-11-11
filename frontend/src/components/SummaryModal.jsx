import { useEffect } from 'react';

export default function SummaryModal({ isOpen, onClose, summary, loading, error }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3 className="modal-title">✨ AI Board Summary</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {loading && (
            <div className="summary-loading">
              <span className="summary-spinner" aria-hidden="true" />
              <p>Analyzing whiteboard with Gemini Flash…</p>
            </div>
          )}

          {error && !loading && (
            <div className="summary-error">
              <p>⚠️ {error}</p>
            </div>
          )}

          {summary && !loading && (
            <div className="summary-content">
              {summary.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
