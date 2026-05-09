import { isTauriDistribution } from './distribution';
import { createBrowserSaveFileAdapter } from './browser-save-file-adapter';

export type SaveFileWriteResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type SaveFileReadResult =
  | { status: 'success'; text: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface SaveFileAdapter {
  exportText(filename: string, text: string): Promise<SaveFileWriteResult>;
  importText(): Promise<SaveFileReadResult>;
}

export async function getSaveFileAdapter(): Promise<SaveFileAdapter> {
  if (isTauriDistribution()) {
    const { createTauriSaveFileAdapter } = await import('./tauri-save-file-adapter');
    return createTauriSaveFileAdapter();
  }

  return createBrowserSaveFileAdapter();
}
