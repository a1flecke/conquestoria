import type { HexCoord } from '@/core/types';

export interface PendingUnload {
  transportId: string;
  cargoUnitId: string;
}

let _pendingUnload: PendingUnload | null = null;
let _unloadRange: HexCoord[] = [];

export function getPendingUnload(): PendingUnload | null {
  return _pendingUnload;
}

export function getUnloadRange(): HexCoord[] {
  return _unloadRange;
}

export function setPendingUnload(p: PendingUnload, range: HexCoord[]): void {
  _pendingUnload = p;
  _unloadRange = range;
}

export function clearPendingUnload(): void {
  _pendingUnload = null;
  _unloadRange = [];
}
