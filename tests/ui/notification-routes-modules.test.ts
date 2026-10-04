import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as combatRoutes from '@/ui/notification-routes/combat-routes';
import * as crisisRoutes from '@/ui/notification-routes/crisis-routes';
import * as diplomacyRoutes from '@/ui/notification-routes/diplomacy-routes';
import * as empireRoutes from '@/ui/notification-routes/empire-routes';
import * as espionageRoutes from '@/ui/notification-routes/espionage-routes';
import * as mapRoutes from '@/ui/notification-routes/map-routes';
import * as notificationAudience from '@/ui/notification-routes/notification-audience';
import * as religionRoutes from '@/ui/notification-routes/religion-routes';
import * as worldRoutes from '@/ui/notification-routes/world-routes';

/**
 * #1250: notification-routing.ts (1,221 lines, 62 exports, fan-in 15) was split by notification domain and
 * deleted — there is no compatibility barrel. These pins make each module's exact runtime export list
 * explicit, so a new router is a deliberate edit here. Dependency direction (two leaves below eight
 * independent routers, one audience authority) is pinned by the `notification-*` rules in
 * tests/app/architecture/rules.ts.
 */
const SURFACE: Array<[name: string, module: object, exports: string[]]> = [
  ['combat-routes', combatRoutes, [
    'routeCombatResolved', 'routeCombatRewardEarned',
  ]],
  ['crisis-routes', crisisRoutes, [
    'routeCrisisAidSent', 'routeCrisisContained', 'routeCrisisEscalated', 'routeCrisisFoeHuntedByAlly',
    'routeCrisisResolved', 'routeCrisisSpread', 'routeCrisisStarted', 'routeEventChainResolved',
    'routeEventChainStarted', 'routeOpportunisticWar', 'routeWorldPressureCrisisResolved',
    'routeWorldPressureCrisisStarted',
  ]],
  ['diplomacy-routes', diplomacyRoutes, [
    'TREATY_DECLINE_REASON_TEXT', 'TREATY_LABELS', 'describeWarReason', 'routeAccessLost',
    'routeFirstContact', 'routeIndependenceRequested', 'routePeaceDeclined', 'routePeaceMade',
    'routePeaceRequested', 'routeProtectionFailed', 'routeProtectionRequested',
    'routeSettlementDeclined', 'routeSettlementProposed', 'routeSettlementSigned',
    'routeTreatyAccepted', 'routeTreatyDeclined', 'routeTreatyProposed', 'routeVassalAutoPeace',
    'routeVassalAutoWar', 'routeVassalageEnded', 'routeWarDeclared', 'routeWarGoalExceeded',
  ]],
  ['empire-routes', empireRoutes, [
    'formatEconomyTreasuryStrainMessage', 'routeDroppedProductionItem', 'routeEconomyTreasuryStrain',
    'routeFactionTransition',
  ]],
  ['espionage-routes', espionageRoutes, [
    'ESPIONAGE_NOTIFICATION_ROUTES', 'routeCityFlipped', 'routeCourierIntercepted',
    'routeIntelReportAcquired', 'routeOfficialBribed', 'routeSabotageReliefDiscovered',
    'routeScandalExposed',
  ]],
  ['map-routes', mapRoutes, [
    'getTerritoryTileFlippedMessage', 'routeBarbarianSpawned', 'routeTerritoryTileFlipped',
  ]],
  ['notification-audience', notificationAudience, [
    'getNotificationTargetsForEvent',
  ]],
  ['religion-routes', religionRoutes, [
    'routeCityDefected', 'routeLoyaltyWarning', 'routeReligionCityConverted', 'routeReligionFounded',
  ]],
  ['world-routes', worldRoutes, [
    'routeEraAdvanced', 'routeLegendaryWonder', 'routeStrategicWarning', 'routeWorldRaceCompleted',
    'routeWorldRaceLaunchBegun', 'routeWorldRaceUnlocked',
  ]],
];

describe('#1250 — the notification routers keep their audited public surface', () => {
  for (const [name, module, exports] of SURFACE) {
    it(`${name} exports exactly its responsibility`, () => {
      expect(Object.keys(module).sort()).toEqual([...exports].sort());
    });
  }

  it('every pre-split value export is accounted for exactly once', () => {
    const values = SURFACE.flatMap(([, , exports]) => exports);
    expect(new Set(values).size, 'no export is owned by two modules').toBe(values.length);
    // 62 pre-split exports, of which 1 is a type (NotificationSink) that has no runtime value: 61.
    expect(values).toHaveLength(61);
  });

  it('the compatibility barrel is gone and must not come back', () => {
    expect(existsSync(resolve(__dirname, '../../src/ui/notification-routing.ts'))).toBe(false);
  });
});
