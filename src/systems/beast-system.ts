import type { BeastHoardChoice, BeastId, BeastLair, BeastsMode, GameMap, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { applyResearchBonus } from '@/systems/tech-system';
import { BEAST_DEFINITIONS, getBeastDefinitionByUnitType, type BeastDefinition } from '@/systems/beast-definitions';
import { hexKey, mapDistance, mapNeighbors } from '@/systems/hex-utils';
import { createRng } from '@/systems/map-generator';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { VETERANCY_TIERS } from '@/systems/combat-reward-system';

export const BEAST_OWNER = 'beasts';

export const LAIR_COUNTS = { small: 3, medium: 5, large: 7 } as const;

const MIN_DISTANCE_FROM_START = 6;
const MIN_DISTANCE_BETWEEN_LAIRS = 5;

export function placeBeastLairs(
  map: GameMap,
  startPositions: HexCoord[],
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): Record<string, BeastLair> {
  const rng = createRng(seed + '-beasts');
  const budget = LAIR_COUNTS[mapSize];
  const lairs: Record<string, BeastLair> = {};
  const placed: HexCoord[] = [];

  // Deterministic beast order: shuffle the roster, then take up to budget
  const roster: BeastDefinition[] = Object.values(BEAST_DEFINITIONS);
  for (let i = roster.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roster[i], roster[j]] = [roster[j], roster[i]];
  }

  for (const def of roster) {
    if (placed.length >= budget) break;
    const candidates = Object.values(map.tiles).filter(tile =>
      def.habitatTerrains.includes(tile.terrain)
      && tile.wonder === null
      && startPositions.every(s => mapDistance(map, tile.coord, s) >= MIN_DISTANCE_FROM_START)
      && placed.every(p => mapDistance(map, tile.coord, p) >= MIN_DISTANCE_BETWEEN_LAIRS),
    );
    if (candidates.length === 0) continue;   // no valid habitat — skip this beast, never force-place
    const tile = candidates[Math.floor(rng() * candidates.length)];
    const lair: BeastLair = {
      id: `lair-${def.id}`,
      beastId: def.id,
      position: { ...tile.coord },
      status: 'dormant',
      strength: 0,
      unitIds: [],
    };
    lairs[lair.id] = lair;
    placed.push(tile.coord);
  }
  return lairs;
}

// ---- LCG for per-turn seeded randomness ----

