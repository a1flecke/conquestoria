import { createGameButton } from '@/ui/ui-kit';
import type { GovernancePresentation } from '@/systems/governance-presentation';
import type { GovernancePolicyId } from '@/systems/governance-types';

const FACTION_LABEL: Record<string, string> = {
  military: 'Military', merchants: 'Merchants', clergy: 'Clergy', commons: 'Commons',
};

export function createGovernancePanel(
  container: HTMLElement,
  presentation: GovernancePresentation,
  onTogglePolicy: (policyId: GovernancePolicyId, enabled: boolean) => void,
  onToggleGovernor: (cityId: string, assign: boolean) => void,
  onMoveGovernor: (fromCityId: string, toCityId: string) => void,
  onClose: () => void,
): HTMLElement {
  document.getElementById('governance-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'governance-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(10,10,20,0.92);z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:480px;width:100%;max-height:85vh;overflow-y:auto;background:rgba(24,22,16,0.98);border:1px solid rgba(232,193,112,0.4);border-radius:18px;padding:20px;color:#f4f1e8;';
  panel.appendChild(card);

  const closeButton = createGameButton('✕', 'close');
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.style.cssText += 'float:right;font-size:20px;';
  closeButton.addEventListener('click', () => {
    onClose();
    panel.remove();
  });
  card.appendChild(closeButton);

  const title = document.createElement('h2');
  title.textContent = 'Governance';
  title.style.cssText = 'margin:0 0 12px;font-size:20px;color:#e8c170;';
  card.appendChild(title);

  const postureLine = document.createElement('div');
  postureLine.textContent = `Posture: ${presentation.posture === 'autonomous' ? 'Autonomous (Federal Autonomy)' : 'Centralized'}`;
  postureLine.style.cssText = 'margin-bottom:6px;font-size:14px;';
  postureLine.title = 'Toggle Federal Autonomy from the top bar once Decolonization is researched.';
  card.appendChild(postureLine);

  const capacityLine = document.createElement('div');
  capacityLine.textContent = `Administrative capacity: ${presentation.loadTotal} / ${presentation.capacityTotal} used`;
  capacityLine.style.cssText = 'margin-bottom:14px;font-size:14px;opacity:0.9;';
  card.appendChild(capacityLine);

  const policiesTitle = document.createElement('div');
  policiesTitle.textContent = 'Policies:';
  policiesTitle.style.cssText = 'font-weight:bold;margin:6px 0 8px;';
  card.appendChild(policiesTitle);

  for (const policy of presentation.policies) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:12px;padding:10px;border:1px solid rgba(255,255,255,0.12);border-radius:10px;';

    const nameLine = document.createElement('div');
    nameLine.textContent = `${policy.name} (load ${policy.loadCost})`;
    nameLine.style.cssText = 'font-weight:bold;margin-bottom:4px;';
    row.appendChild(nameLine);

    const descLine = document.createElement('div');
    descLine.textContent = policy.description;
    descLine.style.cssText = 'font-size:12px;opacity:0.85;margin-bottom:4px;';
    row.appendChild(descLine);

    const factionLine = document.createElement('div');
    const pleasesText = policy.pleases.map(f => FACTION_LABEL[f] ?? f).join(', ');
    const angersText = policy.angers.map(f => FACTION_LABEL[f] ?? f).join(', ');
    factionLine.textContent = `Pleases: ${pleasesText} · Angers: ${angersText}`;
    factionLine.style.cssText = 'font-size:12px;opacity:0.75;margin-bottom:8px;';
    row.appendChild(factionLine);

    const toggleButton = createGameButton(
      policy.active ? 'Repeal' : 'Adopt',
      policy.active ? 'danger' : 'primary',
      { disabled: !policy.canToggle },
    );
    if (!policy.canToggle && policy.lockedUntilTurn !== null) {
      toggleButton.title = `Locked until turn ${policy.lockedUntilTurn}.`;
    } else if (!policy.canToggle && !policy.active) {
      toggleButton.title = 'Not enough governance capacity.';
    }
    toggleButton.addEventListener('click', () => onTogglePolicy(policy.id, !policy.active));
    row.appendChild(toggleButton);

    card.appendChild(row);
  }

  const governorsTitle = document.createElement('div');
  governorsTitle.textContent = 'Governors:';
  governorsTitle.style.cssText = 'font-weight:bold;margin:16px 0 8px;';
  card.appendChild(governorsTitle);

  if (presentation.governorCities.length === 0) {
    const none = document.createElement('div');
    none.textContent = 'No cities to govern.';
    none.style.cssText = 'font-size:12px;opacity:0.7;';
    card.appendChild(none);
  }

  for (const governorCity of presentation.governorCities) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:8px 10px;border:1px solid rgba(255,255,255,0.12);border-radius:10px;';

    const label = document.createElement('div');
    label.textContent = `${governorCity.cityName} — pressure ${governorCity.pressure}${governorCity.governed ? ' (governed)' : ''}`;
    label.style.cssText = 'font-size:13px;';
    row.appendChild(label);

    const toggleButton = createGameButton(
      governorCity.governed ? 'Remove' : 'Assign',
      governorCity.governed ? 'danger' : 'primary',
      { disabled: !governorCity.canToggle },
    );
    if (!governorCity.canToggle && governorCity.lockedUntilTurn !== null) {
      toggleButton.title = `Locked until turn ${governorCity.lockedUntilTurn}.`;
    } else if (!governorCity.canToggle && !governorCity.governed) {
      toggleButton.title = 'Not enough governance capacity.';
    }
    toggleButton.addEventListener('click', () => onToggleGovernor(governorCity.cityId, !governorCity.governed));
    row.appendChild(toggleButton);

    card.appendChild(row);

    if (governorCity.governed) {
      const destinations = presentation.governorCities.filter(
        c => c.cityId !== governorCity.cityId && !c.governed && c.canToggle,
      );
      if (destinations.length > 0) {
        const moveRow = document.createElement('div');
        moveRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:-4px 0 8px 10px;';

        const select = document.createElement('select');
        select.style.cssText = 'flex:1;background:rgba(0,0,0,0.3);color:#f4f1e8;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:4px;min-height:32px;';
        for (const destination of destinations) {
          const option = document.createElement('option');
          option.value = destination.cityId;
          option.textContent = destination.cityName;
          select.appendChild(option);
        }
        moveRow.appendChild(select);

        const moveButton = createGameButton('Move', 'secondary', { disabled: !governorCity.canToggle });
        if (!governorCity.canToggle && governorCity.lockedUntilTurn !== null) {
          moveButton.title = `Locked until turn ${governorCity.lockedUntilTurn}.`;
        }
        moveButton.addEventListener('click', () => onMoveGovernor(governorCity.cityId, select.value));
        moveRow.appendChild(moveButton);

        card.appendChild(moveRow);
      }
    }
  }

  container.appendChild(panel);
  return panel;
}
