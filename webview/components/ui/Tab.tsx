import React from 'react';

export interface TabProps {
  children?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export const Tab: React.FC<TabProps> = ({ children, active = false, onClick, icon }) => {
  // #region agent log
  React.useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tab.tsx:render',message:'Tab rendered',data:{active,hasOnClick:!!onClick,label:String(children)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [active, onClick, children]);
  // #endregion

  // #region agent log
  const handleClick = () => {
    fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tab.tsx:handleClick',message:'Tab clicked',data:{active,hasOnClick:!!onClick,label:String(children)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    if (onClick) {
      try {
        onClick();
        fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tab.tsx:handleClick',message:'onClick executed',data:{active},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      } catch (err) {
        fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tab.tsx:handleClick',message:'onClick error',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      }
    }
  };
  // #endregion

  return (
    <button
      type="button"
      className={`tab ${active ? 'active' : ''}`}
      onClick={handleClick}
    >
      {icon && <span className="tab-icon">{icon}</span>}
      {children}
    </button>
  );
};

