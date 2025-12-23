import React from 'react';
import { useStore } from '../../state/store';

export interface WebViewFrameProps {
  children?: React.ReactNode;
}

export const WebViewFrame: React.FC<WebViewFrameProps> = ({ children }) => {
  const theme = useStore((s) => s.theme);
  
  // Apply theme to document root for CSS variable inheritance
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, [theme]);

  return (
    <div className="webview-frame" data-theme={theme}>
      <div className="frame-content">
        {children}
      </div>
    </div>
  );
};

