import type { LegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-types';

/*
 * Legendary landmark authoring guide:
 * - Add exactly one metadata entry for each legendary wonder definition.
 * - Do not use hash/random assignment for known wonders.
 * - Pick domain tokens from legendary-wonder-landmark-types.ts only.
 * - Keep this catalog presentation-only: no rewards, costs, requirements, quests, or AI values.
 * - For future bespoke art, add assetKey only after a renderer/asset registry supports it.
 * - Run tests/systems/legendary-wonder-landmark-catalog.test.ts before merge.
 */
const LEGENDARY_WONDER_LANDMARK_METADATA: Record<string, LegendaryWonderLandmarkMetadata> = {
  'oracle-of-delphi': landmark('oracle-of-delphi', 'oracle', 'tall', 'prophecy', '#2f2943', '#d8c47a', '#fff0b8', 1.02, 'dedicationGlow', 'glint', 'outline', 'oracle-of-delphi-bespoke'),
  'grand-canal': landmark('grand-canal', 'waterworks', 'wide', 'canal', '#173c52', '#74d0ff', '#c8f3ff', 1.05, 'civicAura', 'pulse', 'foundation', 'grand-canal-bespoke'),
  'sun-spire': landmark('sun-spire', 'spire', 'tall', 'sun', '#46311f', '#f2c45d', '#fff1a6', 1.08, 'dedicationGlow', 'glint', 'scaffold', 'sun-spire-bespoke'),
  'world-archive': landmark('world-archive', 'archive', 'wide', 'knowledge', '#263044', '#b9c7ff', '#edf0ff', 1, 'civicAura', 'pulse', 'outline', 'world-archive-bespoke'),
  'moonwell-gardens': landmark('moonwell-gardens', 'garden', 'wide', 'moon', '#203b34', '#9fd7a0', '#def7bf', 1, 'civicAura', 'spark', 'foundation'),
  'ironroot-foundry': landmark('ironroot-foundry', 'foundry', 'compact', 'forge', '#3a2b26', '#e08b52', '#ffd2a0', 1.04, 'foundationPulse', 'pulse', 'scaffold'),
  'tidecaller-bastion': landmark('tidecaller-bastion', 'bastion', 'wide', 'tide', '#18364b', '#7ec7e8', '#cff5ff', 1.03, 'civicAura', 'glint', 'outline'),
  'starvault-observatory': landmark('starvault-observatory', 'observatory', 'tall', 'stars', '#252d4d', '#a8b9ff', '#f1f4ff', 1.06, 'dedicationGlow', 'spark', 'scaffold', 'starvault-observatory-bespoke'),
  'whispering-exchange': landmark('whispering-exchange', 'exchange', 'wide', 'trade', '#342c3f', '#e0bc72', '#fff0c4', 0.98, 'civicAura', 'glint', 'foundation'),
  'hall-of-champions': landmark('hall-of-champions', 'hall', 'wide', 'victory', '#3a2931', '#e4aa62', '#ffe0a8', 1.03, 'dedicationGlow', 'pulse', 'outline'),
  'gate-of-the-world': landmark('gate-of-the-world', 'gateway', 'wide', 'horizon', '#24364a', '#9fd3e8', '#e0f8ff', 1.06, 'civicAura', 'glint', 'scaffold'),
  'leviathan-drydock': landmark('leviathan-drydock', 'drydock', 'wide', 'shipwright', '#23384d', '#80bfe2', '#c8eeff', 1.06, 'foundationPulse', 'pulse', 'foundation'),
  'storm-signal-spire': landmark('storm-signal-spire', 'signal', 'tall', 'signal', '#202943', '#b7c7ff', '#f1f5ff', 1.08, 'dedicationGlow', 'spark', 'scaffold', 'storm-signal-spire-bespoke'),
  'manhattan-project': landmark('manhattan-project', 'laboratory', 'compact', 'atom', '#31313c', '#d2d8e8', '#ffffff', 1, 'foundationPulse', 'pulse', 'outline'),
  internet: landmark('internet', 'network', 'wide', 'network', '#202c3d', '#80d8ff', '#d9f8ff', 0.98, 'civicAura', 'spark', 'foundation', 'internet-bespoke'),
};

function landmark(
  wonderId: string,
  family: LegendaryWonderLandmarkMetadata['family'],
  variant: LegendaryWonderLandmarkMetadata['variant'],
  motif: LegendaryWonderLandmarkMetadata['motif'],
  base: string,
  accent: string,
  glow: string,
  scale: number,
  aura: LegendaryWonderLandmarkMetadata['aura'],
  motion: LegendaryWonderLandmarkMetadata['motion'],
  constructionGhost: LegendaryWonderLandmarkMetadata['constructionGhost'],
  assetKey?: string,
): LegendaryWonderLandmarkMetadata {
  return {
    wonderId,
    family,
    variant,
    motif,
    palette: { base, accent, glow },
    scale,
    aura,
    motion,
    constructionGhost,
    ...(assetKey ? { assetKey } : {}),
  };
}

export function getLegendaryWonderLandmarkMetadata(wonderId: string): LegendaryWonderLandmarkMetadata {
  const metadata = LEGENDARY_WONDER_LANDMARK_METADATA[wonderId];
  if (metadata) return { ...metadata, palette: { ...metadata.palette } };
  return landmark(wonderId, 'spire', 'standard', 'knowledge', '#2b2633', '#e8c170', '#fff0b8', 1, 'none', 'none', 'outline');
}

export function getLegendaryWonderLandmarkMetadataCatalog(): LegendaryWonderLandmarkMetadata[] {
  return Object.values(LEGENDARY_WONDER_LANDMARK_METADATA).map(metadata => ({
    ...metadata,
    palette: { ...metadata.palette },
  }));
}
