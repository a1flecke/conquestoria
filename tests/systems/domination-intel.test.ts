import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { acceptDiplomaticRequest, applyDiplomaticAction } from '@/systems/diplomacy-system';
import { recordDominationPoliticalReport } from '@/systems/domination-intel';
import { recordDominationDefeat } from '@/systems/domination-intel';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';
import { makeLivenessGame, withoutOwnedAssets } from './helpers/civilization-liveness-fixture';
import { makeVassalageFixture } from './helpers/vassalage-fixture';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

describe('Domination earned intelligence', () => {
  it('records only direct vassalage facts already known by the observing civilization', () => {
    const bus = new EventBus();
    const pending = applyDiplomaticAction(
      makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus,
    );
    const accepted = acceptDiplomaticRequest(
      pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus,
    );
    accepted.civilizations.third.knownCivilizations = ['overlord'];
    accepted.civilizations.vassal.knownCivilizations = ['overlord'];

    const recorded = recordDominationPoliticalReport(accepted, 'third', 'overlord');

    expect(recorded).not.toBe(accepted);
    expect(recorded.dominationIntel?.third?.reportsByContenderId.overlord).toEqual({
      contenderId: 'overlord',
      observedTurn: accepted.turn,
      contenderRole: 'independent',
      directVassalIds: [],
      defeatedCivIds: [],
    });
    expect(accepted.dominationIntel).toEqual({});
  });

  it('records the terminal fact for an eliminated participant and its attributed conqueror', () => {
    const before = makeLivenessGame();
    const assetless = withoutOwnedAssets(before, 'ai-1');
    const eliminated = eliminateCivilization(assetless, 'ai-1', 'player');
    if (!eliminated.eliminated) throw new Error('fixture requires an elimination');

    const recorded = recordDominationDefeat(before, eliminated.state, {
      civId: 'ai-1',
      eliminatedBy: 'player',
    });

    expect(recorded.dominationIntel?.player?.defeatsByCivId['ai-1']).toEqual({
      civId: 'ai-1',
      civName: before.civilizations['ai-1'].name,
      observedTurn: before.turn,
      defeatedById: 'player',
      source: 'participant',
    });
    expect(recorded.dominationIntel?.['ai-1']?.defeatsByCivId['ai-1']).toMatchObject({
      source: 'participant',
    });
    expect(eliminated.state.dominationIntel).toEqual({});
  });

  it('credits a known third-party witness only when it saw the decisive lost city', () => {
    const before = makeVassalageFixture();
    const city = before.cities[before.civilizations.vassal.cities[0]];
    before.civilizations.third.visibility.tiles[hexKey(city.position)] = 'visible';
    const assetless = withoutOwnedAssets(before, 'vassal');

    const witnessed = recordDominationDefeat(before, assetless, {
      civId: 'vassal',
      eliminatedBy: 'overlord',
    });

    expect(witnessed.dominationIntel?.third?.defeatsByCivId.vassal).toMatchObject({
      civId: 'vassal',
      defeatedById: 'overlord',
      source: 'witness',
    });
  });

  it('does not credit a third party from hidden final-state absence', () => {
    const before = makeVassalageFixture();
    const assetless = withoutOwnedAssets(before, 'vassal');

    const recorded = recordDominationDefeat(before, assetless, {
      civId: 'vassal',
      eliminatedBy: 'overlord',
    });

    expect(recorded.dominationIntel?.third).toBeUndefined();
  });

  it('credits a contact who saw the last surviving settler', () => {
    const before = makeVassalageFixture();
    const vassal = before.civilizations.vassal;
    const formerUnit = before.units[vassal.units[0]]!;
    const cityId = vassal.cities[0]!;
    delete before.cities[cityId];
    for (const unitId of vassal.units) delete before.units[unitId];
    const settler = createUnit('settler', 'vassal', formerUnit.position, before.idCounters);
    before.units[settler.id] = settler;
    vassal.cities = [];
    vassal.units = [settler.id];
    before.civilizations.third.visibility.tiles[hexKey(settler.position)] = 'visible';
    const assetless = withoutOwnedAssets(before, 'vassal');

    const recorded = recordDominationDefeat(before, assetless, {
      civId: 'vassal',
      eliminatedBy: 'overlord',
    });

    expect(recorded.dominationIntel?.third?.defeatsByCivId.vassal).toMatchObject({
      civId: 'vassal',
      defeatedById: 'overlord',
      source: 'witness',
    });
  });
});
