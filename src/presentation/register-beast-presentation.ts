/**
 * Legendary-beast awakening, slaying, hoard-choice, and sighting
 * notifications (#787 phase 7). Moved verbatim from `main.ts`.
 */
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { getBeastTrophyGoldPerTurn, getHoardChoicePreview } from '@/systems/beast-system';
import { getVisibility } from '@/systems/fog-of-war';
import { showBeastSlayCeremony } from '@/ui/beast-slay-ceremony';
import { showBeastSightingBanner } from '@/ui/beast-sighting-banner';
import type { PresentationRegistrar } from '@/presentation/register-all';

export const registerBeastPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('beast:awakened', ({ beastId, position }) => {
      const def = BEAST_DEFINITIONS[beastId];
      for (const [civId, civ] of Object.entries(ctx.session.getState().civilizations)) {
        if (!civ.visibility || getVisibility(civ.visibility, position) === 'unexplored') continue;
        ctx.notifier.deliver(civId, def.awakeningFlavor, 'warning', { kind: 'map', coord: position, label: `${def.name} lair` });
      }
    }),
    bus.on('beast:slain', ({ beastId, lairId, slayerCivId, goldAwarded }) => {
      const state = ctx.session.getState();
      const def = BEAST_DEFINITIONS[beastId];
      const slayerName = state.civilizations[slayerCivId]?.name ?? slayerCivId;
      const isApex = def.tier >= 4;
      const isChoiceTier = def.tier >= 2 && !isApex;
      for (const civId of Object.keys(state.civilizations)) {
        const slayerMsg = isApex
          ? `Your forces have slain the ${def.name}! The apex hoard is yours — gold, lore, trophy, and legend.`
          : isChoiceTier
            ? `Your forces have slain the ${def.name}! Choose your reward.`
            : `Your forces have slain the ${def.name}! Hoard claimed: +${goldAwarded} gold.`;
        const message = civId === slayerCivId ? slayerMsg : `${slayerName} has slain the ${def.name}!`;
        ctx.notifier.deliver(civId, message, civId === slayerCivId ? 'success' : 'info');
      }
      if (slayerCivId === state.currentPlayer) {
        if (def.tier >= 3) {
          let rewardLines: string[];
          if (isApex) {
            const trophyGold = getBeastTrophyGoldPerTurn(def.tier);
            rewardLines = [
              `+${goldAwarded} gold`,
              'Ancient Lore claimed (+research)',
              `Beast Trophy raised (+${trophyGold} gold/turn)`,
              'Your hero is now Legendary',
            ];
          } else {
            const preview = getHoardChoicePreview(state, lairId);
            rewardLines = [
              'Choose one reward:',
              `Gold: +${preview.gold}`,
              `Lore: +${preview.lore} research`,
              `Trophy: +${preview.trophyGoldPerTurn} gold/turn`,
            ];
          }
          showBeastSlayCeremony(ctx.uiLayer, {
            beastName: def.name,
            unitType: def.unitType,
            slayerName,
            rewardLines,
            onContinue: () => { if (!isApex) ctx.maybeShowPendingHoardChoice(); },
          });
        }
        // #551: the tier<3 case's toast used to be a separate showNotification
        // call here, duplicating the delivery-contract message the loop above
        // already sent to slayerCivId. Removed; the loop's message ("Hoard
        // claimed: +N gold" / "Choose your reward.") is the single delivery
        // for this event now.
      }
    }),
    bus.on('beast:hoard-claimed', ({ beastId, civId, choice }) => {
      const def = BEAST_DEFINITIONS[beastId];
      let message: string;
      if (choice === 'gold') message = `You took the Gold Hoard of the ${def.name}.`;
      else if (choice === 'lore') message = `You claimed the Ancient Lore of the ${def.name}.`;
      else message = `You raised a ${def.name} Trophy.`;
      ctx.notifier.deliver(civId, message, 'success');
    }),
    bus.on('beast:sighted', ({ beastId, civId }) => {
      const state = ctx.session.getState();
      const def = BEAST_DEFINITIONS[beastId];
      const beasts = state.beasts;
      const lair = beasts ? Object.values(beasts.lairs).find(l => l.beastId === beastId) : undefined;
      const target = lair ? { kind: 'map' as const, coord: lair.position, label: def.name } : undefined;
      ctx.notifier.deliver(civId, def.sightingFlavor, 'info', target);
      if (civId === state.currentPlayer) {
        showBeastSightingBanner(ctx.uiLayer, {
          name: def.name,
          flavor: def.sightingFlavor,
          unitType: def.unitType,
          onContinue: () => {},
          onOpenBestiary: () => ctx.router.open('bestiary'),
        });
      }
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
