// Minimal shims to allow compiling WebView stubs without installing React/Zustand.
// These are intentionally lightweight and only cover the symbols used in this scaffold.
declare module 'react' {
  export type ReactNode = any;
  export type FC<P = {}> = (props: P & { children?: ReactNode }) => any;
  export function useState<T>(initial: T): [T, (value: T) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useRef<T>(value: T): { current: T };
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: any[]): T;
  export const Fragment: any;
  const React: any;
  export default React;
}

declare module 'react-dom' {
  const ReactDOM: any;
  export default ReactDOM;
}

declare module 'zustand' {
  export function create<T>(initializer: any): any;
}

declare const window: any;
declare const document: any;
declare const navigator: any;

