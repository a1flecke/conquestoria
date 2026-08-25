import type { City, GameState } from '@/core/types';
import { createGameButton } from '@/ui/ui-kit';
import { getLegalStrategicLaunchTargets, isStrategicStrikeRetaliation } from '@/systems/strategic-launch-system';
import { getStrategicStrikePreviewEffect, STRIKE_BLAST_RADIUS } from '@/systems/strategic-strike-system';
import { SACK_GOLD_LOSS_FRACTION } from '@/systems/city-siege-system';
import { getStrategicArsenal } from '@/systems/strategic-arsenal-system';
import {
  getStrategicLaunchPreviewPresentation,
  type StrategicLaunchPreviewPresentation,
} from '@/systems/strategic-launch-preview-presentation';

export interface StrategicLaunchFlowCallbacks {
  /** Drives the map overlay -- called with a non-null presentation the moment
   * a target is selected (stage 2), and with null on advancing to stage 3,
   * cancelling, or closing. */
  onSetPreview: (presentation: StrategicLaunchPreviewPresentation | null) => void;
  onConfirmLaunch: (targetCityId: string) => void;
  onClose: () => void;
}

const REPUTATION_DELTAS_BY_KIND = {
  unprovoked: { target: -60, witness: -25 },
  retaliation: { target: -20, witness: -5 },
} as const;

