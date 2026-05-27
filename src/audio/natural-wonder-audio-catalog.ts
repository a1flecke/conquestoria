import type { LoopPoints } from './audio-catalog';
import { WONDER_DEFINITIONS } from '@/systems/wonder-definitions';
import { getWonderSpectacleRecipe } from '@/systems/wonder-spectacle/presentation';
import type { WonderSpectacleSoundMood } from '@/systems/wonder-spectacle/types';

export type NaturalWonderAudioStatus = 'complete' | 'pending';
export type NaturalWonderSoundMood = WonderSpectacleSoundMood;

export interface NaturalWonderAudioClip {
  id: string;
  file: string;
  sourceId: string;
  gain: number;
}

export interface NaturalWonderAmbientLoopClip extends NaturalWonderAudioClip {
  loop: LoopPoints;
  fadeInMs: number;
  fadeOutMs: number;
  mapFocusTimeoutMs: number;
}

export interface CompleteNaturalWonderAudioEntry {
  wonderId: string;
  status: 'complete';
  soundMood: NaturalWonderSoundMood;
  stinger: NaturalWonderAudioClip;
  ambientLoop: NaturalWonderAmbientLoopClip;
}

export interface PendingNaturalWonderAudioEntry {
  wonderId: string;
  status: 'pending';
  soundMood: NaturalWonderSoundMood;
}

export type NaturalWonderAudioEntry = CompleteNaturalWonderAudioEntry | PendingNaturalWonderAudioEntry;

export const FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false;
export const MR1_NATURAL_WONDER_AUDIO_IDS = ['great_volcano', 'ancient_forest', 'coral_reef'] as const;

const COMPLETE_ENTRIES: Record<(typeof MR1_NATURAL_WONDER_AUDIO_IDS)[number], CompleteNaturalWonderAudioEntry> = {
  great_volcano: {
    wonderId: 'great_volcano',
    status: 'complete',
    soundMood: 'volcanic-breath',
    stinger: {
      id: 'great-volcano-stinger',
      file: 'audio/wonders/great-volcano-stinger.ogg',
      sourceId: 'soundimage-underwater-rumble',
      gain: 0.82,
    },
    ambientLoop: {
      id: 'great-volcano-ambient',
      file: 'audio/wonders/great-volcano-ambient.ogg',
      sourceId: 'soundimage-quiet-tension-looping',
      gain: 0.30,
      loop: { loopStart: 0, loopEnd: 84.0 },
      fadeInMs: 650,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
  ancient_forest: {
    wonderId: 'ancient_forest',
    status: 'complete',
    soundMood: 'forest-whisper',
    stinger: {
      id: 'ancient-forest-stinger',
      file: 'audio/wonders/ancient-forest-stinger.ogg',
      sourceId: 'soundimage-morning-dew',
      gain: 0.72,
    },
    ambientLoop: {
      id: 'ancient-forest-ambient',
      file: 'audio/wonders/ancient-forest-ambient.ogg',
      sourceId: 'soundimage-sunrise-looping',
      gain: 0.28,
      loop: { loopStart: 0, loopEnd: 64.8 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
  coral_reef: {
    wonderId: 'coral_reef',
    status: 'complete',
    soundMood: 'reef-glimmer',
    stinger: {
      id: 'coral-reef-stinger',
      file: 'audio/wonders/coral-reef-stinger.ogg',
      sourceId: 'soundimage-life-in-a-drop',
      gain: 0.72,
    },
    ambientLoop: {
      id: 'coral-reef-ambient',
      file: 'audio/wonders/coral-reef-ambient.ogg',
      sourceId: 'soundimage-underwater-world-looping',
      gain: 0.30,
      loop: { loopStart: 0, loopEnd: 20.0 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
};

function soundMoodFor(wonderId: string): NaturalWonderSoundMood {
  const recipe = getWonderSpectacleRecipe(wonderId);
  if (!recipe) throw new Error(`Missing natural wonder spectacle recipe for ${wonderId}`);
  return recipe.soundMood;
}

function cloneEntry(entry: NaturalWonderAudioEntry): NaturalWonderAudioEntry {
  if (entry.status === 'pending') return { ...entry };
  return {
    ...entry,
    stinger: { ...entry.stinger },
    ambientLoop: { ...entry.ambientLoop, loop: { ...entry.ambientLoop.loop } },
  };
}

export function getNaturalWonderAudioCatalog(): NaturalWonderAudioEntry[] {
  return WONDER_DEFINITIONS.map(definition => {
    const complete = COMPLETE_ENTRIES[definition.id as keyof typeof COMPLETE_ENTRIES];
    return cloneEntry(complete ?? {
      wonderId: definition.id,
      status: 'pending',
      soundMood: soundMoodFor(definition.id),
    });
  });
}

export function getNaturalWonderAudioEntry(wonderId: string): NaturalWonderAudioEntry | null {
  return getNaturalWonderAudioCatalog().find(entry => entry.wonderId === wonderId) ?? null;
}

export function getCompleteNaturalWonderAudioEntry(wonderId: string): CompleteNaturalWonderAudioEntry | null {
  const entry = getNaturalWonderAudioEntry(wonderId);
  return entry?.status === 'complete' ? entry : null;
}
