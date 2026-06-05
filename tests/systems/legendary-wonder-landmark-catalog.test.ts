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

  it('authors approved bespoke asset keys only for completed Stage 2I slices', () => {
    expect(getLegendaryWonderLandmarkMetadata('oracle-of-delphi').assetKey).toBe('oracle-of-delphi-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('grand-canal').assetKey).toBe('grand-canal-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('sun-spire').assetKey).toBe('sun-spire-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('world-archive').assetKey).toBe('world-archive-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('starvault-observatory').assetKey).toBe('starvault-observatory-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('storm-signal-spire').assetKey).toBe('storm-signal-spire-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('internet').assetKey).toBe('internet-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('moonwell-gardens').assetKey).toBe('moonwell-gardens-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('ironroot-foundry').assetKey).toBe('ironroot-foundry-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('tidecaller-bastion').assetKey).toBe('tidecaller-bastion-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('leviathan-drydock').assetKey).toBe('leviathan-drydock-bespoke');

    const keyed = getLegendaryWonderLandmarkMetadataCatalog()
      .filter(entry => entry.assetKey)
      .map(entry => [entry.wonderId, entry.assetKey] as const);

    expect(keyed).toEqual([
      ['oracle-of-delphi', 'oracle-of-delphi-bespoke'],
      ['grand-canal', 'grand-canal-bespoke'],
      ['sun-spire', 'sun-spire-bespoke'],
      ['world-archive', 'world-archive-bespoke'],
      ['starvault-observatory', 'starvault-observatory-bespoke'],
      ['storm-signal-spire', 'storm-signal-spire-bespoke'],
      ['internet', 'internet-bespoke'],
      ['moonwell-gardens', 'moonwell-gardens-bespoke'],
      ['ironroot-foundry', 'ironroot-foundry-bespoke'],
      ['tidecaller-bastion', 'tidecaller-bastion-bespoke'],
      ['leviathan-drydock', 'leviathan-drydock-bespoke'],
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
