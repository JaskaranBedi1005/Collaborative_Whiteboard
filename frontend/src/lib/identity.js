// The display name shown next to your pen while you draw.
//
// This is a name, not an account: there is no password, and it is only kept
// in this browser. It travels with your live "progress" messages (the server
// forwards them unchanged), so no backend change is needed.

const STORAGE_KEY = 'whiteboard-name';
export const MAX_NAME_LENGTH = 24;

const ADJECTIVES = ['Swift', 'Calm', 'Bright', 'Bold', 'Clever', 'Happy', 'Quiet', 'Lucky'];
const ANIMALS = ['Otter', 'Falcon', 'Panda', 'Fox', 'Koala', 'Tiger', 'Heron', 'Lynx'];

// Trims, collapses spaces, removes control characters and caps the length.
// Used on your own name and on names received from other people.
export function sanitizeName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export function guestName() {
  const pick = (list) => list.at(Math.floor(Math.random() * list.length));
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

export function getSavedName() {
  try {
    return sanitizeName(localStorage.getItem(STORAGE_KEY) ?? '') || null;
  } catch {
    return null; // storage blocked: ask again next visit
  }
}

export function saveName(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Not remembered, but the name still works for this visit.
  }
}

export function initials(name) {
  const words = sanitizeName(name).split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words.at(-1)[0];
  return letters.toUpperCase();
}
