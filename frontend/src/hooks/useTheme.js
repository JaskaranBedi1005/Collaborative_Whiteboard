import { useCallback, useEffect, useState } from 'react';
import { getSavedTheme, saveTheme, systemTheme } from '../lib/theme.js';

// Current theme ('light' | 'dark') and a toggle. Follows the operating system
// until the person picks one, then remembers their choice.
export function useTheme() {
  const [chosen, setChosen] = useState(getSavedTheme);
  const [system, setSystem] = useState(systemTheme);
  const theme = chosen ?? system;

  // Keep following the OS setting while nothing was chosen.
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const onChange = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // The CSS colours switch on this attribute (index.html sets it before the
  // first paint, so there is no flash of the wrong theme).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    saveTheme(next);
    setChosen(next);
  }, [theme]);

  return { theme, toggleTheme };
}
