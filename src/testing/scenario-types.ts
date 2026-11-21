/**
 * Canonical scenario representation (#846). A ScenarioDefinition never carries
 * raw partial GameState. The scenario builder and its steps use the same
 * construction rules as gameplay. See docs/superpowers/specs/
 * 2026-08-16-issue-846-scenario-infrastructure-design.md for the full design.
 */
import type { City, GameState, HexCoord, HexTile, HotSeatConfig, SoloSetupConfig, Unit, UnitType } from '@/core/types';
import type { TreatyType } from '@/core/types/diplomacy';

export type ScenarioState = GameState;

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
  | GoldStep
  | { readonly kind: 'freight-replay'; readonly shortDetour: boolean };

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
