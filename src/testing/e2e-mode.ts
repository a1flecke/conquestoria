/**
 * The direct browser-test entry point is deliberately narrower than a normal
 * development build: it is compiled only for Vite's e2e mode and needs this
 * exact opt-in query. Keeping this pure makes the security boundary testable.
 */
export function isExactAutosaveE2ERequest(mode: string, search: string): boolean {
  return mode === 'e2e' && search === '?e2e=autosave';
}
