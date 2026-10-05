import type { SpyMissionType } from '@/core/types';

export interface EspionageModifierSource {
  kind: 'tech' | 'building' | 'nationalProject';
  id: string;
}

export interface EspionageModifierRow {
  source: EspionageModifierSource;
  side: 'offense' | 'defense'; // offense: your spies abroad; defense: enemy spies in your cities
  effect: 'missionSuccess' | 'detection';
  delta: number; // additive percentage points, e.g. -0.25
  condition?: 'targetIsCapital';
  /**
   * Optional mission scope (#1335). Absent means the row applies to every eligible
   * mission, preserving the pre-#1335 behavior. Present means it applies only when the
   * resolving mission is one of these. Data-driven: no mission-id branch in the
   * probability function.
   */
  missions?: readonly SpyMissionType[];
  label: string;
}

export const ESPIONAGE_MODIFIERS: EspionageModifierRow[] = [
  { source: { kind: 'tech', id: 'diplomatic-networks' }, side: 'offense', effect: 'missionSuccess', delta: 0.20, condition: 'targetIsCapital', label: 'Diplomatic Networks' },
  { source: { kind: 'tech', id: 'covert-operations' }, side: 'offense', effect: 'missionSuccess', delta: 0.15, label: 'Covert Operations' },
  { source: { kind: 'tech', id: 'political-intelligence' }, side: 'offense', effect: 'missionSuccess', delta: 0.10, label: 'Political Intelligence' },
  { source: { kind: 'tech', id: 'counter-espionage' }, side: 'defense', effect: 'missionSuccess', delta: -0.25, label: 'Counter-Espionage' },
  { source: { kind: 'tech', id: 'secret-police' }, side: 'defense', effect: 'missionSuccess', delta: -0.30, label: 'Secret Police' },
  { source: { kind: 'tech', id: 'secret-police' }, side: 'defense', effect: 'detection', delta: 0.10, label: 'Secret Police (detection)' },
  { source: { kind: 'tech', id: 'disinformation-bureau' }, side: 'defense', effect: 'missionSuccess', delta: -0.25, label: 'Disinformation Bureau' },
  { source: { kind: 'tech', id: 'counterintelligence' }, side: 'defense', effect: 'missionSuccess', delta: -0.30, label: 'Counterintelligence' },
  { source: { kind: 'tech', id: 'signals-intelligence' }, side: 'defense', effect: 'missionSuccess', delta: -0.20, label: 'Signals Intelligence' },
  { source: { kind: 'nationalProject', id: 'grand_cipher_bureau' }, side: 'offense', effect: 'missionSuccess', delta: 0.10, label: 'Grand Cipher Bureau' },
  { source: { kind: 'building', id: 'cyber_defense_center' }, side: 'defense', effect: 'missionSuccess', delta: -0.15, label: 'Cyber Defense Center' },
  // #1335: the Cyber Defense Center also hardens specifically against the passive
  // intelligence missions (satellite surveillance / signals intercept). Scoped so it
  // never bleeds into unrelated missions; the generic -0.15 row above still applies.
  { source: { kind: 'building', id: 'cyber_defense_center' }, side: 'defense', effect: 'missionSuccess', delta: -0.10, missions: ['satellite_surveillance', 'signals_intercept'], label: 'Cyber Defense Center (signals hardening)' },
];

export const ESPIONAGE_SUCCESS_CHANCE_MIN = 0.05;
export const ESPIONAGE_SUCCESS_CHANCE_MAX = 0.95;
