/** Resolves an app-relative public asset path (no leading slash) against the build's base: `/conquestoria/` on the web, `./` on Tauri. */
export function resolveAppAssetUrl(path: string): string {
  return `${import.meta.env?.BASE_URL ?? '/'}${path}`;
}
