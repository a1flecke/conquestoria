/**
 * #987 — leaf types for the nation-building governance layer, imported by
 * `core/types.ts` (mirrors `domination-types.ts`/`era-types.ts`'s own role as
 * a dependency-light type source `types.ts` can import without pulling in a
 * whole systems module).
 *
 * `GovernanceFaction` is deliberately a small, fixed, purely-attributive enum
 * — a label for "who this policy pleases/angers" in the UI, not a simulated
 * population or support meter. There is no per-faction state anywhere in the
 * save; keeping it this thin is what keeps #987 a bounded feature rather than
 * the "generic political simulation" its own non-goals rule out.
 */
export type GovernanceFaction = 'military' | 'merchants' | 'clergy' | 'commons';

/**
 * `'centralized'` is the default (absent `federalismEnabled` reads as this,
 * matching migration 25's own "absent means centralized" contract).
 * `'autonomous'` is exactly today's Federal Autonomy stance
 * (`civ.federalismEnabled === true`) — this type does not introduce a new
 * persisted field; see `governance-capacity.ts`'s `getGovernancePosture`.
 */
export type GovernancePosture = 'centralized' | 'autonomous';

export type GovernancePolicyId = 'conscription-levy' | 'free-trade-charter' | 'local-autonomy-writ';
