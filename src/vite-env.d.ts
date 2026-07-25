/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONQUESTORIA_DISTRIBUTION?: 'web' | 'tauri';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __CONQUESTORIA_E2E_DIAGNOSTICS__?: import('@/testing/e2e-runtime').E2EDiagnostics;
  __CONQUESTORIA_E2E_GET_VISIBLE_HEX_COPIES__?: (
    coord: import('@/core/types').HexCoord,
  ) => Array<{ x: number; y: number }>;
}
