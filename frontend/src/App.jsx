import { useEffect, useState } from 'react';
import SummaryModal from './components/SummaryModal.jsx';
import Toolbar from './components/Toolbar.jsx';
import Whiteboard from './components/Whiteboard.jsx';
import { useBoard } from './hooks/useBoard.js';
import { getBoardId } from './lib/boardId.js';
import { getBoardSnapshot } from './lib/exportImage.js';

const SUMMARIZE_URL = import.meta.env.VITE_SUMMARIZE_URL;
const COOLDOWN_SECONDS = 30;

export default function App() {
  const [boardId] = useState(getBoardId);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#1d1d1f');
  const [size, setSize] = useState(4);

  // AI Summary state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const { strokes, remoteLive, status, addStroke, sendProgress, undo, clear, canUndo } =
    useBoard(boardId);

  // Cooldown timer tick
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  async function handleSummarize() {
    if (isSummarizing || cooldownRemaining > 0) return;

    const boardEl = document.querySelector('.board');
    const image = getBoardSnapshot(boardEl, 1024);
    if (!image) {
      alert('Could not capture board canvas.');
      return;
    }

    setIsModalOpen(true);
    setIsSummarizing(true);
    setSummaryError(null);
    setSummaryText('');

    if (!SUMMARIZE_URL) {
      setIsSummarizing(false);
      setSummaryError(
        'VITE_SUMMARIZE_URL is not configured. Please deploy the backend and set VITE_SUMMARIZE_URL in frontend/.env.local',
      );
      return;
    }

    try {
      const response = await fetch(SUMMARIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, image }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429) {
          setCooldownRemaining(COOLDOWN_SECONDS);
        }
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      setSummaryText(data.summary || 'No summary returned.');
      setCooldownRemaining(COOLDOWN_SECONDS);
    } catch (err) {
      setSummaryError(err.message || 'Failed to generate summary.');
    } finally {
      setIsSummarizing(false);
    }
  }

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
        onSummarize={handleSummarize}
        isSummarizing={isSummarizing}
        cooldownRemaining={cooldownRemaining}
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
      <SummaryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        summary={summaryText}
        loading={isSummarizing}
        error={summaryError}
      />
    </div>
  );
}