export function createStrategicLaunchFlow(
  container: HTMLElement,
  state: GameState,
  actorCivId: string,
  callbacks: StrategicLaunchFlowCallbacks,
): HTMLElement {
  document.getElementById('strategic-launch-flow')?.remove();

  const root = document.createElement('div');
  root.id = 'strategic-launch-flow';
  root.style.cssText = 'position:absolute;inset:0;background:rgba(10,10,20,0.92);z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;';

  const card = document.createElement('div');
  card.style.cssText = 'position:relative;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;background:rgba(30,18,16,0.98);border:1px solid rgba(200,60,40,0.45);border-radius:18px;padding:20px;color:#f5e7c9;';
  root.appendChild(card);

  let selectedTargetId: string | null = null;
  let stage: 'select-target' | 'confirm' = 'select-target';

  function close(): void {
    callbacks.onSetPreview(null);
    callbacks.onClose();
    root.remove();
  }

  function render(): void {
    card.textContent = '';

    const closeButton = createGameButton('✕', 'close');
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.style.cssText += 'position:absolute;top:12px;right:12px;font-size:20px;';
    closeButton.addEventListener('click', close);
    card.appendChild(closeButton);

    if (stage === 'select-target') renderSelectTarget();
    else renderConfirm();
  }

  function renderSelectTarget(): void {
    const title = document.createElement('h2');
    title.textContent = 'Select Strategic Launch Target';
    title.style.cssText = 'margin:0 0 8px;font-size:20px;color:#e8917a;';
    card.appendChild(title);

    const targets = getLegalStrategicLaunchTargets(state, actorCivId);
    if (targets.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No legal targets are currently in range.';
      empty.style.cssText = 'opacity:0.75;margin:12px 0;';
      card.appendChild(empty);
      return;
    }

    for (const city of targets) {
      const row = document.createElement('div');
      row.dataset.targetCityId = city.id;
      row.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer;';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');

      const name = document.createElement('div');
      name.textContent = city.name;
      name.style.cssText = 'font-weight:bold;margin-bottom:4px;';
      row.appendChild(name);

      row.addEventListener('click', () => selectTarget(city));
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') selectTarget(city);
      });

      card.appendChild(row);

      if (selectedTargetId === city.id) {
        renderImpactPreview(city, getStrategicLaunchPreviewPresentation(state, city.id));
      }
    }
  }

  function selectTarget(city: City): void {
    selectedTargetId = city.id;
    callbacks.onSetPreview(getStrategicLaunchPreviewPresentation(state, city.id));
    render();
  }

  function renderImpactPreview(city: City, presentation: StrategicLaunchPreviewPresentation): void {
    const preview = document.createElement('div');
    preview.style.cssText = 'background:rgba(200,60,40,0.12);border:1px solid rgba(200,60,40,0.4);border-radius:10px;padding:12px;margin:-2px 0 14px;font-size:13px;';

    const devastatedCount = presentation.tiles.length;
    const isRetaliation = isStrategicStrikeRetaliation(state, actorCivId, city.owner);
    const deltas = isRetaliation ? REPUTATION_DELTAS_BY_KIND.retaliation : REPUTATION_DELTAS_BY_KIND.unprovoked;
    const arsenalAfter = Math.max(0, getStrategicArsenal(state.civilizations[actorCivId]!) - 1);
    const effect = getStrategicStrikePreviewEffect(state, city.id);

    const lines = [
      `${devastatedCount} surrounding tile(s) will be devastated for multiple turns.`,
      effect?.hasGarrison
        ? `${city.name} is garrisoned -- the strike will be at least partially blocked. No gold will be lost.`
        : `${city.name} will be struck down to 1 HP. It will lose ${effect?.goldLost ?? 0} gold.`,
      isRetaliation
        ? `Relations with this civ will fall by ${deltas.target} (retaliation). Witnesses will react by ${deltas.witness}.`
        : `Relations with this civ will fall sharply by ${deltas.target} (unprovoked first use). Witnesses will react by ${deltas.witness}.`,
      `Arsenal after launch: ${arsenalAfter}.`,
    ];
    for (const line of lines) {
      const p = document.createElement('div');
      p.textContent = line;
      p.style.cssText = 'margin-bottom:4px;';
      preview.appendChild(p);
    }

    // Progressive disclosure (spec §14): plain-language sentence + key
    // numbers above are always visible; exact mechanics are opt-in via a
    // native <details> element (keyboard-accessible, no animation, no
    // color-only signal by construction).
    const details = document.createElement('details');
    details.style.cssText = 'margin-top:8px;font-size:12px;opacity:0.85;';
    const summary = document.createElement('summary');
    summary.textContent = 'Exact mechanics';
    summary.style.cssText = 'cursor:pointer;';
    details.appendChild(summary);
    const mechanicsLines = [
      `Blast radius: ${STRIKE_BLAST_RADIUS} tiles from the target city.`,
      `Gold loss (if undefended): ${Math.round(SACK_GOLD_LOSS_FRACTION * 100)}% of the defending civ's treasury.`,
      `A garrisoned city blocks the gold loss and floors the HP outcome instead of a full siege result.`,
    ];
    for (const line of mechanicsLines) {
      const p = document.createElement('div');
      p.textContent = line;
      p.style.cssText = 'margin-top:4px;';
      details.appendChild(p);
    }
    preview.appendChild(details);

    card.appendChild(preview);

    const advanceButton = createGameButton('Continue', 'danger');
    advanceButton.dataset.action = 'advance-to-confirm';
    advanceButton.addEventListener('click', () => {
      stage = 'confirm';
      callbacks.onSetPreview(null);
      render();
    });
    card.appendChild(advanceButton);
  }

  function renderConfirm(): void {
    const title = document.createElement('h2');
    title.textContent = 'Confirm Strategic Launch';
    title.style.cssText = 'margin:0 0 8px;font-size:20px;color:#e8917a;';
    card.appendChild(title);

    const copyLines = ['The city lies in ruins.', 'Fallout has devastated the surrounding region.', 'This cannot be undone.'];
    for (const line of copyLines) {
      const p = document.createElement('div');
      p.textContent = line;
      p.style.cssText = 'margin-bottom:8px;font-size:14px;';
      card.appendChild(p);
    }

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex;gap:10px;margin-top:16px;';

    const backButton = createGameButton('Back', 'ghost');
    backButton.dataset.action = 'back-to-select';
    backButton.addEventListener('click', () => {
      stage = 'select-target';
      render();
    });

    const confirmButton = createGameButton('Launch', 'danger');
    confirmButton.dataset.action = 'confirm-launch';
    confirmButton.addEventListener('click', () => {
      const targetId = selectedTargetId!;
      close();
      callbacks.onConfirmLaunch(targetId);
    });

    buttonRow.appendChild(backButton);
    buttonRow.appendChild(confirmButton);
    card.appendChild(buttonRow);
  }

  render();
  container.appendChild(root);
  return root;
}
