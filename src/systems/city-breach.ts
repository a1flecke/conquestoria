/**
 * #939 -- a Siegemaster General's Breach: the walls of one hostile city are open to the breaching civ's siege for a
 * short time. The one owner of what "breached" means; the siege code asks these helpers and never reads
 * `city.breach` itself.
 *
 * A leaf: structural types only (no `@/core/types` import), so the siege, bombardment and capture systems can all
 * consume it without a cycle and without adding an importer to the shrink-only types barrel.
 *
 * Effects, all for the breaching civ's units only and none for anyone else:
 *  - bombardment fires through a garrison at full strength (the garrison no longer halves it);
 *  - the walls no longer answer an attacker with counter-fire;
 *  - a land assault on the city is stronger (`CITY_BREACH_ASSAULT_MULTIPLIER`).
 * It changes none of the #974 ceilings: the per-turn bombardment cap, the capture rules (adjacent only, ungarrisoned,
 * major owner) and the defense floor are untouched, so a siege still takes at least five turns.
 */
interface BreachableCity {
  readonly breach?: { readonly byCivId: string; readonly generalDefinitionId: string; readonly expiresTurn: number };
}

/** Strength multiplier for the breaching civ's land assault on a breached city (applied with the other attacker modifiers). */
export const CITY_BREACH_ASSAULT_MULTIPLIER = 1.2;

/** True while `civId`'s siege has open walls on this city. Presence is activity: expired breaches are swept each round. */
export function isCityBreachedBy(city: BreachableCity, civId: string): boolean {
  return city.breach !== undefined && city.breach.byCivId === civId;
}

/** The breach a Siegemaster opens on `turn`: it is active for this civ's turn and the following `durationTurns - 1`. */
export function createCityBreach(
  civId: string,
  generalDefinitionId: string,
  turn: number,
  durationTurns: number,
): { byCivId: string; generalDefinitionId: string; expiresTurn: number } {
  return { byCivId: civId, generalDefinitionId, expiresTurn: turn + Math.max(1, durationTurns) - 1 };
}

/** Whether a breach's last turn has been played at `turn` (the sweep in `city-siege-system.ts` removes it then). */
export function isCityBreachExpired(breach: { readonly expiresTurn: number }, turn: number): boolean {
  return turn >= breach.expiresTurn;
}
