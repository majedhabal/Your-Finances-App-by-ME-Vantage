import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export function useTheme(initialTheme: Theme = 'light') {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark', 'system');
    root.classList.add('light');
  }, []);

  return { theme: 'light' as Theme, setTheme: () => {} };
}