function mixSeed(n: number): number {
  // MurmurHash3 finalizer — good avalanche for small integers like turn numbers
  let h = n ^ (n >>> 16);
  h = Math.imul(h, 0x85ebca6b);
  h = h ^ (h >>> 13);
  h = Math.imul(h, 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h || 1;
}

function lcg(seed: number): () => number {
  let s = mixSeed(seed);
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

const AWAKEN_CHANCE_PER_TURN = 0.10;
export const LAIR_GROWTH_INTERVAL_TURNS = 10;
export const LAIR_GROWTH_CAP = 5;
export const LAIR_GROWTH_EXPERIENCE = 16;

export interface BeastMoveOrder { unitId: string; toCoord: HexCoord }
export interface BeastAttackOrder { attackerUnitId: string; defenderUnitId: string }
export interface BeastSpawnOrder { lairId: string; beastId: BeastId; position: HexCoord }
export interface BeastAwakening { lairId: string; beastId: BeastId; position: HexCoord }

export interface BeastProcessResult {
  updatedLairs: BeastLair[];
  spawnOrders: BeastSpawnOrder[];
  moveOrders: BeastMoveOrder[];
  attackOrders: BeastAttackOrder[];
  awakenings: BeastAwakening[];
  regenOrders: Array<{ unitId: string; amount: number }>;
}

const IMPASSABLE_FOR_LAND_BEASTS = new Set(['ocean', 'coast', 'mountain']);
const WATER_TERRAINS = new Set(['ocean', 'coast']);

export function isTerrainPassableForBeast(unitType: UnitType, terrain: string): boolean {
  const beastDef = getBeastDefinitionByUnitType(unitType);
  if (beastDef?.flying) return !WATER_TERRAINS.has(terrain);
  const domain = UNIT_DEFINITIONS[unitType]?.domain;
  if (domain === 'naval') return WATER_TERRAINS.has(terrain);
  return !IMPASSABLE_FOR_LAND_BEASTS.has(terrain);
}

export interface BeastAttackEligibility { allowed: boolean; reason?: string }

export function canUnitAttackBeast(attacker: Unit, target: Unit): BeastAttackEligibility {
  const def = getBeastDefinitionByUnitType(target.type);
  if (!def?.navalOnly || target.owner !== BEAST_OWNER) return { allowed: true };
  const attackerDef = UNIT_DEFINITIONS[attacker.type];
  const isNaval = attackerDef?.domain === 'naval';
  const isRanged = attackerDef?.attackProfile?.kind === 'ranged';
  if (isNaval || isRanged) return { allowed: true };
  return { allowed: false, reason: `Only ships and ranged units can fight the ${def.name}.` };
}

export function processBeasts(
  lairs: BeastLair[],
  map: GameMap,
  intruderUnits: Unit[],
  beastUnits: Unit[],
  era: number,
  mode: BeastsMode,
  seed: number,
): BeastProcessResult {
  const empty: BeastProcessResult = { updatedLairs: lairs, spawnOrders: [], moveOrders: [], attackOrders: [], awakenings: [], regenOrders: [] };
  if (mode === 'off') return empty;

  const rng = lcg(seed);
  const updatedLairs: BeastLair[] = [];
  const spawnOrders: BeastSpawnOrder[] = [];
  const awakenings: BeastAwakening[] = [];
  const moveOrders: BeastMoveOrder[] = [];
  const attackOrders: BeastAttackOrder[] = [];

  const occupied = new Map<string, string>();
  // Air units hover above ground — they don't block spawn or beast movement
  for (const u of [...beastUnits, ...intruderUnits]) {
    if (UNIT_DEFINITIONS[u.type]?.domain !== 'air') occupied.set(hexKey(u.position), u.id);
  }

  for (const lair of lairs) {
    const def = BEAST_DEFINITIONS[lair.beastId];
    if (lair.status === 'dormant' && era >= def.awakenEra && rng() < AWAKEN_CHANCE_PER_TURN) {
      awakenings.push({ lairId: lair.id, beastId: lair.beastId, position: lair.position });
      // Spawn packSize beasts on lair tile then free passable neighbors
      const spawnTiles: HexCoord[] = [];
      if (!occupied.has(hexKey(lair.position))) spawnTiles.push(lair.position);
      for (const n of mapNeighbors(map, lair.position)) {
        if (spawnTiles.length >= def.packSize) break;
        const tile = map.tiles[hexKey(n)];
        if (tile && isTerrainPassableForBeast(def.unitType, tile.terrain) && !occupied.has(hexKey(n))) spawnTiles.push(n);
      }
      for (const pos of spawnTiles.slice(0, def.packSize)) {
        spawnOrders.push({ lairId: lair.id, beastId: lair.beastId, position: { ...pos } });
        occupied.set(hexKey(pos), 'pending-spawn');
      }
      updatedLairs.push({ ...lair, status: 'awake' });
    } else {
      updatedLairs.push(lair);
    }
  }

  const regenOrders: Array<{ unitId: string; amount: number }> = [];
  for (const beast of beastUnits) {
    const def = getBeastDefinitionByUnitType(beast.type);
    if (def?.regenPerTurn && beast.health < 100) {
      regenOrders.push({ unitId: beast.id, amount: def.regenPerTurn });
    }
  }

  if (mode === 'calm') {
    return { updatedLairs, spawnOrders, moveOrders: [], attackOrders: [], awakenings, regenOrders };
  }

  const lairByUnitId = new Map<string, BeastLair>();
  for (const lair of updatedLairs) for (const id of lair.unitIds) lairByUnitId.set(id, lair);

  for (const beast of beastUnits) {
    if (beast.movementPointsLeft <= 0) continue;
    const lair = lairByUnitId.get(beast.id);
    if (!lair) continue;
    const def = BEAST_DEFINITIONS[lair.beastId];

    const inLeash = (c: HexCoord) => mapDistance(map, c, lair.position) <= def.leashRadius;
    const targets = intruderUnits
      .filter(u => inLeash(u.position))
      .sort((a, b) => mapDistance(map, a.position, beast.position) - mapDistance(map, b.position, beast.position));
    const target = targets[0];

    const attackRange = UNIT_DEFINITIONS[beast.type].attackProfile?.kind === 'ranged'
      ? UNIT_DEFINITIONS[beast.type].attackProfile!.range
      : 1;
    if (target && mapDistance(map, target.position, beast.position) <= attackRange) {
      attackOrders.push({ attackerUnitId: beast.id, defenderUnitId: target.id });
      continue;
    }

    const goal = target ? target.position : lair.position;
    if (hexKey(goal) === hexKey(beast.position)) continue;
    const step = mapNeighbors(map, beast.position)
      .filter(n => {
        const tile = map.tiles[hexKey(n)];
        return tile && isTerrainPassableForBeast(def.unitType, tile.terrain) && !occupied.has(hexKey(n)) && inLeash(n);
      })
      .sort((a, b) => mapDistance(map, a, goal) - mapDistance(map, b, goal))[0];
    if (step && mapDistance(map, step, goal) < mapDistance(map, beast.position, goal)) {
      occupied.delete(hexKey(beast.position));
      occupied.set(hexKey(step), beast.id);
      moveOrders.push({ unitId: beast.id, toCoord: step });
    }
  }

  return { updatedLairs, spawnOrders, moveOrders, attackOrders, awakenings, regenOrders };
}

// ---- Slay rewards ----

export function isBeastUnit(unit: Pick<Unit, 'owner'>): boolean {
  return unit.owner === BEAST_OWNER;
}

/**
 * Habitat concealment: a beast with concealedInHabitat is invisible to a viewer civ
 * while it stands on its habitat terrain and none of that civ's units are adjacent.
 * Mirrors isForestConcealedUnit (fog-of-war.ts) — keep the two consistent if either changes.
 */
export function isBeastConcealedFrom(
  beast: Unit,
  map: GameMap,
  viewerUnits: Array<Pick<Unit, 'position'>>,
): boolean {
  if (beast.owner !== BEAST_OWNER) return false;
  const def = getBeastDefinitionByUnitType(beast.type);
  if (!def?.concealedInHabitat) return false;
  const tile = map.tiles[hexKey(beast.position)];
  if (!tile || !def.habitatTerrains.includes(tile.terrain)) return false;
  return !viewerUnits.some(v => mapDistance(map, v.position, beast.position) === 1);
}

export function getBeastHoardGold(def: BeastDefinition, era: number): number {
  // Tier base, +50% per era past the awaken era — late kills stay worthwhile
  const eraBonus = Math.max(0, era - def.awakenEra);
  return Math.round(def.hoardGoldBase * (1 + 0.5 * eraBonus));
}

export interface BeastSlainPayload {
  lairId: string;
  beastId: BeastId;
  slayerCivId: string;
  slayerUnitId: string;
  goldAwarded: number;
}

/**
 * Shared slay consequence — MUST be called from every path that kills a beast
 * (player attack in main.ts, AI/beast combat in turn-manager.ts).
 * Returns a new GameState; never mutates the input.
 */
export function recordBeastSlain(
  state: GameState,
  defeated: Unit,
  victor: Unit,
): { state: GameState; slain?: BeastSlainPayload } {
  if (!isBeastUnit(defeated) || !state.beasts) return { state };

  const lair = Object.values(state.beasts.lairs).find(l => l.unitIds.includes(defeated.id));
  if (!lair) return { state };

  const remaining = lair.unitIds.filter(id => id !== defeated.id);
  if (remaining.length > 0) {
    const updatedLair: BeastLair = { ...lair, unitIds: remaining };
    return {
      state: { ...state, beasts: { ...state.beasts, lairs: { ...state.beasts.lairs, [lair.id]: updatedLair } } },
    };
  }

  const def = BEAST_DEFINITIONS[lair.beastId];
  const isApex = def.tier >= 4;
  const isChoiceTier = def.tier >= 2 && !isApex;
  const gold = isChoiceTier || isApex ? 0 : getBeastHoardGold(def, state.era);
  const slayerCiv = state.civilizations[victor.owner];
  const updatedLair: BeastLair = {
    ...lair, unitIds: [], status: 'slain', slainBy: victor.owner, slainTurn: state.turn,
  };

  let next: GameState = {
    ...state,
    beasts: { ...state.beasts, lairs: { ...state.beasts.lairs, [lair.id]: updatedLair } },
  };
  if (slayerCiv && gold > 0) {
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        [victor.owner]: { ...slayerCiv, gold: slayerCiv.gold + gold },
      },
    };
  }
  if (isChoiceTier && slayerCiv) {
    next = {
      ...next,
      beasts: {
        ...next.beasts!,
        pendingHoardChoices: [...(next.beasts!.pendingHoardChoices ?? []), { lairId: lair.id, civId: victor.owner }],
      },
    };
  }

  let apexGold = 0;
  if (isApex && slayerCiv) {
    const baseGold = getBeastHoardGold(def, state.era);
    apexGold = baseGold * 2;
    const apexLore = Math.round(baseGold * 1.5);
    // Gold
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        [victor.owner]: { ...next.civilizations[victor.owner], gold: next.civilizations[victor.owner].gold + apexGold },
      },
    };
    // Lore
    next = applyBeastLoreResearch(next, victor.owner, apexLore);
    // Auto-claim trophy (skip choice panel)
    next = {
      ...next,
      beasts: {
        ...next.beasts!,
        lairs: { ...next.beasts!.lairs, [lair.id]: { ...next.beasts!.lairs[lair.id], status: 'claimed', claimedBy: victor.owner } },
      },
    };
    // Legendary veterancy for the slayer
    const topTier = VETERANCY_TIERS[VETERANCY_TIERS.length - 1];
    const hero = next.units[victor.id];
    if (hero) {
      next = {
        ...next,
        units: { ...next.units, [victor.id]: { ...hero, experience: Math.max(hero.experience, topTier.minExperience) } },
      };
    }
  }

  // Victory Feast: the slaying unit is fully healed
  const victorUnit = next.units[victor.id];
  if (victorUnit) {
    next = { ...next, units: { ...next.units, [victor.id]: { ...victorUnit, health: 100 } } };
  }

  const goldAwarded = isApex ? apexGold : gold;
  return {
    state: next,
    slain: slayerCiv
      ? { lairId: lair.id, beastId: lair.beastId, slayerCivId: victor.owner, slayerUnitId: victor.id, goldAwarded }
      : undefined,
  };
}

