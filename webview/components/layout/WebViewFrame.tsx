import React from 'react';

export interface WebViewFrameProps {
  children?: React.ReactNode;
}

export const WebViewFrame: React.FC<WebViewFrameProps> = ({ children }) => {
  return (
    <div className="webview-frame">
      <div className="frame-content">
        {children}
      </div>
    </div>
  );
};

