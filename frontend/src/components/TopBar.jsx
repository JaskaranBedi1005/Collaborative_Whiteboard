import {
  EraserIcon,
  LaserIcon,
  LinkIcon,
  LogoMark,
  MoonIcon,
  PenIcon,
  SparklesIcon,
  SunIcon,
  UsersIcon,
} from './icons.jsx';
import { initials } from '../lib/identity.js';
import { describeActivity } from '../lib/activity.js';
import BoardMenu from './BoardMenu.jsx';

function statusText(status, onlineCount) {
  if (status === 'online') {
    if (!onlineCount) return 'Live';
    return onlineCount === 1 ? 'Just you' : `${onlineCount} online`;
  }
  if (status === 'connecting') return 'Connecting…';
  if (status === 'reconnecting') return 'Reconnecting…';
  return 'Offline · local only';
}

// Floating cards across the top of the board: name on the left, people and
// sharing on the right.
export default function TopBar({
  boardId,
  status,
  onlineCount,
  onShare,
  onSummarize,
  isSummarizing,
  cooldownRemaining = 0,
  theme = 'light',
  onToggleTheme,
  myName,
  onEditName,
  currentLabel = '',
  recentBoards = [],
  onRenameBoard,
  onRemoveBoard,
  activePeople = [],
}) {
  const activity = describeActivity(activePeople);
  const firstTool = activePeople[0]?.tool;
  const ActivityIcon = firstTool === 'laser' ? LaserIcon : firstTool === 'eraser' ? EraserIcon : PenIcon;
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const summarizeLabel = isSummarizing
    ? 'Summarizing…'
    : cooldownRemaining > 0
      ? `Summarize (${cooldownRemaining}s)`
      : 'Summarize';

  return (
    <header className="topbar">
      <div className="panel brand">
        <LogoMark />
        <span className="brand-name">Whiteboard</span>
        <span className="divider" aria-hidden="true" />
        <BoardMenu
          boardId={boardId}
          currentLabel={currentLabel}
          boards={recentBoards}
          onRename={onRenameBoard}
          onRemove={onRemoveBoard}
        />
      </div>

      <div className="panel actions">
        {/* Always rendered (empty when idle) so screen readers announce changes. */}
        <span className="activity" aria-live="polite">
          {activity && (
            <span
              className="activity-pill"
              title={activePeople.length > 2 ? `${activity}: ${activePeople.map((p) => p.name).join(', ')}` : activity}
            >
              <span className="activity-icon" aria-hidden="true">
                <ActivityIcon size={14} />
              </span>
              <span className="activity-text">{activity}</span>
            </span>
          )}
        </span>

        <span
          className={`presence presence-${status}`}
          title={status === 'online' ? 'People on this board right now' : 'Connection to the server'}
          role="status"
        >
          {status === 'online' ? (
            <UsersIcon size={16} />
          ) : (
            <span className="presence-dot" aria-hidden="true" />
          )}
          {statusText(status, onlineCount)}
        </span>

        {onToggleTheme && (
          <button
            type="button"
            className="icon-button theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        )}

        {onSummarize && (
          <button
            type="button"
            className="button button-soft"
            onClick={onSummarize}
            disabled={isSummarizing || cooldownRemaining > 0}
            title={
              cooldownRemaining > 0
                ? `You can summarize again in ${cooldownRemaining}s`
                : 'Describe what is on the board with AI'
            }
          >
            <SparklesIcon size={16} />
            <span className="button-label">{summarizeLabel}</span>
          </button>
        )}

        <button
          type="button"
          className="button button-primary"
          onClick={onShare}
          title="Copy the link to this board"
        >
          <LinkIcon size={16} />
          <span className="button-label">Share</span>
        </button>

        {myName && onEditName && (
          <button
            type="button"
            className="avatar-button"
            onClick={onEditName}
            aria-label={`You are ${myName}. Change your name`}
            title={`You are ${myName} · click to change`}
          >
            {initials(myName)}
          </button>
        )}
      </div>
    </header>
  );
}