const TROPHY_GOLD_PER_TURN: Record<number, number> = { 2: 3, 3: 5, 4: 8 };
export function getBeastTrophyGoldPerTurn(tier: number): number {
  return TROPHY_GOLD_PER_TURN[tier] ?? 0;
}

export interface HoardChoicePreview {
  gold: number;
  lore: number;
  trophyGoldPerTurn: number;
  beastName: string;
}

export function getHoardChoicePreview(state: GameState, lairId: string): HoardChoicePreview {
  const lair = state.beasts!.lairs[lairId];
  const def = BEAST_DEFINITIONS[lair.beastId];
  const baseGold = getBeastHoardGold(def, state.era);
  return {
    gold: baseGold * 2,
    lore: Math.round(baseGold * 1.5),
    trophyGoldPerTurn: TROPHY_GOLD_PER_TURN[def.tier],
    beastName: def.name,
  };
}

export function getClaimedTrophyGoldPerTurn(state: GameState, civId: string): number {
  if (!state.beasts) return 0;
  let total = 0;
  for (const lair of Object.values(state.beasts.lairs)) {
    if (lair.status === 'claimed' && lair.claimedBy === civId) {
      total += TROPHY_GOLD_PER_TURN[BEAST_DEFINITIONS[lair.beastId].tier];
    }
  }
  return total;
}

