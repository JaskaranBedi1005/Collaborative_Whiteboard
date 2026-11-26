// "Recent boards": the boards you opened in this browser, newest first.
//
// Kept only in this browser (localStorage). It never lists other people's
// boards, and removing a board from the list does not delete the board.
// Each entry: { id, label, lastVisited } where label is an optional friendly
// name such as "DBMS notes".

import { BOARD_ID_PATTERN } from './boardId.js';

const STORAGE_KEY = 'whiteboard-recent-boards';
export const MAX_RECENT_BOARDS = 10;
export const MAX_LABEL_LENGTH = 40;

export function sanitizeLabel(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
}

// Never trust what is in storage: drop anything malformed.
function isValidEntry(entry) {
  return (
    entry &&
    typeof entry.id === 'string' &&
    BOARD_ID_PATTERN.test(entry.id) &&
    Number.isFinite(entry.lastVisited)
  );
}

export function loadRecentBoards() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidEntry)
      .map((e) => ({ id: e.id, label: sanitizeLabel(e.label), lastVisited: e.lastVisited }))
      .sort((a, b) => b.lastVisited - a.lastVisited)
      .slice(0, MAX_RECENT_BOARDS);
  } catch {
    return []; // storage blocked or damaged: start with an empty list
  }
}

function store(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Not remembered, but the app keeps working.
  }
  return list;
}

// Moves the board to the top (adding it if new), keeping its friendly name.
export function recordVisit(list, id, now = Date.now()) {
  const existing = list.find((b) => b.id === id);
  const updated = [
    { id, label: existing?.label ?? '', lastVisited: now },
    ...list.filter((b) => b.id !== id),
  ].slice(0, MAX_RECENT_BOARDS);
  return store(updated);
}

export function renameBoard(list, id, label) {
  return store(list.map((b) => (b.id === id ? { ...b, label: sanitizeLabel(label) } : b)));
}

export function removeBoard(list, id) {
  return store(list.filter((b) => b.id !== id));
}

// "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or a date.
export function timeAgo(timestamp, now = Date.now()) {
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
