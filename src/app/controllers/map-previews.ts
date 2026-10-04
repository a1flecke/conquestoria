/**
 * Tap previews (#1243), split out of `map-interaction-controller.ts`: enemy unit
 * info, the unit-vs-unit forecast card (#1219 attack contract), the city
 * assault/bombard preview (#966 single resolver) and the barbarian camp assault
 * card. Bodies are moved verbatim.
 */
import type { HexCoord } from '@/core/types';
import { SFX } from '@/audio/sfx';
import { hexKey } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { UNIT_DESCRIPTIONS } from '@/systems/unit-descriptions';
import { classifyOwner, isAlwaysHostilePair } from '@/core/owner-kind';
import { visibleHostileUnitEntriesAtKey } from '@/input/hex-defender-selection';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { buildBattleForecastView } from '@/ui/battle-forecast-projection';
import { renderBattleForecastCard, type BattleForecastCardInput } from '@/ui/battle-forecast-card';
import { getBeastDefinitionByUnitType } from '@/systems/beast-definitions';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { getEmbarkedAssaultTarget } from '@/systems/transport-system';

import { resolveCityInteraction } from '@/systems/city-interaction';
import { renderCityActionPreview } from '@/ui/city-action-preview';
import { createGameButton } from '@/ui/ui-kit';
import type { MapInteractionControllerDeps } from './map-interaction-shared';
import { describeForeignOwner } from './map-interaction-shared';

export function showEnemyUnitInfo(deps: MapInteractionControllerDeps, intent: { readonly unitId: string }, key: string): void {
  const { session, selectionController } = deps;
    const enemyUnit = session.getState().units[intent.unitId];
    if (!enemyUnit) return;
    const def = UNIT_DEFINITIONS[enemyUnit.type];
    const desc = UNIT_DESCRIPTIONS[enemyUnit.type] ?? '';
    const ownerKind = classifyOwner(enemyUnit.owner);
    const isMinorCiv = ownerKind === 'minor';
    let ownerName: string;
    let ownerColor: string;

    if (ownerKind === 'barbarian') {
      ownerName = 'Barbarian';
      ownerColor = '#8b4513';
    } else if (ownerKind === 'pirate') {
      ownerName = 'Pirates';
      ownerColor = '#7f1d1d';
    } else if (ownerKind === 'rebel') {
      ownerName = 'Rebels';
      ownerColor = '#6b3f2a';
    } else if (ownerKind === 'beast') {
      ownerName = 'Legendary Beasts';
      ownerColor = '#7a1f2b';
    } else if (isMinorCiv) {
      const presentation = getMinorCivPresentationForPlayer(session.getState(), session.getState().currentPlayer, enemyUnit.owner, 'City-State');
      ownerName = presentation.name;
      ownerColor = presentation.color;
    } else {
      const civ = session.getState().civilizations[enemyUnit.owner];
      ownerName = civ?.name ?? enemyUnit.owner;
      ownerColor = civ?.color ?? '#888';
    }

    const alwaysHostile = isAlwaysHostilePair(session.getState().currentPlayer, enemyUnit.owner);
    const atWar = ownerKind === 'major' && (deps.currentCiv()?.diplomacy?.atWarWith.includes(enemyUnit.owner) ?? false);
    const relationshipTag = alwaysHostile ? 'Hostile' : atWar ? 'At War' : 'Neutral';
    const relColor = alwaysHostile || atWar ? '#d94a4a' : '#e8c170';

    const panel = deps.getElementById('info-panel');
    if (panel) {
      panel.style.display = 'block';
      panel.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `background:rgba(40,20,20,0.92);border-radius:12px;padding:12px 16px;border-left:4px solid ${ownerColor};`;

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

      const info = document.createElement('div');
      const ownerLine = document.createElement('div');
      ownerLine.style.cssText = `font-size:10px;color:${ownerColor};`;
      const ownerSpan = document.createTextNode(ownerName + ' ');
      const relSpan = document.createElement('span');
      relSpan.style.cssText = `color:${relColor};font-size:9px;`;
      relSpan.textContent = `(${relationshipTag})`;
      ownerLine.appendChild(ownerSpan);
      ownerLine.appendChild(relSpan);

      const unitLine = document.createElement('div');
      const boldName = document.createElement('strong');
      boldName.textContent = def.name;
      unitLine.appendChild(boldName);
      unitLine.appendChild(document.createTextNode(` · HP: ${enemyUnit.health}/100 · Str: ${def.strength}`));

      info.appendChild(ownerLine);
      info.appendChild(unitLine);

      const closeBtn = createGameButton('X', 'close');
      closeBtn.id = 'btn-deselect';
      closeBtn.setAttribute('aria-label', 'Close unit details');

      header.appendChild(info);
      header.appendChild(closeBtn);
      wrapper.appendChild(header);

      const descDiv = document.createElement('div');
      descDiv.style.cssText = 'font-size:10px;opacity:0.6;margin-top:4px;';
      descDiv.textContent = desc;
      wrapper.appendChild(descDiv);

      if (ownerKind === 'pirate') {
        const pirateWaters = createGameButton('Open Pirate Waters', 'secondary');
        pirateWaters.dataset.action = 'open-pirate-waters';
        pirateWaters.addEventListener('click', () => deps.openPirateWaters({ factionId: enemyUnit.owner }));
        wrapper.appendChild(pirateWaters);
      }

      const hostileStackSize = visibleHostileUnitEntriesAtKey(session.getState(), key).length;
      if (hostileStackSize > 1) {
        const stackDiv = document.createElement('div');
        stackDiv.style.cssText = 'font-size:10px;opacity:0.72;margin-top:4px;';
        stackDiv.textContent = `${def.name} defends this stack. ${hostileStackSize} enemy units present.`;
        wrapper.appendChild(stackDiv);
      }

      panel.appendChild(wrapper);
      closeBtn.addEventListener('click', selectionController.deselectUnit);
    }
    return;
}

