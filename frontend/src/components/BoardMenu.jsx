import { useEffect, useRef, useState } from 'react';
import { boardLink, randomBoardId } from '../lib/boardId.js';
import { MAX_LABEL_LENGTH, timeAgo } from '../lib/recentBoards.js';
import { CheckIcon, ChevronDownIcon, CloseIcon, EditIcon, PlusIcon } from './icons.jsx';

// The board name in the top bar. Clicking it shows your recent boards (this
// browser only), lets you give a board a friendly name, and start a new one.
export default function BoardMenu({ boardId, currentLabel, boards, onRename, onRemove }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const rootRef = useRef(null);

  function close() {
    setOpen(false);
    setEditingId(null);
  }

  // Close on a click outside or on Escape (Escape first cancels a rename).
  // The key listener runs in the capture phase so Escape doesn't also reach
  // the app's own shortcut handler.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) close();
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (editingId) setEditingId(null);
      else close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, editingId]);

  function startRename(board) {
    setEditingId(board.id);
    setDraft(board.label);
  }

  function saveRename(event) {
    event.preventDefault();
    onRename(editingId, draft);
    setEditingId(null);
  }

  function newBoard() {
    window.location.assign(boardLink(randomBoardId()));
  }

  return (
    <div className="board-menu" ref={rootRef}>
      <button
        type="button"
        className="board-chip"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        title="Your recent boards"
      >
        {currentLabel ? (
          <span className="board-chip-label">{currentLabel}</span>
        ) : (
          <span className="board-chip-id">
            <span className="board-chip-hash" aria-hidden="true">
              #
            </span>
            {boardId}
          </span>
        )}
        <ChevronDownIcon size={14} />
      </button>

      {open && (
        <div className="board-menu-popover panel" role="dialog" aria-label="Recent boards">
          <div className="board-menu-header">
            <span className="board-menu-title">Recent boards</span>
            <span className="board-menu-note">Saved in this browser only</span>
          </div>

          <ul className="board-menu-list">
            {boards.map((board) => {
              const isCurrent = board.id === boardId;
              const title = board.label || `#${board.id}`;
              return (
                <li key={board.id} className={`board-item ${isCurrent ? 'is-current' : ''}`}>
                  {editingId === board.id ? (
                    <form className="board-rename" onSubmit={saveRename}>
                      <input
                        className="text-input text-input-sm"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={MAX_LABEL_LENGTH}
                        placeholder={`#${board.id}`}
                        aria-label="Board name"
                        autoFocus
                      />
                      <button type="submit" className="icon-button" aria-label="Save name" title="Save">
                        <CheckIcon size={16} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <a
                        className="board-item-link"
                        href={boardLink(board.id)}
                        aria-current={isCurrent ? 'page' : undefined}
                        onClick={(event) => {
                          if (isCurrent) {
                            event.preventDefault();
                            close();
                          }
                        }}
                      >
                        <span className="board-item-title">{title}</span>
                        <span className="board-item-meta">
                          {board.label && <>#{board.id} · </>}
                          {isCurrent ? 'Open now' : timeAgo(board.lastVisited)}
                        </span>
                      </a>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => startRename(board)}
                        aria-label={`Rename ${title}`}
                        title="Give it a name"
                      >
                        <EditIcon size={16} />
                      </button>
                      {!isCurrent && (
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => onRemove(board.id)}
                          aria-label={`Remove ${title} from this list`}
                          title="Remove from this list (the board is not deleted)"
                        >
                          <CloseIcon size={16} />
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <button type="button" className="button button-soft board-menu-new" onClick={newBoard}>
            <PlusIcon size={16} />
            New board
          </button>
        </div>
      )}
    </div>
  );
}
