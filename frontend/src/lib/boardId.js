// Every board has a name that lives in the link, e.g. ?board=team42.
// People who open the same link end up on the same board (from Phase 2 on).

const BOARD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;

function randomBoardId() {
  return Math.random().toString(36).slice(2, 8);
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
