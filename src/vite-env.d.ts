/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONQUESTORIA_DISTRIBUTION?: 'web' | 'tauri';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
