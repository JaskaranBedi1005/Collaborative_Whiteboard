import { LASER_COLOR } from '../lib/laser.js';
import { displayColor } from '../lib/theme.js';
import { EraserIcon, LaserIcon, PenIcon, TrashIcon, UndoIcon } from './icons.jsx';

export const COLORS = [
  { value: '#1f2937', name: 'Ink' },
  { value: '#ef4444', name: 'Red' },
  { value: '#f97316', name: 'Orange' },
  { value: '#eab308', name: 'Yellow' },
  { value: '#22c55e', name: 'Green' },
  { value: '#06b6d4', name: 'Cyan' },
  { value: '#3b82f6', name: 'Blue' },
  { value: '#a855f7', name: 'Purple' },
];

const MAX_PREVIEW_DOT = 22;

// Floating dock at the bottom: tools, colours, size, undo and clear.
export default function ToolDock({
  tool,
  onToolChange,
  color,
  onColorChange,
  size,
  onSizeChange,
  canUndo,
  onUndo,
  onClear,
  theme = 'light',
}) {
  // Swatches show the colour as it will appear on this board (Ink is light in dark mode).
  const shown = (value) => displayColor(value, theme);
  const isCustomColor = !COLORS.some((c) => c.value === color);
  const isEraser = tool === 'eraser';
  const isLaser = tool === 'laser';
  // Colour and size only apply to the pen (the eraser uses size too).
  const showsColor = tool === 'pen';
  const previewSize = isLaser
    ? 10
    : Math.max(4, Math.min(isEraser ? size * 3 : size, MAX_PREVIEW_DOT));

  return (
    <nav className="dock panel" aria-label="Drawing tools">
      <div className="dock-group" role="group" aria-label="Tool">
        <button
          type="button"
          className={`tool-button ${tool === 'pen' ? 'is-active' : ''}`}
          aria-pressed={tool === 'pen'}
          aria-label="Pen"
          data-tooltip="Pen · P"
          onClick={() => onToolChange('pen')}
        >
          <PenIcon />
        </button>
        <button
          type="button"
          className={`tool-button ${isEraser ? 'is-active' : ''}`}
          aria-pressed={isEraser}
          aria-label="Eraser"
          data-tooltip="Eraser · E"
          onClick={() => onToolChange('eraser')}
        >
          <EraserIcon />
        </button>
        <button
          type="button"
          className={`tool-button ${isLaser ? 'is-active is-laser' : ''}`}
          aria-pressed={isLaser}
          aria-label="Laser pointer"
          data-tooltip="Laser pointer · L"
          onClick={() => onToolChange('laser')}
        >
          <LaserIcon />
        </button>
      </div>

      <span className="dock-divider" aria-hidden="true" />

      <div className="dock-group swatches" role="group" aria-label="Colour">
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`swatch ${showsColor && color === c.value ? 'is-active' : ''}`}
            style={{ '--swatch': shown(c.value) }}
            aria-label={c.name}
            aria-pressed={showsColor && color === c.value}
            data-tooltip={c.name}
            onClick={() => onColorChange(c.value)}
          />
        ))}
        <label
          className={`swatch swatch-custom ${showsColor && isCustomColor ? 'is-active' : ''}`}
          style={isCustomColor ? { '--swatch': shown(color) } : undefined}
          data-tooltip="Any colour"
        >
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            aria-label="Pick any colour"
          />
        </label>
      </div>

      <span className="dock-divider" aria-hidden="true" />

      <div className="dock-group size-group">
        <span className="size-preview" aria-hidden="true">
          <span
            className={isEraser ? 'is-eraser' : isLaser ? 'is-laser' : ''}
            style={{
              width: previewSize,
              height: previewSize,
              background: isEraser ? undefined : isLaser ? LASER_COLOR : shown(color),
            }}
          />
        </span>
        <input
          className="size-slider"
          type="range"
          min="1"
          max="30"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          disabled={isLaser}
          aria-label="Brush size"
          aria-valuetext={`${size} pixels`}
          title={isLaser ? 'The laser pointer has a fixed size' : `Size ${size} · [ and ] change it`}
        />
      </div>

      <span className="dock-divider" aria-hidden="true" />

      <div className="dock-group" role="group" aria-label="History">
        <button
          type="button"
          className="tool-button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          data-tooltip="Undo · Ctrl+Z"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="tool-button tool-button-danger"
          onClick={onClear}
          aria-label="Clear board"
          data-tooltip="Clear board"
        >
          <TrashIcon />
        </button>
      </div>
    </nav>
  );
}
