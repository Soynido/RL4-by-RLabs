import { useStore } from '../state/store';

export function useTheme() {
  const state = useStore.getState();
  const setTheme = (t: 'ghost' | 'mint' | 'uv') => state.setTheme(t);
  return { theme: state.theme, setTheme };
}

