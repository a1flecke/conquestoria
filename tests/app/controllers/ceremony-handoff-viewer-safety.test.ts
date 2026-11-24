// @vitest-environment jsdom
import { describe, it } from 'vitest';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import type { EventChainConclusionMomentItem } from '@/systems/event-chain-presentation';
import type { GeneralRetirementMomentItem } from '@/systems/great-general-presentation';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { createPanelHost } from '@/app/panel-host';
import { createCeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import {
  expectHotSeatDifferential,
  expectViewerSafety,
  type ViewerSurface,
  type WorldMutation,
} from '../../helpers/viewer-safety';

/**
 * #1002 differential cover for what the ceremony coordinator lets across a hot-seat handoff.
 *
 * `ceremony-coordinator.test.ts` pins `clearForHandoff` one queue at a time with
 * `not.toHaveBeenCalled()` on a presenter (the original leak: a ceremony queued for the seat that just ended its
 * turn played on the next seat's screen). Here the whole hand-over is a timeline: seat A's moments are queued while
 * A's screen is busy, A ends its turn (`clearForHandoff`, the veil goes up, A's panel is torn down, the veil lifts),
 * seat B's own moments are queued, and the projection for a seat is exactly what is presented on its screen. A fact
 * only A earned must not move B's projection, whichever queue it sat in; B's own moment must.
 *
 * A moment already presenting when the turn ends is deliberately outside this model: the coordinator leaves it alone
 * and its own overlay keeps End Turn unreachable. Moments the coordinator keeps world-scoped (a world-race
 * conclusion) are not modelled either: clearing them at the handoff is the coordinator's current behaviour, not a
 * privacy rule this test should freeze.
 */

type Kind = 'wonder' | 'legendary' | 'chain' | 'retirement';

interface Moment {
  seat: 'A' | 'B';
  kind: Kind;
  /** Fields overriding the default item of this kind. */
  fields: Record<string, unknown>;
}

interface World {
  moments: Moment[];
}

const CIV = { A: 'civ-a', B: 'civ-b' } as const;

function defaultItem(moment: Moment): unknown {
  const civId = CIV[moment.seat];
  switch (moment.kind) {
    case 'wonder':
      return {
        title: 'Natural Wonder Discovered', wonderId: 'great_volcano', civId, coord: { q: 2, r: 0 }, name: 'Great Volcano',
        revealLine: 'A discovery line.', effectSummary: 'Yields +1 Science', rewardSummary: '+30 Science',
        visual: getWonderVisualDefinition('great_volcano'), motionAssetId: null, ...moment.fields,
      } satisfies WonderDiscoveryRevealItem;
    case 'legendary':
      return {
        title: 'Legendary Wonder Completed', civId, cityId: 'city-river', wonderId: 'oracle-of-delphi', turnCompleted: 42,
        name: 'Oracle of Delphi', cityName: 'city-river', achievementLine: 'A work that will shape its legacy.',
        rewardSummary: '+60 research', rewardActiveLabel: 'Reward active', visual: getWonderVisualDefinition('oracle-of-delphi'),
        ...moment.fields,
      } satisfies LegendaryWonderCompletionCeremonyItem;
    case 'chain':
      return {
        civId, chainId: `chain-${moment.seat}`, kind: 'financial-panic', title: 'Financial Panic', optionLabel: 'Emergency Bailout',
        optionDescription: 'Pay a gold sum now.', ...moment.fields,
      } satisfies EventChainConclusionMomentItem;
    case 'retirement':
      return {
        civId, generalDefinitionId: `gen-${moment.seat}`, name: 'A General', careerLine: 'Retired.', ...moment.fields,
      } satisfies GeneralRetirementMomentItem;
  }
}

/** What each seat's screen presented, in order. */
const surface: ViewerSurface<World, string[]> = {
  name: 'ceremony hand-over',
  project(world, viewerId) {
    const shown: string[] = [];
    const record = (kind: Kind) => (item: unknown): Promise<never> => {
      shown.push(`${kind}:${JSON.stringify(item)}`);
      return new Promise(() => {});
    };
    const host = createPanelHost(document.createElement('div'));
    const coordinator = createCeremonyCoordinator({
      host,
      reducedMotion: () => false,
      requestMapHighlight: () => {},
      playDiscoveryAudio: () => {},
      openAtlas: () => {},
      openCity: () => {},
      openJournal: () => {},
      presentWonderDiscovery: record('wonder') as never,
      presentLegendaryCompletion: record('legendary') as never,
      presentEventChainConclusion: record('chain') as never,
      presentGeneralRetirement: record('retirement') as never,
    });
    const enqueue = (moment: Moment): void => {
      const item = defaultItem(moment);
      switch (moment.kind) {
        case 'wonder': coordinator.enqueueWonderDiscovery(item as WonderDiscoveryRevealItem); break;
        case 'legendary': coordinator.enqueueLegendaryCompletion(item as LegendaryWonderCompletionCeremonyItem); break;
        case 'chain': coordinator.enqueueEventChainConclusion(item as EventChainConclusionMomentItem); break;
        case 'retirement': coordinator.enqueueGeneralRetirement(item as GeneralRetirementMomentItem); break;
      }
    };

    // Seat A's screen is busy (a panel is open), so its moments queue.
    host.setBlockingOverlay('a-panel');
    for (const moment of world.moments.filter(m => m.seat === 'A')) enqueue(moment);
    // A ends its turn: the coordinator is cleared, the veil goes up, A's panel is torn down, the veil lifts.
    coordinator.clearForHandoff();
    host.setBlockingOverlay('turn-handoff');
    host.setBlockingOverlay(null);
    const boundary = shown.length;
    host.setBlockingOverlay(null);
    // Seat B plays its turn.
    for (const moment of world.moments.filter(m => m.seat === 'B')) enqueue(moment);

    return viewerId === 'A' ? shown.slice(0, boundary) : shown.slice(boundary);
  },
};

const edit = (label: string, apply: (world: World) => void): WorldMutation<World> => ({ label, apply });
const addMoment = (moment: Moment) => (world: World): void => { world.moments.push(moment); };

const aMoments: Moment[] = [
  { seat: 'A', kind: 'wonder', fields: {} },
  { seat: 'A', kind: 'legendary', fields: {} },
  { seat: 'A', kind: 'chain', fields: {} },
  { seat: 'A', kind: 'retirement', fields: {} },
];

describe('ceremony hand-over is viewer-safe (differential)', () => {
  it("nothing seat A had queued reaches seat B's screen, whichever queue it was in; B's own moment does", () => {
    expectViewerSafety(surface, {
      world: { moments: aMoments.map(m => ({ ...m, fields: { ...m.fields } })) },
      viewerId: 'B',
      hidden: [
        edit("A's wonder discovery names a different wonder", w => { Object.assign(w.moments[0].fields, { name: 'Secret Volcano', wonderId: 'crystal_caverns' }); }),
        edit("A's legendary completion changes", w => { Object.assign(w.moments[1].fields, { name: 'Hidden Wonder', rewardSummary: '+999 research' }); }),
        edit("A's chain conclusion changes", w => { Object.assign(w.moments[2].fields, { optionLabel: 'Secret Option' }); }),
        edit("A's retirement names a different General", w => { Object.assign(w.moments[3].fields, { name: 'Secret General', careerLine: 'A private career.' }); }),
        edit("A queues another moment", addMoment({ seat: 'A', kind: 'chain', fields: { chainId: 'chain-A2', title: 'Another Crisis' } })),
      ],
      earned: [
        edit("B has a moment of its own", addMoment({ seat: 'B', kind: 'chain', fields: {} })),
        edit("B has a retirement of its own", addMoment({ seat: 'B', kind: 'retirement', fields: {} })),
      ],
    });
  });

  it('hot seat: only B earns what B queues after the hand-over', () => {
    expectHotSeatDifferential(surface, {
      world: { moments: [...aMoments, { seat: 'B', kind: 'legendary', fields: {} }] },
      viewers: ['A', 'B'],
      knownOnlyTo: 'B',
      mutation: edit("B's own completion changes", w => { Object.assign(w.moments[4].fields, { rewardSummary: '+1 research' }); }),
    });
  });
});
