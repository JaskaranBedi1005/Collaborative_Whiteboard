import { useCallback, useEffect, useState } from 'react';
import { loadRecentBoards, recordVisit, removeBoard, renameBoard } from '../lib/recentBoards.js';

// Recent boards for this browser, with the current board recorded as visited.
export function useRecentBoards(currentBoardId) {
  const [boards, setBoards] = useState(loadRecentBoards);

  useEffect(() => {
    setBoards((list) => recordVisit(list, currentBoardId));
  }, [currentBoardId]);

  // Another tab may have changed the list (renamed or opened a board).
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === null || event.key === 'whiteboard-recent-boards') setBoards(loadRecentBoards());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const rename = useCallback((id, label) => setBoards((list) => renameBoard(list, id, label)), []);
  const remove = useCallback((id) => setBoards((list) => removeBoard(list, id)), []);

  const current = boards.find((b) => b.id === currentBoardId);
  return { boards, currentLabel: current?.label ?? '', rename, remove };
}
