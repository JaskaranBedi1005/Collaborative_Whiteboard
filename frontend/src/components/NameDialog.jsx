import { useEffect, useId, useState } from 'react';
import Modal from './Modal.jsx';
import { LogoMark } from './icons.jsx';
import { MAX_NAME_LENGTH, guestName, sanitizeName } from '../lib/identity.js';

// Asks for the name shown next to your pen while you draw. Opens on your first
// visit, and again when you click your initials in the top bar.
export default function NameDialog({ isOpen, currentName, isFirstVisit, onSave, onClose }) {
  const [value, setValue] = useState(currentName ?? '');
  const inputId = useId();
  const cleaned = sanitizeName(value);

  // Start from the current name each time it opens.
  useEffect(() => {
    if (isOpen) setValue(currentName ?? '');
  }, [isOpen, currentName]);

  function handleSubmit(event) {
    event.preventDefault();
    if (cleaned) onSave(cleaned);
  }

  // Closing the first-visit box without a name means "continue as guest".
  const close = isFirstVisit ? () => onSave(guestName()) : onClose;

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={isFirstVisit ? 'Welcome to Whiteboard' : 'Change your name'}
      icon={isFirstVisit ? <LogoMark size={24} /> : null}
      tone="accent"
      footer={
        <>
          {isFirstVisit ? (
            <button type="button" className="button button-ghost" onClick={close}>
              Continue as guest
            </button>
          ) : (
            <button type="button" className="button button-ghost" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="submit" form={inputId + '-form'} className="button button-primary" disabled={!cleaned}>
            {isFirstVisit ? 'Start drawing' : 'Save'}
          </button>
        </>
      }
    >
      <form id={inputId + '-form'} className="name-form" onSubmit={handleSubmit}>
        <p>
          {isFirstVisit
            ? 'What should others see next to your pen while you draw?'
            : 'This name appears next to your pen while you draw.'}
        </p>
        <label className="field-label" htmlFor={inputId}>
          Your name
        </label>
        <input
          id={inputId}
          className="text-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="e.g. Sam"
          autoComplete="nickname"
          spellCheck={false}
          data-autofocus
        />
        <p className="field-hint">
          Only saved in this browser. Not an account: there is no password.
        </p>
      </form>
    </Modal>
  );
}
