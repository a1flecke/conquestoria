import type { GameState } from '@/core/types';
import { classifyTerritorialRelation } from './territorial-access';

/**
 * How a tile's owner relates to a unit's owner for LAND SUPPLY (#544, #870).
 *
 * This is derived from the ONE territorial-relation vocabulary
 * (`classifyTerritorialRelation`, #871) -- the same fact that decides whether a
 * unit may enter the land -- but what a relationship *supports* once a unit is
 * there is decided here, deliberately separately from whether it may be there.
 * "May enter" and "is supplied" are different questions; a single boolean must
 * never answer both:
 *
 * | relation             | class       | why |
 * |----------------------|-------------|-----|
 * | own                  | friendly    | the civ's own territory |
 * | unclaimed            | unclaimed   | nobody's land: no support, no hostility |
 * | alliance             | allied      | allies support each other's armies |
 * | vassalage (either way) | allied    | overlord and vassal are bound by protection; same standing as an alliance |
 * | Open Borders         | permitted   | **passage, not logistics**: the army may stand there, but the host owes it nothing |
 * | war / closed / non-sovereign | hostile | enemy land, an intruder's land, or land with no diplomatic standing |
 *
 * `permitted` carries the SAME attrition as `hostile` (see
 * `advanceOverextensionStage`): Open Borders buys the right to cross, not the
 * right to be resupplied, healed, based or reinforced. Supply sources are only
 * ever the civ's OWN cities/forts (`supply-sources.ts`), healing reads only the
 * civ's own tiles (`turn-manager.ts`), and air bases must be same-owner
 * (`air-operations-system.ts`) -- Open Borders promotes none of them.
 */
export type LandSupplyTerritoryClass = 'friendly' | 'allied' | 'permitted' | 'unclaimed' | 'hostile';

export function classifyLandSupplyTerritory(
  state: Pick<GameState, 'civilizations'>,
  viewerCivId: string,
  tileOwner: string | null,
): LandSupplyTerritoryClass {
  switch (classifyTerritorialRelation(state, viewerCivId, tileOwner)) {
    case 'own': return 'friendly';
    case 'unclaimed': return 'unclaimed';
    case 'alliance':
    case 'vassalage': return 'allied';
    case 'open-borders': return 'permitted';
    case 'war':
    case 'closed':
    case 'non-sovereign': return 'hostile';
  }
}
