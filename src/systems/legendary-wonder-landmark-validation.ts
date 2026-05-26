import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderLandmarkMetadataCatalog } from '@/systems/legendary-wonder-landmark-catalog';
import {
  LEGENDARY_LANDMARK_AURAS,
  LEGENDARY_LANDMARK_FAMILIES,
  LEGENDARY_LANDMARK_GHOSTS,
  LEGENDARY_LANDMARK_MOTIFS,
  LEGENDARY_LANDMARK_MOTIONS,
  LEGENDARY_LANDMARK_VARIANTS,
} from '@/systems/legendary-wonder-landmark-types';

function missing(expected: string[], actual: string[], label: string): string[] {
  return expected.filter(value => !actual.includes(value)).map(value => `Missing ${label}: ${value}`);
}

function unknown(actual: string[], expected: string[], label: string): string[] {
  return actual.filter(value => !expected.includes(value)).map(value => `Unknown ${label}: ${value}`);
}

export function validateLegendaryWonderLandmarkCatalog(): string[] {
  const definitionIds = getLegendaryWonderDefinitions().map(definition => definition.id);
  const metadata = getLegendaryWonderLandmarkMetadataCatalog();
  const metadataIds = metadata.map(entry => entry.wonderId);
  const duplicateIds = metadataIds.filter((id, index) => metadataIds.indexOf(id) !== index);
  const issues = [
    ...missing(definitionIds, metadataIds, 'legendary landmark metadata'),
    ...unknown(metadataIds, definitionIds, 'legendary landmark metadata'),
    ...duplicateIds.map(id => `Duplicate legendary landmark metadata: ${id}`),
  ];

  for (const entry of metadata) {
    if (!LEGENDARY_LANDMARK_FAMILIES.includes(entry.family)) issues.push(`Unknown family: ${entry.family}`);
    if (!LEGENDARY_LANDMARK_VARIANTS.includes(entry.variant)) issues.push(`Unknown variant: ${entry.variant}`);
    if (!LEGENDARY_LANDMARK_MOTIFS.includes(entry.motif)) issues.push(`Unknown motif: ${entry.motif}`);
    if (!LEGENDARY_LANDMARK_AURAS.includes(entry.aura)) issues.push(`Unknown aura: ${entry.aura}`);
    if (!LEGENDARY_LANDMARK_MOTIONS.includes(entry.motion)) issues.push(`Unknown motion: ${entry.motion}`);
    if (!LEGENDARY_LANDMARK_GHOSTS.includes(entry.constructionGhost)) issues.push(`Unknown ghost: ${entry.constructionGhost}`);
    if (entry.scale <= 0) issues.push(`Invalid scale: ${entry.wonderId}`);
  }
  return issues;
}

export function validateLegendaryWonderLandmarkRendererSupport(support: {
  families: readonly string[];
  variants: readonly string[];
  motifs: readonly string[];
  auras: readonly string[];
  motions: readonly string[];
  ghosts: readonly string[];
}): string[] {
  return [
    ...missing([...LEGENDARY_LANDMARK_FAMILIES], [...support.families], 'canvas family support'),
    ...missing([...LEGENDARY_LANDMARK_VARIANTS], [...support.variants], 'canvas variant support'),
    ...missing([...LEGENDARY_LANDMARK_MOTIFS], [...support.motifs], 'canvas motif support'),
    ...missing([...LEGENDARY_LANDMARK_AURAS], [...support.auras], 'canvas aura support'),
    ...missing([...LEGENDARY_LANDMARK_MOTIONS], [...support.motions], 'canvas motion support'),
    ...missing([...LEGENDARY_LANDMARK_GHOSTS], [...support.ghosts], 'canvas ghost support'),
  ];
}
