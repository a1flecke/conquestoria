import type { CityInteraction } from '@/systems/city-interaction';

/**
 * #966: the city assault/attack preview, extracted out of `map-interaction-controller.ts`.
 *
 * That controller builds every preview as ~80 lines of inline DOM inside one giant switch;
 * the city preview is about to grow a third action (Bombard, Phase 2) plus denial copy, so
 * it gets its own module now rather than making the switch worse.
 *
 * All dynamic text goes through `textContent`, never `innerHTML` -- city and unit names are
 * game-generated strings.
 */
export interface CityActionPreviewInput {
  attackerName: string;
  attackerStrength: number;
  cityName: string;
  /** Current city HP out of 100, shown so "−12 HP" means something to the player. */
  cityHp: number;
  interaction: CityInteraction;
  /** Extra explanatory line, e.g. the amphibious-landing penalty note. */
  infoText: string;
}

export interface CityActionPreviewCallbacks {
  onCapture: () => void;
  onBombard: () => void;
  /** Bombard now AND keep bombarding each turn until something stops it (#974). */
  onHoldSiege: () => void;
  onAttackDefender: () => void;
  onCancel: () => void;
}

function oddsLabel(winProbability: number): { text: string; color: string } {
  if (winProbability > 0.55) return { text: 'Favorable', color: '#6b9b4b' };
  if (winProbability > 0.45) return { text: 'Even', color: '#e8c170' };
  return { text: 'Risky', color: '#d94a4a' };
}

/**
 * `54 → 32 (damaged)` when the city has taken bombardment damage, plain `54` otherwise.
 * Without this the entire HP-scales-defense mechanic is invisible: the player would have
 * no way to learn that softening a city improves their odds.
 */
export function formatCityDefenseText(cityName: string, before: number, after: number): string {
  const roundedBefore = Math.round(before);
  const roundedAfter = Math.round(after);
  return roundedAfter < roundedBefore
    ? `${cityName} defenses (${roundedBefore} → ${roundedAfter} damaged)`
    : `${cityName} defenses (${roundedBefore})`;
}

export function renderCityActionPreview(
  container: HTMLElement,
  input: CityActionPreviewInput,
  callbacks: CityActionPreviewCallbacks,
): void {
  const capture = input.interaction.available.find(action => action.kind === 'capture');

  const previewDiv = document.createElement('div');
  previewDiv.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:6px;';
  title.textContent = 'City Actions';
  previewDiv.appendChild(title);

  const stats = document.createElement('div');
  stats.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;';

  const atkSpan = document.createElement('span');
  atkSpan.textContent = `${input.attackerName} (${Math.round(input.attackerStrength)})`;
  stats.appendChild(atkSpan);

  if (capture?.kind === 'capture') {
    const odds = oddsLabel(capture.winProbability);
    const oddsSpan = document.createElement('span');
    oddsSpan.style.cssText = `color:${odds.color};font-weight:bold;`;
    oddsSpan.textContent = odds.text;
    stats.appendChild(oddsSpan);

    const defSpan = document.createElement('span');
    defSpan.textContent = formatCityDefenseText(input.cityName, capture.defenseBefore, capture.defenseAfter);
    stats.appendChild(defSpan);
  }
  previewDiv.appendChild(stats);

  // Without a visible HP figure, "-12 HP" is meaningless to a player who does not know
  // cities have hit points at all.
  const hpLine = document.createElement('div');
  hpLine.style.cssText = 'font-size:11px;opacity:0.85;margin-bottom:6px;';
  hpLine.textContent = `City strength: ${Math.max(0, Math.round(input.cityHp))}/100`;
  previewDiv.appendChild(hpLine);

  const info = document.createElement('div');
  info.style.cssText = 'font-size:10px;opacity:0.6;margin-bottom:8px;';
  info.textContent = input.infoText;
  previewDiv.appendChild(info);

  // Truthful denials: an action that is nearly legal says why, rather than silently
  // vanishing from the panel (the #966 complaint in its original form).
  for (const denial of input.interaction.denied) {
    const line = document.createElement('div');
    line.style.cssText = 'font-size:10px;color:#f4c842;margin-bottom:6px;';
    line.textContent = denial.reason;
    previewDiv.appendChild(line);
  }

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

  const actionButton = (id: string, label: string, background: string, onClick: () => void) => {
    const button = document.createElement('button');
    button.id = id;
    button.textContent = label;
    button.style.cssText = `flex:1;min-width:120px;padding:8px;border-radius:8px;background:${background};border:none;color:white;font-weight:bold;cursor:pointer;`;
    button.addEventListener('click', onClick);
    btnRow.appendChild(button);
  };

  // Order is deliberate: fight the defender, wear the city down, then take it -- the order a
  // player works through a siege.
  const defenderAction = input.interaction.available.find(action => action.kind === 'attack-defender');
  if (defenderAction?.kind === 'attack-defender') {
    actionButton('btn-attack-defender', defenderAction.label, '#d94a4a', callbacks.onAttackDefender);
  }

  const bombard = input.interaction.available.find(action => action.kind === 'bombard');
  if (bombard?.kind === 'bombard') {
    const label = bombard.counterFire > 0
      ? `${bombard.label} (−${bombard.counterFire} to you)`
      : bombard.label;
    actionButton('btn-bombard-city', label, '#b8622f', callbacks.onBombard);
    // A siege runs at least 5 turns by design (the per-turn damage cap), so offering the
    // standing order right beside the single shot is what keeps it a decision rather than
    // five identical clicks per unit.
    actionButton('btn-hold-siege', 'Hold siege', '#8a5a2b', callbacks.onHoldSiege);
  }

  if (capture?.kind === 'capture') {
    actionButton('btn-assault-confirm', capture.label, '#d94a4a', callbacks.onCapture);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'btn-cancel-assault';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
  cancelBtn.addEventListener('click', callbacks.onCancel);
  btnRow.appendChild(cancelBtn);

  previewDiv.appendChild(btnRow);

  container.innerHTML = '';
  container.appendChild(previewDiv);
}
