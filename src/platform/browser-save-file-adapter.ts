import type { SaveFileAdapter, SaveFileReadResult, SaveFileWriteResult } from './save-file-adapter';

export function createBrowserSaveFileAdapter(documentRef: Document = document): SaveFileAdapter {
  return {
    async exportText(filename: string, text: string): Promise<SaveFileWriteResult> {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = documentRef.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return { status: 'success' };
    },

    async importText(): Promise<SaveFileReadResult> {
      return new Promise(resolve => {
        const input = documentRef.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) {
            resolve({ status: 'cancelled' });
            return;
          }

          const reader = new FileReader();
          reader.onload = event => {
            resolve({ status: 'success', text: String(event.target?.result ?? '') });
          };
          reader.onerror = () => {
            resolve({ status: 'error', message: 'Save file could not be read.' });
          };
          reader.readAsText(file);
        }, { once: true });
        input.click();
      });
    },
  };
}
