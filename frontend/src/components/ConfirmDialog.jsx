import Modal from './Modal.jsx';
import { TrashIcon } from './icons.jsx';

// "Are you sure?" box for clearing the board (replaces the browser's confirm()).
export default function ConfirmDialog({ isOpen, onCancel, onConfirm }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Clear the board?"
      icon={<TrashIcon />}
      tone="danger"
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button button-danger" onClick={onConfirm}>
            Clear for everyone
          </button>
        </>
      }
    >
      <p>
        This removes every line on this board for everyone who has it open. It can&apos;t be
        undone.
      </p>
    </Modal>
  );
}
