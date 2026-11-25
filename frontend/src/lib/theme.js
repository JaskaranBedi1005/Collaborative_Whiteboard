// Light / dark theme.
//
// Strokes are saved with a fixed colour, but people on the same board may use
// different themes. A near-black line would vanish on the dark board (and a
// near-white one on the light board), so those are *displayed* in a readable
// ink for the current theme. The saved colour never changes.

export const THEMES = ['light', 'dark'];
const STORAGE_KEY = 'whiteboard-theme';

const LIGHT_INK = '#1f2937';
const DARK_INK = '#e5e7eb';

function parseHex(color) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color ?? '');
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// WCAG relative luminance: 0 = black, 1 = white.
function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// The colour to draw a stroke with in the given theme.
export function displayColor(color, theme) {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const lum = luminance(rgb);
  if (theme === 'dark' && lum < 0.04) return DARK_INK;
  if (theme === 'light' && lum > 0.9) return LIGHT_INK;
  return color;
}

// Saved choice, or null to follow the operating system.
export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : null;
  } catch {
    return null; // storage blocked (private mode etc.)
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered, but the switch still works for this visit.
  }
}

export function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
