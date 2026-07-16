import { describe, it, expect } from 'vitest';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { initializeScenario } from '../simulation/ai-playability-fixture';

const SEEDS = ['fairness-seed-1', 'fairness-seed-2', 'fairness-seed-3'];
const TURNS = 60;

// Every event kind that can produce a world-pressure notification to a hot-seat
// viewer (#526 MR5/MR6/MR7's routers in notification-routing.ts): AI-targeted
// crisis:started/resolved (routeWorldPressureCrisisStarted/Resolved), the three
// interaction hooks (hunt-their-foe, exploit-weakness, sabotage-relief-discovered),
// and send-aid. Deliberately excludes crisis:spread and crisis:escalated -- MR5's
// anti-spam discipline is that those never get a world-pressure router at all (see
// routeWorldPressureCrisisStarted's doc comment), and a human's OWN crisis routes
// through the pre-existing routeCrisisStarted/routeCrisisResolved, which sink only
// to that civ's own owner (never fanned out to other hot-seat viewers), so it isn't
// "world-pressure" notification volume in the sense MR8's play-check cares about.
const WORLD_PRESSURE_EVENTS = [
  'crisis:started',
  'crisis:resolved',
  'crisis:foe-hunted-by-ally',
  'crisis:aid-sent',
  'diplomacy:opportunistic-war',
  'espionage:sabotage-relief-discovered',
] as const;

function countWorldPressureNotifications(seed: string): number {
  let state = initializeScenario({
    seed, challenge: 'standard', turns: TURNS, mapSize: 'small',
    humanCount: 2, aiCount: 1, personalitySet: ['aggressive'],
  });
  state = {
    ...state,
    settings: { ...state.settings, aiPressure: 'full', aiPressureVisibility: true, aiCrisisInteractions: 'full' },
  };

  let count = 0;
  const bus = new EventBus();
  const aiIds = new Set(Object.values(state.civilizations).filter(c => !c.isHuman).map(c => c.id));
  bus.on('crisis:started', ({ civId }) => { if (aiIds.has(civId)) count++; });
  bus.on('crisis:resolved', ({ civId }) => { if (aiIds.has(civId)) count++; });
  bus.on('crisis:foe-hunted-by-ally', () => { count++; });
  bus.on('crisis:aid-sent', () => { count++; });
  bus.on('diplomacy:opportunistic-war', () => { count++; });
  bus.on('espionage:sabotage-relief-discovered', () => { count++; });

  for (let round = 0; round < TURNS; round++) {
    const completed = runCompletedRound(state, bus, {
      improvements: (current, eventBus) => processImprovementTurns(current, eventBus),
      majors: (current, eventBus) => processNonHumanMajorRound(current, eventBus).state,
      world: (current, eventBus) => processTurn(current, eventBus),
    });
    if (!completed.ok) {
      throw new Error(`${seed}: round ${round + 1} failed`, { cause: completed.error });
    }
    state = completed.state;
    const commitErrors = completed.events.commitTo(bus);
    if (commitErrors.length > 0) {
      throw new Error(`${seed}: event commit failed`, { cause: commitErrors[0] });
    }
  }

  return count;
}

// #526 MR8 play-check: a hot-seat viewer should see roughly <= 3 world-pressure log
// entries per turn on average, or the routers need further batching/coalescing (see
// the plan's MR8 acceptance criteria). This is a per-viewer UPPER BOUND: each router
// sinks at most once per viewer per qualifying event (never per-tick spam -- see the
// event list's doc comment above), so raw qualifying-event count across the run,
// divided by turns, is >= what any single hot-seat viewer actually sees.
describe('world pressure notification volume (#526 MR8)', () => {
  it('averages <= 3 world-pressure notifications per turn, pooled across seeds', () => {
    let totalCount = 0;
    for (const seed of SEEDS) {
      totalCount += countWorldPressureNotifications(seed);
    }
    const perTurn = totalCount / (SEEDS.length * TURNS);
    expect(perTurn).toBeLessThanOrEqual(3);
  }, 180_000);
});
