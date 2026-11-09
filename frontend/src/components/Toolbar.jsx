import { useState } from 'react';

const COLORS = ['#1d1d1f', '#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#9b5de5'];

const STATUS_LABELS = {
  online: 'Live',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline (local only)',
};

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link:', window.location.href);
    }
  }

  return (
    <button type="button" onClick={copy} title="Copy the link to this board">
      {copied ? '✅ Copied' : '🔗 Copy link'}
    </button>
  );
}

export default function Toolbar({
  boardId,
  status,
  tool,
  onToolChange,
  color,
  onColorChange,
  size,
  onSizeChange,
  canUndo,
  onUndo,
  onClear,
}) {
  const isCustomColor = !COLORS.includes(color);

  return (
    <header className="toolbar">
      <div className="toolbar-group" role="group" aria-label="Tool">
        <button
          type="button"
          className={tool === 'pen' ? 'active' : ''}
          aria-pressed={tool === 'pen'}
          onClick={() => onToolChange('pen')}
          title="Pen (P)"
        >
          ✏️ Pen
        </button>
        <button
          type="button"
          className={tool === 'eraser' ? 'active' : ''}
          aria-pressed={tool === 'eraser'}
          onClick={() => onToolChange('eraser')}
          title="Eraser (E)"
        >
          🧽 Eraser
        </button>
      </div>

      <div className="toolbar-group" role="group" aria-label="Color">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${color === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            onClick={() => onColorChange(c)}
          />
        ))}
        <label
          className={`swatch swatch-custom ${isCustomColor ? 'active' : ''}`}
          style={isCustomColor ? { backgroundColor: color } : undefined}
          title="Pick any color"
        >
          {!isCustomColor && '+'}
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            aria-label="Custom color"
          />
        </label>
      </div>

      <div className="toolbar-group">
        <label className="size-control">
          Size
          <input
            type="range"
            min="1"
            max="30"
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
          />
          <span className="size-value">{size}</span>
        </label>
      </div>

      <div className="toolbar-group">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↩️ Undo
        </button>
        <button type="button" className="danger" onClick={onClear} title="Clear the board">
          🗑️ Clear
        </button>
      </div>

      <div className="board-info">
        <span className={`status status-${status}`} title="Connection to the server">
          <span className="status-dot" aria-hidden="true" />
          {STATUS_LABELS[status]}
        </span>
        <span className="board-name">
          Board: <strong>{boardId}</strong>
        </span>
        <CopyLinkButton />
      </div>
    </header>
  );
}
