import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '@/systems/city-system';
import {
  getMinorCivLeagueScoreBonus,
  MINOR_CIV_LEAGUE_CHARTERS,
  MINOR_CIV_LEAGUE_RULES,
} from '@/systems/minor-civ-league-definitions';

describe('minor-civ league definitions', () => {
  it('references only real building definitions for every charter', () => {
    for (const charter of Object.values(MINOR_CIV_LEAGUE_CHARTERS)) {
      for (const buildingId of charter.preferredBuildingIds) {
        expect(BUILDINGS[buildingId]).toBeDefined();
      }
    }
  });

  it('awards the peaceful score bonus once when an explicit ID and yield category both match', () => {
    expect(getMinorCivLeagueScoreBonus(
      { kind: 'commerce', reason: 'charter' },
      { kind: 'building', building: BUILDINGS.marketplace },
    )).toBe(MINOR_CIV_LEAGUE_RULES.peacefulScoreBonus);
  });

  it('awards the defense bonus only to local defense buildings and non-scout units', () => {
    expect(getMinorCivLeagueScoreBonus(
      { kind: 'defense', reason: 'preparation' },
      { kind: 'building', building: BUILDINGS.walls },
    )).toBe(MINOR_CIV_LEAGUE_RULES.defenseScoreBonus);
    expect(getMinorCivLeagueScoreBonus(
      { kind: 'defense', reason: 'preparation' },
      { kind: 'unit', unitType: 'warrior' },
    )).toBe(MINOR_CIV_LEAGUE_RULES.defenseScoreBonus);
    expect(getMinorCivLeagueScoreBonus(
      { kind: 'defense', reason: 'preparation' },
      { kind: 'unit', unitType: 'scout' },
    )).toBe(0);
  });
});
