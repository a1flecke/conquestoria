import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { SaveFileAdapter, SaveFileReadResult, SaveFileWriteResult } from './save-file-adapter';

const SAVE_FILTER = [{ name: 'Conquestoria Save', extensions: ['json'] }];

export function createTauriSaveFileAdapter(): SaveFileAdapter {
  return {
    async exportText(filename: string, text: string): Promise<SaveFileWriteResult> {
      try {
        const selectedPath = await save({
          defaultPath: filename,
          filters: SAVE_FILTER,
        });
        if (!selectedPath) {
          return { status: 'cancelled' };
        }

        await writeTextFile(selectedPath, text);
        return { status: 'success' };
      } catch {
        return { status: 'error', message: 'Save file could not be written.' };
      }
    },

    async importText(): Promise<SaveFileReadResult> {
      try {
        const selectedPath = await open({
          multiple: false,
          directory: false,
          filters: SAVE_FILTER,
        });
        if (!selectedPath || Array.isArray(selectedPath)) {
          return { status: 'cancelled' };
        }

        const text = await readTextFile(selectedPath);
        return { status: 'success', text };
      } catch {
        return { status: 'error', message: 'Save file could not be read.' };
      }
    },
  };
}
