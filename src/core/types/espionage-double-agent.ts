// Double-agent report bookkeeping. Leaf: imports nothing; persisted on the spy record (`Spy.falseReports`).

export type FalseReportKind = 'troops' | 'intel' | 'resources' | 'diplomacy' | 'signals';

/** One report a turned spy falsified: the report map it lives in, its key there, and the turn it was written. */
export interface FalseReportRef {
  kind: FalseReportKind;
  key: string;
  turn: number;
}
