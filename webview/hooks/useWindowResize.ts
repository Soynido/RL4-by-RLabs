import { useEffect } from 'react';

/**
 * Hook pour gérer le resize de la fenêtre avec throttle et cleanup
 * Utilise requestAnimationFrame pour éviter les GPU spikes
 */
export function useWindowResize(
  callback: (width: number, height: number) => void,
  throttleMs: number = 100
) {
  useEffect(() => {
    let ticking = false;
    let lastCallTime = 0;

    const handleResize = () => {
      const now = Date.now();
      
      if (!ticking && (now - lastCallTime) >= throttleMs) {
        window.requestAnimationFrame(() => {
          callback(window.innerWidth, window.innerHeight);
          ticking = false;
          lastCallTime = now;
        });
        ticking = true;
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [callback, throttleMs]);
}

