// CivilizationEvents: the civilization slice of the GameEvents map (#1361). GameEvents in core/types.ts extends this interface; keys, payloads and
// emit/listen behavior are unchanged. Leaf: type-only imports of other leaves, never the barrel.
import type { AdvisorType, CouncilCallbackTone } from './council';
import type { CivilizationEra, WorldAge } from '@/systems/era-types';

export interface CivilizationEvents {
  'supply:warning': {
    viewerId: string;
    unitIds: string[];
    kind: 'losing-full' | 'entering-combat-penalty' | 'entering-movement-penalty';
    /** At most one `true` per `deriveSupplyWarningTransitions` call. */
    playAudio: boolean;
  };
  'network:exploit-warning': { planId: string; victimCivId: string; cityId: string };
  'network:exploit-resolved': { planId: string; cityId: string; ownerCivId: string; goldTransferred: number; delayed: boolean };
  'network:audio-cue': {
    cue: 'constructive-resolution' | 'hostile-warning' | 'hostile-consequence' | 'surge' | 'recovery';
    viewerIds: string[];
  };
  'tech:completed': {
    civId: string;
    techId: string;
    /** MR4 (#917): science that overshot `techId` and was moved into the queued
     * successor's progress. Omitted/0 when nothing carried (no successor). */
    carriedProgress?: number;
    /** The queued technology that received `carriedProgress`, if any. */
    carriedIntoTechId?: string | null;
  };
  'tech:started': { civId: string; techId: string };
  'civilization:first-contact': { civA: string; civB: string };
  /** #544 MR4: fired when a Great General retires after spending all 3
   * Command Charges (Final Command). Retirement happens silently during
   * end-of-round processing, well after the player confirmed spending the
   * final charge -- this is the player's only feedback that it actually
   * happened. */
  'general:retired': { civId: string; generalName: string; message: string };
  'era:advanced': { era: WorldAge };
  'civilization:era-advanced': { civId: string; previousEra: CivilizationEra; era: CivilizationEra };
  'currentPlayer:changed-after-handoff': {
    civId: string;
    civType: string;
    era: WorldAge;
    atWarCount: number;    // exact war count so AudioSystem can track remainingWars precisely
    unrestCityCount: number;
    nearDefeat: boolean;
    inBeastTerritory: boolean;
  };
  'advisor:message': { advisor: AdvisorType; message: string; icon: string; tone?: CouncilCallbackTone; memoryKey?: string };
  'faction:unrest-started': { cityId: string; owner: string };
  'faction:revolt-started': { cityId: string; owner: string };
  'faction:unrest-resolved': { cityId: string; owner: string };
  'faction:breakaway-started': { cityId: string; oldOwner: string; breakawayId: string };
  'faction:breakaway-established': { civId: string; originOwnerId: string };
  'faction:breakaway-reabsorbed': { civId: string; ownerId: string; cityId: string };
  'faction:critical-status': { cityId: string; owner: string; status: 'unrest' | 'revolt' | 'breakaway'; breakawayId?: string };
  'faction:contagion-spread': { fromCityId: string; toCityId: string; owner: string };
  'faction:concession-made': { cityId: string; owner: string; concessionType: 'charter' };
  // Spec 3 — adaptive music events
  'civ:near-defeat':                { civId: string };
  'civ:recovered-from-near-defeat': { civId: string };
  'civ:resettlement-needed':        { civId: string };
  'civ:resettled':                  { civId: string };
  'civ:eliminated':                 { civId: string; eliminatedBy: string | null };
  'religion:founded': { religionId: string; civId: string; cityId: string; name: string };
  'religion:city-converted': { cityId: string; toReligionId: string; fromReligionId?: string };
  'religion:preached': { cityId: string; unitId: string; civId: string; points: number; unitConsumed: boolean };
  'religion:loyalty-warning': { cityId: string; pressuringCivId: string; stage: 'start' | 'midpoint' | 'final'; turnsRemaining: number };
  'religion:city-defected': { cityId: string; fromCivId: string; toCivId: string };
}
