// Every board has a name that lives in the link, e.g. ?board=team42.
// People who open the same link end up on the same board (from Phase 2 on).

export const BOARD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;

export function randomBoardId() {
  return Math.random().toString(36).slice(2, 8);
}

// The link to a board on this site (keeps the current address, swaps ?board=).
export function boardLink(boardId) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('board', boardId);
  return url.toString();
}

export function getBoardId() {
  const url = new URL(window.location.href);
  const fromLink = url.searchParams.get('board');
  if (fromLink && BOARD_ID_PATTERN.test(fromLink)) return fromLink;

  // No (valid) board in the link: make one up and put it in the address bar
  // without reloading, so the link can be copied and shared.
  const boardId = randomBoardId();
  url.searchParams.set('board', boardId);
  window.history.replaceState(null, '', url);
  return boardId;
}
