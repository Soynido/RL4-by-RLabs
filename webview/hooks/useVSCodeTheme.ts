import { useEffect, useState } from 'react';

export function useVSCodeTheme() {
  const [vscodeTheme, setVscodeTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const detectTheme = () => {
      const bg = typeof document !== 'undefined'
        ? getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim()
        : '';
      if (bg) {
        const rgb = bg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const luminance = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
          setVscodeTheme(luminance > 128 ? 'light' : 'dark');
        }
      }
    };

    detectTheme();
    const observer = new MutationObserver(detectTheme);
    if (typeof document !== 'undefined') {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.setProperty('--rl4-bg-override', vscodeTheme === 'dark' ? 'var(--bg-primary)' : '#f5f5f5');
    }
  }, [vscodeTheme]);

  return vscodeTheme;
}

