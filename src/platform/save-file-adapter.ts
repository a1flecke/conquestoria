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
