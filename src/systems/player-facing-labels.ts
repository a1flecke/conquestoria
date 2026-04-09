export function formatCityReference(
  rawName: string,
  opts: { ownerName?: string; duplicateCount?: number },
): string {
  if ((opts.duplicateCount ?? 0) > 1 && opts.ownerName) {
    return `${rawName} (${opts.ownerName})`;
  }

  return rawName;
}
