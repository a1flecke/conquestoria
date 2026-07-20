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
  // Era 1-2 wonders (Dawn Age)
  'standing-stones': landmark('standing-stones', 'bastion', 'wide', 'prophecy', '#3a3830', '#c8b888', '#f0e8c8', 0.96, 'dedicationGlow', 'glint', 'outline', 'standing-stones-bespoke'),
  'great-pyramid': landmark('great-pyramid', 'spire', 'tall', 'sun', '#5e4a26', '#e0c068', '#fff0a0', 1.1, 'dedicationGlow', 'glint', 'scaffold', 'great-pyramid-bespoke'),
  'tidemother-colossus': landmark('tidemother-colossus', 'gateway', 'tall', 'tide', '#123448', '#5ec0d8', '#c8f0ff', 1.05, 'civicAura', 'pulse', 'foundation', 'tidemother-colossus-bespoke'),
  'oracle-of-delphi': landmark('oracle-of-delphi', 'oracle', 'tall', 'prophecy', '#2f2943', '#d8c47a', '#fff0b8', 1.02, 'dedicationGlow', 'glint', 'outline', 'oracle-of-delphi-bespoke'),
  'grand-canal': landmark('grand-canal', 'waterworks', 'wide', 'canal', '#173c52', '#74d0ff', '#c8f3ff', 1.05, 'civicAura', 'pulse', 'foundation', 'grand-canal-bespoke'),
  'sun-spire': landmark('sun-spire', 'spire', 'tall', 'sun', '#46311f', '#f2c45d', '#fff1a6', 1.08, 'dedicationGlow', 'glint', 'scaffold', 'sun-spire-bespoke'),
  'world-archive': landmark('world-archive', 'archive', 'wide', 'knowledge', '#263044', '#b9c7ff', '#edf0ff', 1, 'civicAura', 'pulse', 'outline', 'world-archive-bespoke'),
  'moonwell-gardens': landmark('moonwell-gardens', 'garden', 'wide', 'moon', '#203b34', '#9fd7a0', '#def7bf', 1, 'civicAura', 'spark', 'foundation', 'moonwell-gardens-bespoke'),
  'ironroot-foundry': landmark('ironroot-foundry', 'foundry', 'compact', 'forge', '#3a2b26', '#e08b52', '#ffd2a0', 1.04, 'foundationPulse', 'pulse', 'scaffold', 'ironroot-foundry-bespoke'),
  'tidecaller-bastion': landmark('tidecaller-bastion', 'bastion', 'wide', 'tide', '#18364b', '#7ec7e8', '#cff5ff', 1.03, 'civicAura', 'glint', 'outline', 'tidecaller-bastion-bespoke'),
  'starvault-observatory': landmark('starvault-observatory', 'observatory', 'tall', 'stars', '#252d4d', '#a8b9ff', '#f1f4ff', 1.06, 'dedicationGlow', 'spark', 'scaffold', 'starvault-observatory-bespoke'),
  'whispering-exchange': landmark('whispering-exchange', 'exchange', 'wide', 'trade', '#342c3f', '#e0bc72', '#fff0c4', 0.98, 'civicAura', 'glint', 'foundation', 'whispering-exchange-bespoke'),
  'hall-of-champions': landmark('hall-of-champions', 'hall', 'wide', 'victory', '#3a2931', '#e4aa62', '#ffe0a8', 1.03, 'dedicationGlow', 'pulse', 'outline', 'hall-of-champions-bespoke'),
  'gate-of-the-world': landmark('gate-of-the-world', 'gateway', 'wide', 'horizon', '#24364a', '#9fd3e8', '#e0f8ff', 1.06, 'civicAura', 'glint', 'scaffold', 'gate-of-the-world-bespoke'),
  'leviathan-drydock': landmark('leviathan-drydock', 'drydock', 'wide', 'shipwright', '#23384d', '#80bfe2', '#c8eeff', 1.06, 'foundationPulse', 'pulse', 'foundation', 'leviathan-drydock-bespoke'),
  'storm-signal-spire': landmark('storm-signal-spire', 'signal', 'tall', 'signal', '#202943', '#b7c7ff', '#f1f5ff', 1.08, 'dedicationGlow', 'spark', 'scaffold', 'storm-signal-spire-bespoke'),
  'manhattan-project': landmark('manhattan-project', 'laboratory', 'compact', 'atom', '#31313c', '#d2d8e8', '#ffffff', 1, 'foundationPulse', 'pulse', 'outline', 'manhattan-project-bespoke'),
  internet: landmark('internet', 'network', 'wide', 'network', '#202c3d', '#80d8ff', '#d9f8ff', 0.98, 'civicAura', 'spark', 'foundation', 'internet-bespoke'),
  // Era 5 wonders (Renaissance)
  'sistine-vault': landmark('sistine-vault', 'archive', 'tall', 'knowledge', '#3d2c1e', '#d4a96a', '#fff0c8', 1.03, 'dedicationGlow', 'glint', 'scaffold', 'sistine-vault-bespoke'),
  'codex-eternal': landmark('codex-eternal', 'archive', 'wide', 'knowledge', '#242d4a', '#a0b0e8', '#e8eeff', 1.0, 'civicAura', 'pulse', 'outline', 'codex-eternal-bespoke'),
  'navigators-compass': landmark('navigators-compass', 'gateway', 'wide', 'horizon', '#1a3346', '#7ecae0', '#c4f0ff', 1.05, 'civicAura', 'glint', 'foundation', 'navigators-compass-bespoke'),
  // Era 6 wonders (Gunpowder Age)
  'palace-of-the-sun': landmark('palace-of-the-sun', 'hall', 'tall', 'sun', '#5e3000', '#f0c040', '#fff8c0', 1.08, 'dedicationGlow', 'glint', 'scaffold', 'palace-of-the-sun-bespoke'),
  'iron-arsenal': landmark('iron-arsenal', 'bastion', 'wide', 'forge', '#2a2a2a', '#b05020', '#f0905a', 1.05, 'civicAura', 'spark', 'outline', 'iron-arsenal-bespoke'),
  'merchant-admiralty': landmark('merchant-admiralty', 'drydock', 'wide', 'horizon', '#0a2a4a', '#40a0d8', '#b8e8ff', 1.05, 'civicAura', 'glint', 'foundation', 'merchant-admiralty-bespoke'),
  // Era 7 wonders (Industrial Revolution)
  'crystal-palace': landmark('crystal-palace', 'hall', 'wide', 'knowledge', '#2d3f5a', '#8ecfff', '#f0f8ff', 1.05, 'dedicationGlow', 'glint', 'scaffold', 'crystal-palace-bespoke'),
  'suez-canal': landmark('suez-canal', 'waterworks', 'wide', 'canal', '#c4a47a', '#3da0d0', '#b8e8ff', 1.06, 'civicAura', 'glint', 'foundation', 'suez-canal-bespoke'),
  'continental-congress': landmark('continental-congress', 'archive', 'wide', 'knowledge', '#3d2820', '#d4a86a', '#fff0c8', 1.0, 'civicAura', 'pulse', 'outline', 'continental-congress-bespoke'),
  // Era 8 wonders (Nationalist Era)
  'eiffel-tower': landmark('eiffel-tower', 'spire', 'wide', 'trade', '#5a4830', '#c8a44a', '#fff4c8', 1.08, 'dedicationGlow', 'glint', 'scaffold', 'eiffel-tower-bespoke'),
  'brooklyn-bridge': landmark('brooklyn-bridge', 'gateway', 'wide', 'trade', '#2a3a4a', '#6080a0', '#c8dce8', 1.05, 'foundationPulse', 'pulse', 'foundation', 'brooklyn-bridge-bespoke'),
  'trans-siberian-railway': landmark('trans-siberian-railway', 'network', 'wide', 'trade', '#2a3020', '#889860', '#d8e0b0', 1.0, 'civicAura', 'pulse', 'outline', 'trans-siberian-railway-bespoke'),
  // Era 9 wonders (Modern Era)
  'panama-canal':          landmark('panama-canal',          'waterworks', 'wide', 'canal',     '#1a3a1a', '#3da0d0', '#b8e8ff', 1.06, 'civicAura',     'glint', 'foundation', 'panama-canal-bespoke'),
  'empire-state-building': landmark('empire-state-building', 'spire',      'wide', 'trade',     '#2a2030', '#c09840', '#fff0c0', 1.1,  'dedicationGlow','glint', 'scaffold',   'empire-state-building-bespoke'),
  'hoover-dam':            landmark('hoover-dam',            'bastion',    'wide', 'tide',      '#3a3020', '#a07840', '#e0d0b0', 1.05, 'foundationPulse','pulse','foundation', 'hoover-dam-bespoke'),
  'wright-flyer':          landmark('wright-flyer',          'bastion',    'wide', 'trade',     '#3a3828', '#c8b860', '#fff8d0', 1.04, 'dedicationGlow', 'glint','scaffold',   'wright-flyer-bespoke'),
  'united-nations':        landmark('united-nations',        'hall',       'wide', 'horizon',   '#1a2a3a', '#4080c0', '#c0d8f0', 1.06, 'civicAura',      'glint','scaffold',   'united-nations-bespoke'),
  'apollo-program':        landmark('apollo-program',        'spire',      'wide', 'cosmos',    '#0a0a1a', '#c0c8e0', '#ffffff', 1.12, 'dedicationGlow', 'glint','scaffold',   'apollo-program-bespoke'),
  // Era 13 wonders (Autonomy Age)
  'open-intelligence-commons': landmark('open-intelligence-commons', 'network', 'wide', 'network', '#172a36', '#79d8d0', '#e4fff9', 1.06, 'civicAura', 'spark', 'foundation', 'open-intelligence-commons-bespoke'),
  'lunar-gateway': landmark('lunar-gateway', 'gateway', 'tall', 'cosmos', '#11182f', '#a9c4ff', '#f3f7ff', 1.10, 'dedicationGlow', 'glint', 'scaffold', 'lunar-gateway-bespoke'),
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
