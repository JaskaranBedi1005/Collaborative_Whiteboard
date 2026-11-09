import { useEffect, useState } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Whiteboard from './components/Whiteboard.jsx';
import { useBoard } from './hooks/useBoard.js';
import { getBoardId } from './lib/boardId.js';

export default function App() {
  const [boardId] = useState(getBoardId);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#1d1d1f');
  const [size, setSize] = useState(4);
  const { strokes, remoteLive, status, addStroke, sendProgress, undo, clear, canUndo } =
    useBoard(boardId);

  function handleClear() {
    if (window.confirm('Clear the whole board for everyone?')) clear();
  }

  // Keyboard shortcuts: Ctrl/Cmd+Z = undo, P = pen, E = eraser.
  useEffect(() => {
    function onKeyDown(event) {
      const typing = event.target.closest?.('input, textarea, [contenteditable="true"]');
      if (typing) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        undo();
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (key === 'p') setTool('pen');
        if (key === 'e') setTool('eraser');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo]);

  return (
    <div className="app">
      <Toolbar
        boardId={boardId}
        status={status}
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={(c) => {
          setColor(c);
          setTool('pen'); // picking a color means you want to draw
        }}
        size={size}
        onSizeChange={setSize}
        canUndo={canUndo}
        onUndo={undo}
        onClear={handleClear}
      />
      <Whiteboard
        strokes={strokes}
        remoteLive={remoteLive}
        tool={tool}
        color={color}
        size={size}
        onStrokeProgress={sendProgress}
        onStrokeComplete={addStroke}
      />
    </div>
  );
}
