import React from 'react';

export interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: 'button' | 'submit';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  onClick,
  disabled = false,
  title,
  className = '',
  type = 'button',
}) => {
  // #region agent log
  React.useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Button.tsx:render',message:'Button rendered',data:{variant,disabled,hasOnClick:!!onClick,children:String(children)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [variant, disabled, onClick, children]);
  // #endregion

  const baseClass = 'btn';
  const variantClass = variant === 'primary' ? 'btn-cta' : `btn-${variant}`;
  const sizeClass = `btn-${size}`;
  const blockClass = block ? 'btn-block' : '';

  // #region agent log
  const handleClick = () => {
    fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Button.tsx:handleClick',message:'Button clicked',data:{variant,disabled,hasOnClick:!!onClick,children:String(children)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    if (!disabled && onClick) {
      try {
        onClick();
        fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Button.tsx:handleClick',message:'onClick executed',data:{variant},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      } catch (err) {
        fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Button.tsx:handleClick',message:'onClick error',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      }
    } else {
      fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Button.tsx:handleClick',message:'Button blocked',data:{disabled,hasOnClick:!!onClick},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    }
  };
  // #endregion

  return (
    <button
      type={type}
      className={`${baseClass} ${variantClass} ${sizeClass} ${blockClass} ${className}`.trim()}
      onClick={handleClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
};

