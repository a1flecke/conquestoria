import type { GameState } from '@/core/types';

/**
 * #1001 — the declared catalogue of every `GameState` area, classified by what
 * an `isEliminated` civilization may still appear in.
 *
 * Once `civ.isEliminated === true` it retains **no live owned entities and no
 * active obligations**. `eliminateCivilization`
 * (`src/systems/civilization-elimination-system.ts`) is ~130 lines of
 * hand-written teardown across a dozen areas, and nothing enumerated every
 * `GameState` field to prove each is clean — so a new subsystem could be added
 * with no teardown line and no test would notice.
 *
 * This map is that enumeration. It is `Record<keyof GameState, EliminatedCivArea>`,
 * so **adding a `GameState` field is a compile error until it is classified
 * here**, and `eliminated-civ-invariant.test.ts` re-checks the coverage at
 * runtime against a live state's keys.
 *
 * Three kinds:
 *  - `teardown`   — a live reference to an eliminated civ here is a bug; `scan`
 *                   returns the offending descriptions. This is the set
 *                   `eliminateCivilization` must keep clean.
 *  - `historical` — a reference to an eliminated civ here is an **intentional,
 *                   permanent record** ("civ X discovered wonder Y", "civ X
 *                   built wonder Z", a chronicle). Never deleted, only
 *                   classified; `eliminated-civ-invariant.test.ts` asserts each
 *                   such record survives elimination.
 *  - `structural` — the area's shape cannot carry a civ id / owned-entity id at
 *                   all (`turn`, `map`, `settings`, `idCounters`, …).
 */

export type EliminatedCivScanContext = {
  /** Every `civ.isEliminated` id. */
  readonly eliminated: ReadonlySet<string>;
  /** Ids present in `state.units` — anything else referenced as a unit is dangling. */
  readonly liveUnitIds: ReadonlySet<string>;
};

export type EliminatedCivArea =
  | { kind: 'structural'; why: string }
  | { kind: 'historical'; why: string }
  | { kind: 'teardown'; why: string; scan: (state: GameState, ctx: EliminatedCivScanContext) => string[] };

const isEliminatedId = (id: string | null | undefined, ctx: EliminatedCivScanContext): boolean =>
  typeof id === 'string' && ctx.eliminated.has(id);

/** First segment of a `${civId}:${rest}` composite key. */
const compositeCivId = (key: string): string => key.split(':', 1)[0]!;

/** Flag an eliminated-civ id that survives anywhere inside an opaque JSON blob. */
const jsonMentionsEliminated = (value: unknown, ctx: EliminatedCivScanContext, label: string): string[] => {
  if (value == null) return [];
  const json = JSON.stringify(value);
  return [...ctx.eliminated].filter(id => json.includes(`"${id}"`)).map(id => `${label} still references eliminated civ "${id}"`);
};

