/**
 * #887 Phase B — the player-facing Great General Hall of Fame view-model.
 *
 * Presentation/aggregation over the MR1 career ledger (`great-general-career.ts`,
 * which stays pure and import-only-`@/core/types`). Nothing here mutates state
 * or reads `opponentChallenge`; output is identical across difficulty modes.
 * The AI never imports this module (guard in great-general-career.test.ts).
 */
import type { GeneralCareerEvent, GeneralHistoryEntry } from '@/core/types';
import { summarizeGeneralCareer } from '@/systems/great-general-career';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export interface HallOfFameMoment {
  turn: number;
  text: string;
}

/**
 * How memorable one career event is, for "moments" selection. Higher = more
 * memorable. `spawned`/`killed`/`retired` are bookends (rendered separately);
 * routine ability use and any event type a later MR adds without teaching this
 * function fall through to 0 and are never surfaced as an individual moment.
 * Opt a new memorable type in by adding a case here.
 */
export function classifyCareerEventImportance(event: GeneralCareerEvent): number {
  switch (event.type) {
    case 'city-captured':
    case 'city-defended':
      return 5;
    case 'final-command':
      return 4;
    case 'unit-saved':
      return 3;
    case 'battle-influenced':
      return event.reasons.length >= 2 ? 2 : 1;
    default:
      return 0;
  }
}

/**
 * Plain-language, coordinate-free, `textContent`-safe phrasing for one moment.
 * `null` for a kind that is not an individual moment (bookend, routine, or an
 * unrecognised future type) so callers filter it out.
 */
export function describeMoment(event: GeneralCareerEvent): string | null {
  switch (event.type) {
    case 'city-captured':
      return `captured ${event.cityName}`;
    case 'city-defended':
      return `defended ${event.cityName}`;
    case 'unit-saved':
      return `pulled a ${UNIT_DEFINITIONS[event.unitType]?.name ?? 'unit'} back from the brink`;
    case 'final-command':
      return 'gave their final command';
    case 'battle-influenced':
      return event.reasons.length >= 2 ? 'turned a desperate battle' : 'helped win a hard-fought battle';
    default:
      return null;
  }
}

/**
 * Up to `cap` ranked memorable moments for the card timeline, returned
 * chronologically. If nothing ranks and the General still used heroic commands
 * (a peaceful/builder playstyle), synthesise one summary line so the timeline
 * is never blank.
 */
export function selectMemorableMoments(entry: GeneralHistoryEntry, cap = 5): HallOfFameMoment[] {
  const events = entry.careerEvents ?? [];
  const moments = events
    .map(event => ({ event, importance: classifyCareerEventImportance(event) }))
    .filter(x => x.importance >= 1)
    .sort((a, b) => b.importance - a.importance || a.event.turn - b.event.turn)
    .slice(0, cap)
    .map(x => {
      const text = describeMoment(x.event);
      return text === null ? null : { turn: x.event.turn, text };
    })
    .filter((m): m is HallOfFameMoment => m !== null)
    .sort((a, b) => a.turn - b.turn);

  if (moments.length === 0) {
    const summary = summarizeGeneralCareer(entry);
    const commands = summary.rallyUses + summary.seizeUses + summary.lastStandUses;
    if (commands > 0) {
      return [{ turn: entry.spawnedTurn, text: `steadied the ranks through ${commands} heroic commands` }];
    }
  }
  return moments;
}