function applyBeastLoreResearch(state: GameState, civId: string, amount: number): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  const result = applyResearchBonus(civ.techState, amount);
  return {
    ...state,
    civilizations: { ...state.civilizations, [civId]: { ...civ, techState: result.state } },
  };
}

export function applyHoardChoice(
  state: GameState,
  lairId: string,
  civId: string,
  choice: BeastHoardChoice,
): GameState {
  const beasts = state.beasts;
  const pending = beasts?.pendingHoardChoices?.find(p => p.lairId === lairId && p.civId === civId);
  if (!beasts || !pending) return state;

  const preview = getHoardChoicePreview(state, lairId);
  const lair = beasts.lairs[lairId];
  const civ = state.civilizations[civId];
  if (!civ) return state;

  let next: GameState = {
    ...state,
    beasts: {
      ...beasts,
      pendingHoardChoices: (beasts.pendingHoardChoices ?? []).filter(
        p => !(p.lairId === lairId && p.civId === civId),
      ),
    },
  };

  if (choice === 'gold') {
    next = { ...next, civilizations: { ...next.civilizations, [civId]: { ...civ, gold: civ.gold + preview.gold } } };
  } else if (choice === 'lore') {
    next = applyBeastLoreResearch(next, civId, preview.lore);
  } else {
    next = {
      ...next,
      beasts: {
        ...next.beasts!,
        lairs: { ...next.beasts!.lairs, [lairId]: { ...lair, status: 'claimed', claimedBy: civId } },
      },
    };
  }
  return next;
}

export function isCivUnitInBeastTerritory(state: GameState, civId: string): boolean {
  if (!state.beasts || state.beasts.mode === 'off') return false;
  const awakeLairs = Object.values(state.beasts.lairs).filter(l => l.status === 'awake');
  if (awakeLairs.length === 0) return false;
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId) continue;
    for (const lair of awakeLairs) {
      if (mapDistance(state.map, unit.position, lair.position) <= BEAST_DEFINITIONS[lair.beastId].leashRadius) return true;
    }
  }
  return false;
}
