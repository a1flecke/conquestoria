export const CODEX_TAGS = [
  'ancient',
  'archive',
  'aurora',
  'canyon',
  'cave',
  'coast',
  'culture',
  'defense',
  'desert',
  'discovery',
  'earth',
  'engineering',
  'faith',
  'fire',
  'food',
  'forest',
  'fossil',
  'gold',
  'healing',
  'ice',
  'industry',
  'knowledge',
  'light',
  'military',
  'modern',
  'mountain',
  'nature',
  'ocean',
  'production',
  'science',
  'sea',
  'sky',
  'space',
  'stone',
  'storm',
  'trade',
  'travel',
  'water',
] as const;

export type WonderCodexTag = typeof CODEX_TAGS[number];

export const CODEX_VISUAL_TONES = [
  'awe',
  'danger',
  'discovery',
  'ingenuity',
  'memory',
  'mystery',
  'prosperity',
  'reverence',
] as const;

export type WonderCodexVisualTone = typeof CODEX_VISUAL_TONES[number];

export const CODEX_SECTION_KINDS = [
  'campaign',
  'construction',
  'craft',
  'landscape',
  'legacy',
  'origin',
  'reward',
  'ritual',
] as const;

export type WonderCodexSectionKind = typeof CODEX_SECTION_KINDS[number];

export const CODEX_STATUS_HOOKS = [
  'legendary-host-city',
  'legendary-progress',
  'legendary-reward',
  'legendary-status',
  'natural-effect',
  'natural-location',
] as const;

export type WonderCodexStatusHook = typeof CODEX_STATUS_HOOKS[number];

export interface WonderCodexSection {
  kind: WonderCodexSectionKind;
  heading: string;
  body: string;
}

export interface WonderCodexContent {
  id: string;
  kind: 'natural' | 'legendary';
  title: string;
  subtitle: string;
  authoredLead: string;
  learningText: string;
  visualTone: WonderCodexVisualTone;
  tags: WonderCodexTag[];
  sections: WonderCodexSection[];
  statusHooks: WonderCodexStatusHook[];
  relatedSeedTags: WonderCodexTag[];
  factSourceIds: string[];
  imageSourceId: string;
}

export interface WonderCodexFactSource {
  id: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  notes: string;
}

export interface WonderCodexImageSource {
  id: string;
  title: string;
  sourceUrl: string;
  creator: string;
  license: string;
  attribution: string;
  localPath: string;
}

export type WonderCodexVideoSurface = 'codex' | 'natural-reveal' | 'legendary-completion';

export type WonderCodexVideoBatchId = 'stage-3-spike' | 'stage-3b-batch-2' | 'stage-3c-batch-3';

export interface WonderCodexVideoSource {
  id: string;
  wonderId: string;
  title: string;
  surfaces: WonderCodexVideoSurface[];
  sourceUrl: string;
  creator: string;
  license: string;
  attribution: string;
  localPath: string;
  fallbackImageSourceId: string;
  durationSeconds: number;
  sizeBytes: number;
  format: string;
  mimeType: string;
  loopNote: string;
  audio: 'silent';
  batchId: WonderCodexVideoBatchId;
  sfxCueId?: string;
}
