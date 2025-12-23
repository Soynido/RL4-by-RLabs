import React, { useState, useRef, useEffect } from 'react';

export interface DropdownOption {
  label: string;
  value: string;
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`dropdown ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dropdown.tsx:onClick',message:'Dropdown clicked',data:{disabled,isOpen,value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          if (!disabled) {
            setIsOpen(!isOpen);
          } else {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dropdown.tsx:onClick',message:'Dropdown blocked',data:{disabled},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
          }
        }}
        disabled={disabled}
      >
        <span>{selectedOption.label}</span>
        <svg className="dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>
      {isOpen && (
        <div className="dropdown-menu open">
          {options.map((option) => (
            <div
              key={option.value}
              className={`dropdown-item ${option.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

