import { describe, expect, it } from 'vitest';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import {
  getLegendaryWonderLandmarkMetadata,
  getLegendaryWonderLandmarkMetadataCatalog,
} from '@/systems/legendary-wonder-landmark-catalog';
import {
  validateLegendaryWonderLandmarkCatalog,
  validateLegendaryWonderLandmarkRendererSupport,
} from '@/systems/legendary-wonder-landmark-validation';
import {
  CANVAS_LEGENDARY_LANDMARK_AURAS,
  CANVAS_LEGENDARY_LANDMARK_FAMILIES,
  CANVAS_LEGENDARY_LANDMARK_GHOSTS,
  CANVAS_LEGENDARY_LANDMARK_MOTIFS,
  CANVAS_LEGENDARY_LANDMARK_MOTIONS,
  CANVAS_LEGENDARY_LANDMARK_VARIANTS,
} from '@/renderer/wonders/legendary-wonder-renderer';
import {
  SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS,
} from '@/renderer/wonders/legendary-wonder-bespoke-assets';

describe('legendary wonder landmark catalog', () => {
  it('has explicit metadata for every current legendary wonder and no extras', () => {
    const definitionIds = getLegendaryWonderDefinitions().map(definition => definition.id).sort();
    const metadataIds = getLegendaryWonderLandmarkMetadataCatalog().map(entry => entry.wonderId).sort();

    expect(metadataIds).toEqual(definitionIds);
    expect(validateLegendaryWonderLandmarkCatalog()).toEqual([]);
  });

  it('does not use hash-based landmark identity for known legendary wonders', () => {
    const oracle = getLegendaryWonderLandmarkMetadata('oracle-of-delphi');
    const canal = getLegendaryWonderLandmarkMetadata('grand-canal');

    expect(oracle.family).toBe('oracle');
    expect(canal.family).toBe('waterworks');
    expect(getWonderVisualDefinition('oracle-of-delphi').legendaryLandmark).toBe(oracle.family);
    expect(getWonderVisualDefinition('grand-canal').legendaryLandmark).toBe(canal.family);
  });

  it('declares only renderer-supported family, variant, motif, aura, motion, and ghost tokens', () => {
    expect(validateLegendaryWonderLandmarkRendererSupport({
      families: CANVAS_LEGENDARY_LANDMARK_FAMILIES,
      variants: CANVAS_LEGENDARY_LANDMARK_VARIANTS,
      motifs: CANVAS_LEGENDARY_LANDMARK_MOTIFS,
      auras: CANVAS_LEGENDARY_LANDMARK_AURAS,
      motions: CANVAS_LEGENDARY_LANDMARK_MOTIONS,
      ghosts: CANVAS_LEGENDARY_LANDMARK_GHOSTS,
    })).toEqual([]);
  });

  it('authors first-slice bespoke asset keys only for approved Stage 2I wonders', () => {
    expect(getLegendaryWonderLandmarkMetadata('oracle-of-delphi').assetKey).toBe('oracle-of-delphi-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('grand-canal').assetKey).toBe('grand-canal-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('sun-spire').assetKey).toBe('sun-spire-bespoke');

    const keyed = getLegendaryWonderLandmarkMetadataCatalog()
      .filter(entry => entry.assetKey)
      .map(entry => [entry.wonderId, entry.assetKey] as const);

    expect(keyed).toEqual([
      ['oracle-of-delphi', 'oracle-of-delphi-bespoke'],
      ['grand-canal', 'grand-canal-bespoke'],
      ['sun-spire', 'sun-spire-bespoke'],
    ]);
  });

  it('does not author unsupported bespoke landmark asset keys', () => {
    const supported = new Set<string>(SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS);
    const unsupported = getLegendaryWonderLandmarkMetadataCatalog()
      .filter(entry => entry.assetKey && !supported.has(entry.assetKey))
      .map(entry => `${entry.wonderId}:${entry.assetKey}`);

    expect(unsupported).toEqual([]);
  });
});
