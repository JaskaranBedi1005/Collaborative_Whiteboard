import { useEffect, useId, useRef } from 'react';
import { CloseIcon } from './icons.jsx';

// Shared dialog shell: backdrop, card, title row, body and optional footer.
// Escape or a click on the backdrop closes it; focus moves into the dialog
// when it opens and back to where it was when it closes.
export default function Modal({ isOpen, onClose, title, icon, tone = 'default', footer, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  // The board re-renders many times a second while others draw, and callers
  // pass a new onClose each time. Keeping it in a ref means the focus/keyboard
  // setup below runs only when the dialog opens or closes.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = document.activeElement;
    // Focus a field marked data-autofocus (e.g. the name box), else the dialog.
    const target = dialogRef.current?.querySelector('[data-autofocus]') ?? dialogRef.current;
    target?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`modal modal-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          {icon && <span className="modal-icon">{icon}</span>}
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
