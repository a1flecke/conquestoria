// Dev JSX runtime — vitest uses this in development mode.
// Delegates to the same string serializer as jsx-runtime.
export { jsx as jsxDEV, jsx, jsxs, Fragment } from './jsx-runtime';
export type { JSX } from './jsx-runtime';
