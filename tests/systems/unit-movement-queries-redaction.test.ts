import { describe, it, expect } from 'vitest';
import { redactMovementRejectionForViewer } from '@/systems/unit-movement-queries';

describe('#1025 MR4 — viewer redaction', () => {
  const specific = { code: 'impassable-water' as const, message: 'Land units cannot cross water yet.' };

  it('redacts any reason to the generic one when the destination is unexplored', () => {
    expect(redactMovementRejectionForViewer(specific, 'unexplored'))
      .toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
  });

  it('passes the reason through unchanged when the destination is explored', () => {
    // VisibilityState is 'unexplored' | 'fog' | 'visible' (src/core/types.ts:431) —
    // there is no 'fogged'.
    expect(redactMovementRejectionForViewer(specific, 'visible')).toEqual(specific);
    expect(redactMovementRejectionForViewer(specific, 'fog')).toEqual(specific);
  });

  it('passes through when the viewer supplied no visibility', () => {
    expect(redactMovementRejectionForViewer(specific, undefined)).toEqual(specific);
  });
});
