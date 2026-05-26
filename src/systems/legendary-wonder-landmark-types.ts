export const LEGENDARY_LANDMARK_FAMILIES = [
  'oracle',
  'waterworks',
  'spire',
  'archive',
  'garden',
  'foundry',
  'bastion',
  'observatory',
  'exchange',
  'hall',
  'gateway',
  'drydock',
  'signal',
  'laboratory',
  'network',
] as const;

export type LegendaryLandmarkFamily = typeof LEGENDARY_LANDMARK_FAMILIES[number];

export const LEGENDARY_LANDMARK_VARIANTS = ['standard', 'wide', 'tall', 'compact'] as const;
export type LegendaryLandmarkVariant = typeof LEGENDARY_LANDMARK_VARIANTS[number];

export const LEGENDARY_LANDMARK_MOTIFS = [
  'prophecy',
  'canal',
  'sun',
  'knowledge',
  'moon',
  'forge',
  'tide',
  'stars',
  'trade',
  'victory',
  'horizon',
  'shipwright',
  'signal',
  'atom',
  'network',
] as const;
export type LegendaryLandmarkMotif = typeof LEGENDARY_LANDMARK_MOTIFS[number];

export const LEGENDARY_LANDMARK_AURAS = ['none', 'dedicationGlow', 'civicAura', 'foundationPulse'] as const;
export type LegendaryLandmarkAura = typeof LEGENDARY_LANDMARK_AURAS[number];

export const LEGENDARY_LANDMARK_MOTIONS = ['none', 'pulse', 'glint', 'spark'] as const;
export type LegendaryLandmarkMotion = typeof LEGENDARY_LANDMARK_MOTIONS[number];

export const LEGENDARY_LANDMARK_GHOSTS = ['scaffold', 'foundation', 'outline'] as const;
export type LegendaryLandmarkGhost = typeof LEGENDARY_LANDMARK_GHOSTS[number];

export interface LegendaryWonderLandmarkMetadata {
  wonderId: string;
  family: LegendaryLandmarkFamily;
  variant: LegendaryLandmarkVariant;
  motif: LegendaryLandmarkMotif;
  palette: {
    base: string;
    accent: string;
    glow: string;
  };
  scale: number;
  aura: LegendaryLandmarkAura;
  motion: LegendaryLandmarkMotion;
  constructionGhost: LegendaryLandmarkGhost;
  assetKey?: string;
}

export type LegendaryWonderLandmarkRelationship = 'owned' | 'known-rival';
export type LegendaryWonderLandmarkState = 'completed' | 'under-construction';

export interface LegendaryWonderLandmarkView {
  wonderId: string;
  label: string;
  cityId: string;
  turnCompleted?: number;
  relationship: LegendaryWonderLandmarkRelationship;
  state: LegendaryWonderLandmarkState;
  metadata: LegendaryWonderLandmarkMetadata;
  progressRatio?: number;
}