export const ELIMINATED_CIV_AREAS: Record<keyof GameState, EliminatedCivArea> = {
  // --- structural: no civ id / owned-entity id can live here -----------------
  turn: { kind: 'structural', why: 'a number' },
  era: { kind: 'structural', why: 'a number' },
  saveSchemaVersion: { kind: 'structural', why: 'persistence metadata' },
  gameId: { kind: 'structural', why: 'a seed-derived id' },
  playthroughId: { kind: 'structural', why: 'save-slot bookkeeping' },
  gameTitle: { kind: 'structural', why: 'a display string' },
  opponentChallenge: { kind: 'structural', why: 'a difficulty enum' },
  pendingOpponentChallenge: { kind: 'structural', why: 'a difficulty enum' },
  map: { kind: 'structural', why: 'terrain; tile ownership is derived from cities, not civ-keyed here' },
  settings: { kind: 'structural', why: 'game options; customCivilizations are definitions, not live civs' },
  idCounters: { kind: 'structural', why: 'monotonic counters' },
  tutorial: { kind: 'structural', why: 'tutorial step bookkeeping' },
  gameOver: { kind: 'structural', why: 'a boolean' },
  gameOverReason: { kind: 'structural', why: 'an enum' },
  mapScript: { kind: 'structural', why: 'an enum' },
  startPlacementMode: { kind: 'structural', why: 'start-placement bookkeeping' },
  barbarianCamps: { kind: 'structural', why: 'barbarian-owned; no major-civ id' },
  barbarianCampPressure: { kind: 'structural', why: 'keyed by camp id' },
  tribalVillages: { kind: 'structural', why: 'unowned map features' },
  reconReveals: { kind: 'structural', why: 'transient tile reveals' },
  patrolReveals: { kind: 'structural', why: 'transient tile reveals' },
  networkCivicPressureByCity: { kind: 'structural', why: 'keyed by city id; a dead civ has no cities (the city-roster invariant owns orphan city ids)' },
  cityFaith: { kind: 'structural', why: 'keyed by city id; a dead civ has no cities (the city-roster invariant owns orphan city ids)' },
  minorCivRegionalCooldowns: {
    kind: 'teardown',
    why: 'a regional-coalition cooldown against a dead major civ has no adversary',
    scan: (state, ctx) => Object.entries(state.minorCivRegionalCooldowns ?? {})
      .filter(([, c]) => isEliminatedId((c as { targetCivId?: string }).targetCivId, ctx))
      .map(([id]) => `minorCivRegionalCooldowns["${id}"] still targets an eliminated civ`),
  },
  minorCivLeagues: { kind: 'structural', why: 'league charters keyed by league id; membership is minor civs only' },
  legendaryWonderAvailability: { kind: 'structural', why: 'keyed by wonder id; a status enum, no civ id' },

  // --- teardown: eliminateCivilization must keep these clean -----------------
  currentPlayer: {
    kind: 'teardown',
    why: 'turn cycling must never hand the turn to an eliminated civ',
    scan: (state, ctx) => isEliminatedId(state.currentPlayer, ctx) ? [`currentPlayer is the eliminated civ "${state.currentPlayer}"`] : [],
  },
  winner: {
    kind: 'teardown',
    why: 'an eliminated civ cannot be the winner',
    scan: (state, ctx) => isEliminatedId(state.winner, ctx) ? [`winner is the eliminated civ "${state.winner}"`] : [],
  },
  civilizations: {
    kind: 'teardown',
    why: 'the dead civ owns no cities/units/wars/treaties/relationships/events/vassalage; no other civ references it, including satelliteSurveillanceTargets',
    scan: (state, ctx) => {
      const problems: string[] = [];
      for (const civId of ctx.eliminated) {
        const civ = state.civilizations[civId];
        if (!civ) continue;
        if (civ.cities.length > 0) problems.push(`eliminated civ "${civId}" has a non-empty city roster`);
        if (civ.units.length > 0) problems.push(`eliminated civ "${civId}" has a non-empty unit roster`);
        const d = civ.diplomacy;
        if ((d?.atWarWith ?? []).length > 0) problems.push(`eliminated civ "${civId}" still lists wars: ${d!.atWarWith.join(', ')}`);
        if ((d?.treaties ?? []).length > 0) problems.push(`eliminated civ "${civId}" still holds ${d!.treaties.length} treaty record(s)`);
        if (Object.keys(d?.relationships ?? {}).length > 0) problems.push(`eliminated civ "${civId}" still holds relationship records`);
        if ((d?.events ?? []).length > 0) problems.push(`eliminated civ "${civId}" still holds ${d!.events.length} diplomacy event(s)`);
        if (d?.vassalage?.overlord) problems.push(`eliminated civ "${civId}" still has an overlord (${d.vassalage.overlord})`);
        if ((d?.vassalage?.vassals ?? []).length > 0) problems.push(`eliminated civ "${civId}" still has vassals: ${d!.vassalage!.vassals.join(', ')}`);
        if ((d?.vassalage?.protectionTimers ?? []).length > 0) problems.push(`eliminated civ "${civId}" still has vassalage protection timers`);
      }
      for (const [otherId, other] of Object.entries(state.civilizations)) {
        if (ctx.eliminated.has(otherId)) continue;
        const d = other.diplomacy;
        for (const deadId of ctx.eliminated) {
          if ((d?.atWarWith ?? []).includes(deadId)) problems.push(`${otherId} is still at war with eliminated civ "${deadId}"`);
          if (Object.hasOwn(d?.relationships ?? {}, deadId)) problems.push(`${otherId} still has a relationship record for eliminated civ "${deadId}"`);
          if ((d?.events ?? []).some(e => e.otherCiv === deadId)) problems.push(`${otherId} still has a diplomacy event referencing eliminated civ "${deadId}"`);
          if ((d?.treaties ?? []).some(t => t.civA === deadId || t.civB === deadId)) problems.push(`${otherId} still has a treaty with eliminated civ "${deadId}"`);
          if (d?.vassalage?.overlord === deadId) problems.push(`${otherId} still has eliminated civ "${deadId}" as overlord`);
          if ((d?.vassalage?.vassals ?? []).includes(deadId)) problems.push(`${otherId} still has eliminated civ "${deadId}" as a vassal`);
          if ((d?.vassalage?.protectionTimers ?? []).some(timer => timer.attackerCivId === deadId)) problems.push(`${otherId} still has a vassalage protection timer against eliminated civ "${deadId}"`);
          if (Object.hasOwn(other.satelliteSurveillanceTargets ?? {}, deadId)) problems.push(`${otherId} still surveils eliminated civ "${deadId}"`);
        }
      }
      return problems;
    },
  },
  units: {
    kind: 'teardown',
    why: 'no unit is owned by an eliminated civ',
    scan: (state, ctx) => Object.values(state.units)
      .filter(u => ctx.eliminated.has(u.owner))
      .map(u => `unit "${u.id}" is still owned by eliminated civ "${u.owner}"`),
  },
  cities: {
    kind: 'teardown',
    why: 'no city is owned by an eliminated civ',
    scan: (state, ctx) => Object.values(state.cities)
      .filter(c => ctx.eliminated.has(c.owner))
      .map(c => `city "${c.id}" is still owned by eliminated civ "${c.owner}"`),
  },
  embargoes: {
    kind: 'teardown',
    why: 'a dead civ is neither an embargo target nor a participant',
    scan: (state, ctx) => {
      const problems: string[] = [];
      for (const e of state.embargoes ?? []) {
        if (isEliminatedId(e.targetCivId, ctx)) problems.push(`embargo still targets eliminated civ "${e.targetCivId}"`);
        for (const p of e.participants) if (isEliminatedId(p, ctx)) problems.push(`embargo still lists eliminated civ "${p}" as a participant`);
      }
      return problems;
    },
  },
  defensiveLeagues: {
    kind: 'teardown',
    why: 'a dead civ is not a league member',
    scan: (state, ctx) => (state.defensiveLeagues ?? [])
      .flatMap(l => l.members.filter(m => ctx.eliminated.has(m)).map(m => `defensive league "${l.id}" still lists eliminated civ "${m}"`)),
  },
  pendingDiplomacyRequests: {
    kind: 'teardown',
    why: 'no pending request is to or from a dead civ',
    scan: (state, ctx) => (state.pendingDiplomacyRequests ?? [])
      .filter(r => isEliminatedId(r.fromCivId, ctx) || isEliminatedId(r.toCivId, ctx))
      .map(r => `pending diplomacy request ${r.fromCivId}->${r.toCivId} still involves an eliminated civ`),
  },
  pendingEvents: {
    kind: 'teardown',
    why: 'the dead civ has no event queue and no other queue references it',
    scan: (state, ctx) => {
      const problems: string[] = [];
      for (const [civId, events] of Object.entries(state.pendingEvents ?? {})) {
        if (ctx.eliminated.has(civId)) { problems.push(`pendingEvents still has a queue for eliminated civ "${civId}"`); continue; }
        for (const ev of events) {
          const ref = (ev as { otherCiv?: string; civId?: string }).otherCiv ?? (ev as { civId?: string }).civId;
          if (isEliminatedId(ref, ctx)) problems.push(`${civId}'s pendingEvents still references eliminated civ "${ref}"`);
        }
      }
      return problems;
    },
  },
  espionage: {
    kind: 'teardown',
    why: 'own espionage state deleted; foreign spies retargeted; detectedThreats / activeInterrogations filtered',
    scan: (state, ctx) => {
      const problems: string[] = [];
      for (const [civId, esp] of Object.entries(state.espionage ?? {})) {
        if (ctx.eliminated.has(civId)) { problems.push(`espionage still has state for eliminated civ "${civId}"`); continue; }
        for (const [spyId, spy] of Object.entries(esp.spies ?? {})) {
          if (isEliminatedId(spy.targetCivId, ctx)) problems.push(`${civId}'s spy "${spyId}" still targets eliminated civ "${spy.targetCivId}"`);
        }
        for (const threat of Object.values(esp.detectedThreats ?? {})) {
          const ref = (threat as { foreignCivId?: string }).foreignCivId;
          if (isEliminatedId(ref, ctx)) problems.push(`${civId}'s detectedThreats still references eliminated civ "${ref}"`);
        }
        for (const interrogation of Object.values(esp.activeInterrogations ?? {})) {
          const ref = (interrogation as { spyOwner?: string }).spyOwner;
          if (isEliminatedId(ref, ctx)) problems.push(`${civId}'s activeInterrogations still references eliminated civ "${ref}"`);
        }
      }
      return problems;
    },
  },
  opponentAI: {
    kind: 'teardown',
    why: 'majorCivs / pressureByCiv key deleted; every portfolio scrubbed of removed unit ids; barbarianHomeCampByUnitId filtered',
    scan: (state, ctx) => {
      const problems: string[] = [];
      const ai = state.opponentAI;
      if (!ai) return problems;
      for (const deadId of ctx.eliminated) {
        if (Object.hasOwn(ai.majorCivs ?? {}, deadId)) problems.push(`opponentAI.majorCivs still has a portfolio for eliminated civ "${deadId}"`);
        if (Object.hasOwn(ai.pressureByCiv ?? {}, deadId)) problems.push(`opponentAI.pressureByCiv still has an entry for eliminated civ "${deadId}"`);
      }
      const dangling = (id: string): boolean => !ctx.liveUnitIds.has(id);
      for (const [ownerId, portfolio] of Object.entries(ai.majorCivs ?? {})) {
        const plans = [portfolio.primaryPlan, ...Object.values(portfolio.defensePlansByCityId ?? {})].filter(Boolean);
        for (const plan of plans) {
          for (const unitId of plan!.assignedUnitIds ?? []) {
            if (dangling(unitId)) problems.push(`opponentAI portfolio for "${ownerId}" still assigns removed unit "${unitId}"`);
          }
        }
        for (const unitId of Object.keys(portfolio.upgradeRoutesByUnitId ?? {})) {
          if (dangling(unitId)) problems.push(`opponentAI portfolio for "${ownerId}" still routes an upgrade for removed unit "${unitId}"`);
        }
      }
      for (const unitId of Object.keys(ai.barbarianHomeCampByUnitId ?? {})) {
        if (dangling(unitId)) problems.push(`opponentAI.barbarianHomeCampByUnitId still references removed unit "${unitId}"`);
      }
      return problems;
    },
  },
  marketplace: {
    kind: 'teardown',
    why: 'trade routes and purchased-resource entries for a dead civ are removed',
    scan: (state, ctx) => {
      const problems: string[] = [];
      const m = state.marketplace;
      if (!m) return problems;
      for (const route of m.tradeRoutes ?? []) {
        if (isEliminatedId(route.foreignCivId, ctx)) problems.push(`trade route "${route.id}" still names eliminated civ "${route.foreignCivId}"`);
      }
      for (const entry of m.purchasedResources ?? []) {
        if (isEliminatedId(entry.civId, ctx)) problems.push(`purchasedResources still has an entry for eliminated civ "${entry.civId}"`);
      }
      return problems;
    },
  },
  autonomyByCiv: {
    kind: 'teardown',
    why: 'a dead civ runs no autonomy network — no active plans (the empty `createEmptyAutonomyCivState()` shell the load-time normalizer gives every civ is inert and expected)',
    scan: (state, ctx) => Object.entries(state.autonomyByCiv ?? {})
      .filter(([id, autonomy]) => isEliminatedId(id, ctx) && Object.keys((autonomy as { plans?: object }).plans ?? {}).length > 0)
      .map(([id]) => `autonomyByCiv still has an active network plan for eliminated civ "${id}"`),
  },
  economyStatusByCiv: {
    kind: 'teardown',
    why: 'a dead civ has no economy',
    scan: (state, ctx) => Object.keys(state.economyStatusByCiv ?? {})
      .filter(id => isEliminatedId(id, ctx))
      .map(id => `economyStatusByCiv still has an entry for eliminated civ "${id}"`),
  },
  councilMemory: {
    kind: 'teardown',
    why: 'a dead civ has no advisory council (CouncilMemoryState is Record<civId, …>)',
    scan: (state, ctx) => Object.keys((state.councilMemory ?? {}) as Record<string, unknown>)
      .filter(id => isEliminatedId(id, ctx))
      .map(id => `councilMemory still has a ledger for eliminated civ "${id}"`),
  },
  activeCrises: {
    kind: 'teardown',
    why: 'a crisis targeting a dead civ has no target',
    scan: (state, ctx) => Object.entries(state.activeCrises ?? {})
      .filter(([, c]) => isEliminatedId(c.targetCivId, ctx))
      .map(([id, c]) => `activeCrises["${id}"] still targets eliminated civ "${c.targetCivId}"`),
  },
  crisisForces: {
    kind: 'teardown',
    why: 'a crisis force targeting a dead civ has no target',
    scan: (state, ctx) => Object.entries(state.crisisForces ?? {})
      .filter(([, f]) => isEliminatedId(f.targetCivId, ctx))
      .map(([id, f]) => `crisisForces["${id}"] still targets eliminated civ "${f.targetCivId}"`),
  },
  stampedes: {
    kind: 'teardown',
    why: 'a stampede targeting a dead civ has no target',
    scan: (state, ctx) => Object.entries(state.stampedes ?? {})
      .filter(([, s]) => isEliminatedId(s.targetCivId, ctx))
      .map(([id]) => `stampedes["${id}"] still targets an eliminated civ`),
  },
  rogueElephantHosts: {
    kind: 'teardown',
    why: 'a rogue-elephant host targeting a dead civ has no target',
    scan: (state, ctx) => Object.entries(state.rogueElephantHosts ?? {})
      .filter(([, h]) => isEliminatedId(h.targetCivId, ctx))
      .map(([id]) => `rogueElephantHosts["${id}"] still targets an eliminated civ`),
  },
  beasts: {
    kind: 'teardown',
    why: 'a dead civ keeps no bestiary sightings or pending hoard choices',
    scan: (state, ctx) => {
      const b = state.beasts;
      if (!b) return [];
      const problems = Object.keys(b.sightingsByCiv ?? {})
        .filter(id => isEliminatedId(id, ctx))
        .map(id => `beasts.sightingsByCiv still has an entry for eliminated civ "${id}"`);
      return [...problems, ...jsonMentionsEliminated(b.pendingHoardChoices ?? [], ctx, 'beasts.pendingHoardChoices')];
    },
  },
  minorCivs: {
    kind: 'teardown',
    why: 'city-state war state, relationships, grievances, offered quests, quest cooldowns and quest-chain status against a dead major civ are all cleared (the inert lastNotifiedStatusByCiv string cache is exempt — see below)',
    scan: (state, ctx) => {
      const problems: string[] = [];
      const has = (map: Record<string, unknown> | undefined, id: string): boolean => Object.hasOwn(map ?? {}, id);
      for (const [mcId, mc] of Object.entries(state.minorCivs ?? {})) {
        for (const deadId of ctx.eliminated) {
          if ((mc.diplomacy?.atWarWith ?? []).includes(deadId)) problems.push(`minor civ "${mcId}" is still at war with eliminated civ "${deadId}"`);
          if (has(mc.diplomacy?.relationships, deadId)) problems.push(`minor civ "${mcId}" still has a relationship record for eliminated civ "${deadId}"`);
          if (has(mc.regionalGrievanceByCiv, deadId)) problems.push(`minor civ "${mcId}" still holds a regional grievance against eliminated civ "${deadId}"`);
          if (has(mc.chainStatusByCiv, deadId)) problems.push(`minor civ "${mcId}" still tracks quest-chain status for eliminated civ "${deadId}"`);
          if (has(mc.activeQuests, deadId)) problems.push(`minor civ "${mcId}" still offers an active quest to eliminated civ "${deadId}"`);
          if (has(mc.questCooldownUntilByCiv, deadId)) problems.push(`minor civ "${mcId}" still tracks a quest cooldown for eliminated civ "${deadId}"`);
          // `lastNotifiedStatusByCiv[deadId]` is deliberately NOT flagged: the
          // `normalizeMinorCivQuestState` load normalizer gives every minor civ a
          // status string for every major so readers need no null check, and it
          // drives nothing for a civ that is no longer in `diplomacy.relationships`
          // (which IS scrubbed). Same tolerance as the empty `autonomyByCiv` shell.
        }
      }
      return problems;
    },
  },
  minorCivCoalitions: {
    kind: 'teardown',
    why: 'a coalition formed against a dead major civ has no adversary',
    scan: (state, ctx) => Object.entries(state.minorCivCoalitions ?? {})
      .filter(([, c]) => isEliminatedId(c.targetCivId, ctx))
      .map(([id]) => `minorCivCoalitions["${id}"] still targets eliminated civ "${state.minorCivCoalitions![id]!.targetCivId}"`),
  },
  territoryFrontiers: {
    kind: 'teardown',
    why: 'a frontier contest with a dead civ on either side is over',
    scan: (state, ctx) => Object.entries(state.territoryFrontiers ?? {})
      .filter(([, f]) => isEliminatedId(f.holderCivId, ctx) || isEliminatedId(f.challengerCivId, ctx))
      .map(([key]) => `territoryFrontiers["${key}"] still names an eliminated civ`),
  },
  nationalProjectChoices: {
    kind: 'teardown',
    why: 'a dead civ makes no national-project resource choice',
    scan: (state, ctx) => Object.keys(state.nationalProjectChoices ?? {})
      .filter(id => isEliminatedId(id, ctx))
      .map(id => `nationalProjectChoices still has an entry for eliminated civ "${id}"`),
  },
  builtNationalProjects: {
    kind: 'teardown',
    why: 'a dead civ has no cities, so no active national-project buildings',
    scan: (state, ctx) => Object.entries(state.builtNationalProjects ?? {})
      .filter(([key, rec]) => isEliminatedId(rec.civId, ctx) || isEliminatedId(compositeCivId(key), ctx))
      .map(([key]) => `builtNationalProjects still has "${key}" for an eliminated civ`),
  },
  legendaryWonderProjects: {
    kind: 'teardown',
    why: 'an in-flight wonder project belonging to a dead civ is abandoned',
    scan: (state, ctx) => Object.entries(state.legendaryWonderProjects ?? {})
      .filter(([, p]) => isEliminatedId(p.ownerId, ctx))
      .map(([id, p]) => `legendaryWonderProjects["${id}"] still belongs to eliminated civ "${p.ownerId}"`),
  },
  legendaryWonderTacticalEffects: {
    kind: 'teardown',
    why: 'combat grants keyed to a dead civ are void',
    scan: (state, ctx) => {
      const s = state.legendaryWonderTacticalEffects;
      if (!s) return [];
      return [
        ...Object.keys(s.trainingGrantsByCiv ?? {}).filter(id => isEliminatedId(id, ctx)).map(id => `legendaryWonderTacticalEffects.trainingGrantsByCiv still has "${id}"`),
        ...Object.keys(s.interceptionClaimTurnByCiv ?? {}).filter(id => isEliminatedId(id, ctx)).map(id => `legendaryWonderTacticalEffects.interceptionClaimTurnByCiv still has "${id}"`),
      ];
    },
  },
  legendaryWonderIntel: {
    kind: 'teardown',
    why: 'a dead civ gathers no intel',
    scan: (state, ctx) => Object.keys(state.legendaryWonderIntel ?? {})
      .filter(id => isEliminatedId(id, ctx))
      .map(id => `legendaryWonderIntel still has a ledger for eliminated civ "${id}"`),
  },
  pendingGeneralCandidateChoices: {
    kind: 'teardown',
    why: 'a dead civ chooses no Great General',
    scan: (state, ctx) => (state.pendingGeneralCandidateChoices ?? [])
      .flatMap((c, i) => jsonMentionsEliminated(c, ctx, `pendingGeneralCandidateChoices[${i}]`)),
  },
  pirateFleets: {
    kind: 'teardown',
    why: 'a pirate fleet hunting a dead civ has no quarry',
    scan: (state, ctx) => Object.entries(state.pirateFleets ?? {})
      .flatMap(([id, f]) => jsonMentionsEliminated(f, ctx, `pirateFleets["${id}"]`)),
  },
  pirateFleetCooldownByCivLandmass: {
    kind: 'teardown',
    why: 'cooldown keyed `${civId}:${landmassId}` for a dead civ',
    scan: (state, ctx) => Object.keys(state.pirateFleetCooldownByCivLandmass ?? {})
      .filter(key => isEliminatedId(compositeCivId(key), ctx))
      .map(key => `pirateFleetCooldownByCivLandmass still has "${key}" for an eliminated civ`),
  },
  resurgentCampCooldownByCivLandmass: {
    kind: 'teardown',
    why: 'cooldown keyed `${civId}:${landmassId}` for a dead civ',
    scan: (state, ctx) => Object.keys(state.resurgentCampCooldownByCivLandmass ?? {})
      .filter(key => isEliminatedId(compositeCivId(key), ctx))
      .map(key => `resurgentCampCooldownByCivLandmass still has "${key}" for an eliminated civ`),
  },
  pirates: {
    kind: 'teardown',
    why: 'per-civ intel / tribute / demand ledgers and any active contract naming a dead civ are void; the raid history chronicle is kept',
    scan: (state, ctx) => {
      const p = state.pirates;
      if (!p) return [];
      const problems: string[] = [];
      for (const id of Object.keys(p.intelByCiv ?? {})) if (isEliminatedId(id, ctx)) problems.push(`pirates.intelByCiv still has a ledger for eliminated civ "${id}"`);
      for (const id of Object.keys(p.activationWarningDeliveredByCiv ?? {})) if (isEliminatedId(id, ctx)) problems.push(`pirates.activationWarningDeliveredByCiv still has an entry for eliminated civ "${id}"`);
      for (const [factionId, faction] of Object.entries(p.factions ?? {})) {
        for (const id of Object.keys(faction.tributeByCiv ?? {})) if (isEliminatedId(id, ctx)) problems.push(`pirate faction "${factionId}" still holds a tribute record from eliminated civ "${id}"`);
        for (const id of Object.keys(faction.demandByCiv ?? {})) if (isEliminatedId(id, ctx)) problems.push(`pirate faction "${factionId}" still holds a demand against eliminated civ "${id}"`);
        const c = faction.contract;
        if (c && (isEliminatedId(c.employerId, ctx) || isEliminatedId(c.targetId, ctx))) problems.push(`pirate faction "${factionId}" still has an active contract naming an eliminated civ`);
        const intentTarget = (faction.intent as { targetCivId?: string } | null)?.targetCivId;
        if (isEliminatedId(intentTarget, ctx)) problems.push(`pirate faction "${factionId}" still intends to act against an eliminated civ`);
      }
      return problems;
    },
  },

  // --- historical: an eliminated civ appearing here is an intentional record --
  discoveredWonders: { kind: 'historical', why: '"civ X was the first to discover wonder Y" — a permanent chronicle fact' },
  wonderDiscoverers: { kind: 'historical', why: '"civ X discovered wonder Y" — permanent, even after X is gone' },
  completedLegendaryWonders: { kind: 'historical', why: '"civ X built legendary wonder Z on turn T" — a Hall-of-Fame record' },
  legendaryWonderHistory: { kind: 'historical', why: 'destroyed strongholds / discovered sites / military facts — an audit chronicle by construction' },
  generatedGenerals: { kind: 'historical', why: 'a General identity + career ledger ("served civ X") survives the civ, like a Hall-of-Fame entry' },
  religions: { kind: 'historical', why: 'a religion outlives its founder; ownerCivId records who founded it, and the holy city is immune to conversion under any owner' },
  hotSeat: { kind: 'historical', why: 'the fixed seat roster the game was set up with; turn cycling skips an eliminated seat, it is not struck from the config' },
  notificationLog: { kind: 'historical', why: "a per-recipient message history; a dead civ's log is inert (nothing routes to it) and records what happened to them" },
  dominationIntel: { kind: 'historical', why: "domination-victory observational intel (#985) — `defeatsByCivId` exists precisely to record eliminations; `reconcileCivilizationLiveness` -> `recordDominationDefeat` writes the dead civ's defeat into every witness's ledger (and the civ's own final snapshot) at elimination time, by design. A chronicle, not a live obligation." },
};

/**
 * Assert that no `isEliminated` civ retains a live entity or active obligation
 * anywhere in `state`, walking every `teardown` area in `ELIMINATED_CIV_AREAS`.
 * A no-op when no civ is eliminated. Throws an aggregated error naming every
 * offending area so one bad state reports all its problems at once.
 */
export function assertEliminatedCivHasNoLiveEntities(state: GameState): void {
  const eliminated = new Set(
    Object.entries(state.civilizations).filter(([, civ]) => civ.isEliminated).map(([id]) => id),
  );
  if (eliminated.size === 0) return;

  const ctx: EliminatedCivScanContext = {
    eliminated,
    liveUnitIds: new Set(Object.keys(state.units)),
  };

  const problems: string[] = [];
  for (const [area, classification] of Object.entries(ELIMINATED_CIV_AREAS) as [keyof GameState, EliminatedCivArea][]) {
    if (classification.kind !== 'teardown') continue;
    for (const problem of classification.scan(state, ctx)) {
      problems.push(`[${area}] ${problem}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`eliminated-civ-entities invariant violated:\n  - ${problems.join('\n  - ')}`);
  }
}