export function showCombatPreview(deps: MapInteractionControllerDeps, intent: { readonly attackerId: string; readonly defenderId: string }, key: string, coord: HexCoord): void {
  const { session, selection, selectionController } = deps;
    const unit = session.getState().units[intent.attackerId];
    const defender = session.getState().units[intent.defenderId];
    if (!unit || !defender) return;
    const amphibiousAssault = Boolean(unit.transportId);
    const previewAttacker = amphibiousAssault
      ? { ...unit, position: { ...session.getState().units[unit.transportId!].position }, transportId: undefined }
      : unit;
    const defDef = UNIT_DEFINITIONS[defender.type];

    const ownerName = describeForeignOwner(deps, defender.owner);

    const viewerId = session.getState().currentPlayer;
    const view = buildBattleForecastView({
      state: session.getState(),
      viewerId,
      attacker: previewAttacker,
      defender,
      ownerName,
      options: { amphibiousAssault },
    });

    const panel = deps.getElementById('info-panel');
    if (panel) {
      panel.style.display = 'block';
      const notes: BattleForecastCardInput['notes'] = [];
      const defenderBeastDef = getBeastDefinitionByUnitType(defender.type);
      if (defenderBeastDef?.regenPerTurn) {
        notes.push({ text: `⚠ Regenerates ${defenderBeastDef.regenPerTurn} HP every turn`, emphasis: 'warning' });
      }
      if (defenderBeastDef?.navalOnly) {
        notes.push({ text: '⚠ Only ships and ranged units can fight it', emphasis: 'warning' });
      }
      const hostileStackSize = visibleHostileUnitEntriesAtKey(session.getState(), key).length;
      if (hostileStackSize > 1) {
        notes.push({ text: `${defDef.name} defends this stack. ${hostileStackSize} enemy units present.`, emphasis: 'info' });
      }
      renderBattleForecastCard(panel, { view, notes }, {
        onCancel: selectionController.deselectUnit,
        onAttack: () => {
          // Read live: the player may have changed selection between the
          // preview rendering and this confirmation.
          const attackerId = selection.getSelectedUnitId();
          const attacker = attackerId ? session.getState().units[attackerId] : undefined;
          const legality = attacker?.transportId
            ? getEmbarkedAssaultTarget(session.getState(), attacker.id, coord, { viewerId: session.getState().currentPlayer })
            : canUnitAttackTarget(session.getState(), attacker, coord, { viewerId: session.getState().currentPlayer });
          if (!legality.ok || legality.targetType !== 'unit') {
            deps.showNotification('That target is no longer attackable.', 'warning');
            if (attackerId) selectionController.selectUnit(attackerId);
            return;
          }
          deps.executeAttack(attackerId!, key);
        },
      });
    }
    return; // Wait for button press
}

