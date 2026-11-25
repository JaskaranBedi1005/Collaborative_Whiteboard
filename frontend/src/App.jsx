import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import NameDialog from './components/NameDialog.jsx';
import { getSavedName, saveName } from './lib/identity.js';
import SummaryPanel from './components/SummaryPanel.jsx';
import ToolDock, { COLORS } from './components/ToolDock.jsx';
import TopBar from './components/TopBar.jsx';
import Whiteboard from './components/Whiteboard.jsx';
import { CheckIcon, PenIcon } from './components/icons.jsx';
import { useBoard } from './hooks/useBoard.js';
import { useTheme } from './hooks/useTheme.js';
import { getBoardId } from './lib/boardId.js';
import { getBoardSnapshot } from './lib/exportImage.js';
import { createLaserTrails } from './lib/laser.js';
import { toPlainText } from './lib/markdown.js';

const SUMMARIZE_URL = import.meta.env.VITE_SUMMARIZE_URL;
const COOLDOWN_SECONDS = 30;
const TOAST_MS = 2600;
const MIN_SIZE = 1;
const MAX_SIZE = 30;

export default function App() {
  const [boardId] = useState(getBoardId);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(4);

  // AI summary
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);

  // Fading laser-pointer trails, shared by the canvas (draws them) and the
  // connection (adds other people's).
  const [laser] = useState(createLaserTrails);

  const { strokes, remoteLive, status, onlineCount, addStroke, sendProgress, undo, clear, canUndo } =
    useBoard(boardId, { laser });
  const { theme, toggleTheme } = useTheme();

  // Display name shown next to your pen. Asked for on the first visit.
  const [myName, setMyName] = useState(getSavedName);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(() => !getSavedName());

  function handleSaveName(name) {
    const isNew = !myName;
    saveName(name);
    setMyName(name);
    setIsNameDialogOpen(false);
    showToast(isNew ? `Welcome, ${name}! Others will see your name while you draw.` : `You are now ${name}.`);
  }

  const isEmpty = strokes.length === 0 && Object.keys(remoteLive).length === 0;

  const showToast = useCallback((message) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Cooldown timer tick
  useEffect(() => {
    if (cooldownRemaining <= 0) return undefined;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  async function handleSummarize() {
    if (isSummarizing || cooldownRemaining > 0) return;

    const boardEl = document.querySelector('.board');
    const image = getBoardSnapshot(boardEl, 1024);

    setIsPanelOpen(true);
    setSummaryError(null);
    setSummaryText('');

    if (!image) {
      setSummaryError('Could not capture the board. Try resizing the window and summarizing again.');
      return;
    }
    if (!SUMMARIZE_URL) {
      setSummaryError(
        'The summary service is not configured. Set VITE_SUMMARIZE_URL in frontend/.env.local.',
      );
      return;
    }

    setIsSummarizing(true);
    try {
      const response = await fetch(SUMMARIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, image }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429) setCooldownRemaining(COOLDOWN_SECONDS);
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      setSummaryText(data.summary || 'No summary returned.');
      setSummaryUpdatedAt(new Date());
      setCooldownRemaining(COOLDOWN_SECONDS);
    } catch (err) {
      setSummaryError(err.message || 'Failed to generate summary.');
    } finally {
      setIsSummarizing(false);
    }
  }

  async function handleShare() {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied. Anyone with it can draw on this board.');
    } catch {
      window.prompt('Copy this link to share the board:', link);
    }
  }

  async function handleCopySummary() {
    try {
      // Copy clean text: real bullets, no Markdown symbols.
      await navigator.clipboard.writeText(toPlainText(summaryText));
      showToast('Summary copied.');
    } catch {
      showToast('Could not copy. Select the text and copy it instead.');
    }
  }

  function handleConfirmClear() {
    setIsConfirmOpen(false);
    clear();
    showToast('Board cleared for everyone.');
  }

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, P pen, E eraser, L laser, [ and ] brush size.
  useEffect(() => {
    function onKeyDown(event) {
      const typing = event.target.closest?.('input, textarea, [contenteditable="true"]');
      if (typing || document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        setIsPanelOpen(false);
      } else if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        undo();
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (key === 'p') setTool('pen');
        if (key === 'e') setTool('eraser');
        if (key === 'l') setTool('laser');
        if (key === '[') setSize((s) => Math.max(MIN_SIZE, s - 1));
        if (key === ']') setSize((s) => Math.min(MAX_SIZE, s + 1));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo]);

  return (
    <div className={`app ${isPanelOpen ? 'has-side-panel' : ''}`}>
      <Whiteboard
        strokes={strokes}
        remoteLive={remoteLive}
        laser={laser}
        theme={theme}
        myName={myName ?? ''}
        tool={tool}
        color={color}
        size={size}
        onStrokeProgress={sendProgress}
        onStrokeComplete={addStroke}
      />

      {isEmpty && (
        <div className="empty-hint" aria-hidden="true">
          <span className="empty-hint-icon">
            <PenIcon size={22} />
          </span>
          <p className="empty-hint-title">Start drawing anywhere</p>
          <p className="empty-hint-text">Click Share to invite others. Everyone sees lines as they are drawn.</p>
        </div>
      )}

      <TopBar
        boardId={boardId}
        status={status}
        onlineCount={onlineCount}
        onShare={handleShare}
        onSummarize={handleSummarize}
        isSummarizing={isSummarizing}
        cooldownRemaining={cooldownRemaining}
        theme={theme}
        onToggleTheme={toggleTheme}
        myName={myName}
        onEditName={() => setIsNameDialogOpen(true)}
      />

      <ToolDock
        theme={theme}
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={(c) => {
          setColor(c);
          setTool('pen'); // picking a colour means you want to draw
        }}
        size={size}
        onSizeChange={setSize}
        canUndo={canUndo}
        onUndo={undo}
        onClear={() => setIsConfirmOpen(true)}
      />

      {toast && (
        <div className="toast" role="status">
          <CheckIcon size={16} />
          {toast}
        </div>
      )}

      <SummaryPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        boardId={boardId}
        summary={summaryText}
        loading={isSummarizing}
        error={summaryError}
        updatedAt={summaryUpdatedAt}
        onRegenerate={handleSummarize}
        cooldownRemaining={cooldownRemaining}
        onCopy={handleCopySummary}
      />
      <NameDialog
        isOpen={isNameDialogOpen}
        currentName={myName}
        isFirstVisit={!myName}
        onSave={handleSaveName}
        onClose={() => setIsNameDialogOpen(false)}
      />
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmClear}
      />
    </div>
  );
}
