/**
 * Canonical scenario representation (#846). A ScenarioDefinition never carries
 * raw partial GameState -- every step maps 1:1 to a canonical system call in
 * scenario-builder.ts, so a scenario can never bypass the same construction
 * rules real gameplay uses. See docs/superpowers/specs/
 * 2026-08-16-issue-846-scenario-infrastructure-design.md for the full design.
 */
import type {
  City,
  HexCoord,
  HexTile,
  HotSeatConfig,
  SoloSetupConfig,
  TreatyType,
  Unit,
  UnitType,
} from '@/core/types';

export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

export interface TerrainStep {
  readonly kind: 'terrain';
  readonly position: HexCoord;
  readonly terrain: HexTile['terrain'];
}

export interface UnitStep {
  readonly kind: 'unit';
  readonly civId: string;
  readonly type: UnitType;
  readonly position: HexCoord;
  readonly overrides?: Partial<Unit>;
  /** Skip the "tile already occupied" guard -- for intentionally corrupt/edge-case scenarios. */
  readonly unsafe?: boolean;
}

export interface CityStep {
  readonly kind: 'city';
  readonly civId: string;
  readonly position: HexCoord;
  readonly overrides?: Partial<City>;
  readonly unsafe?: boolean;
}

export interface CampStep {
  readonly kind: 'camp';
  readonly position: HexCoord;
  readonly overrides?: Partial<{ strength: number; spawnCooldown: number; resurgent: boolean; banditLordName: string }>;
  readonly unsafe?: boolean;
}

export interface TechStep {
  readonly kind: 'tech';
  readonly civId: string;
  readonly techIds: readonly string[];
}

export interface DiplomacyStep {
  readonly kind: 'diplomacy';
  readonly civA: string;
  readonly civB: string;
  readonly status: 'war' | 'peace' | 'alliance';
}

export interface GoldStep {
  readonly kind: 'gold';
  readonly civId: string;
  readonly amount: number;
}

export type ScenarioStep =
  | TerrainStep
  | UnitStep
  | CityStep
  | CampStep
  | TechStep
  | DiplomacyStep
  | GoldStep;

export type ScenarioBase =
  | { readonly kind: 'solo'; readonly config: SoloSetupConfig }
  | { readonly kind: 'hotSeat'; readonly config: HotSeatConfig };

export interface ScenarioDefinition {
  readonly name: string;
  readonly description: string;
  readonly seed: string;
  readonly base: ScenarioBase;
  readonly steps: readonly ScenarioStep[];
}

/** TreatyType re-exported for callers building diplomacy assertions in tests. */
export type { TreatyType };