export function showAssaultPreview(deps: MapInteractionControllerDeps, intent: { readonly attackerId: string; readonly cityId: string; readonly embarkedAssault?: boolean }): void {
  const { session, selection, selectionController } = deps;
    const attackerUnit = session.getState().units[intent.attackerId];
    const targetCity = session.getState().cities[intent.cityId];
    if (!attackerUnit || !targetCity) return;

    const attackerMultiplier = intent.embarkedAssault
      ? getAmphibiousAssaultMultiplier(session.getState(), attackerUnit, targetCity.position)
      : undefined;
    const effectiveAttacker = intent.embarkedAssault && attackerUnit.transportId
      ? { ...attackerUnit, position: { ...session.getState().units[attackerUnit.transportId].position }, transportId: undefined }
      : attackerUnit;

    // #966: the preview's numbers, labels and denial copy all come from the single
    // city-action resolver, so what the player is shown can never drift from what the
    // executor will accept.
    const interaction = resolveCityInteraction(
      session.getState(),
      effectiveAttacker,
      targetCity,
      { attackerMultiplier },
    );
    // Single source for the attacker's own strength too -- the resolver already ran
    // calculateCityAssaultStrengths, so recomputing it here would be a second source
    // that could drift from the odds shown beside it.
    const captureAction = interaction.available.find(
      (action): action is Extract<typeof action, { kind: 'capture' }> => action.kind === 'capture',
    );

    const panel = deps.getElementById('info-panel');
    if (panel) {
      panel.style.display = 'block';
      renderCityActionPreview(panel, {
        attackerName: UNIT_DEFINITIONS[attackerUnit.type].name,
        attackerStrength: captureAction?.attackerStrength ?? 0,
        cityName: targetCity.name,
        cityHp: targetCity.hp ?? 100,
        interaction,
        infoText: intent.embarkedAssault
          ? 'Landing -50%. Marine training and adjacent shore bombardment are included.'
          : 'A walled city fights back if it has no garrison.',
      }, {
        onCancel: selectionController.deselectUnit,
        onBombard: () => {
          deps.bombardCity(selection.getSelectedUnitId()!, intent.cityId);
        },
        onHoldSiege: () => {
          deps.holdSiege(selection.getSelectedUnitId()!, intent.cityId);
        },
        onAttackDefender: () => {
          deps.executeAttack(selection.getSelectedUnitId()!, hexKey(targetCity.position));
        },
        onCapture: () => {
          // Read live, as the module binding this replaced did.
          const assaultStatus = deps.beginPlayerCityAssault(selection.getSelectedUnitId()!, intent.cityId, undefined, undefined, intent.embarkedAssault);
          SFX.combat();
          if (assaultStatus === 'resolved') {
            setTimeout(() => selectionController.selectNextUnit(), 400);
          }
        },
      });
    }
    return;
}

export function showCampAssaultPreview(deps: MapInteractionControllerDeps, intent: { readonly attackerId: string; readonly campId: string }): void {
  const { session, selection, selectionController } = deps;
    const attackerUnit = session.getState().units[intent.attackerId];
    const camp = session.getState().barbarianCamps[intent.campId];
    if (!attackerUnit || !camp) return;

    const panel = deps.getElementById('info-panel');
    if (panel) {
      panel.style.display = 'block';
      const previewDiv = document.createElement('div');
      previewDiv.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';

      const title = document.createElement('div');
      title.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:6px;';
      title.textContent = camp.banditLordName ? `Assault ${camp.banditLordName}'s Camp` : 'Assault Barbarian Camp';
      previewDiv.appendChild(title);

      const info = document.createElement('div');
      info.style.cssText = 'font-size:11px;opacity:0.8;margin-bottom:8px;';
      info.textContent = `${UNIT_DEFINITIONS[attackerUnit.type].name} destroys the camp for +${15 + camp.strength * 2} gold. No garrison to fight.`;
      previewDiv.appendChild(info);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;';
      const attackBtn = document.createElement('button');
      attackBtn.id = 'btn-assault-camp-confirm';
      attackBtn.textContent = 'Attack';
      attackBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;';
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'btn-cancel-assault-camp';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
      btnRow.appendChild(attackBtn);
      btnRow.appendChild(cancelBtn);
      previewDiv.appendChild(btnRow);

      panel.innerHTML = '';
      panel.appendChild(previewDiv);

      cancelBtn.addEventListener('click', selectionController.deselectUnit);
      attackBtn.addEventListener('click', () => {
        // Read live, as the assault-preview branch above does.
        deps.beginPlayerCampAssault(selection.getSelectedUnitId()!, intent.campId);
        setTimeout(() => selectionController.selectNextUnit(), 400);
      });
    }
    return;
}
