import type { PirateActionResult } from '@/systems/pirate-actions';
import type {
  PirateFocusTarget,
  PirateWatersPresentation,
} from '@/systems/pirate-presentation';
import { createGameButton } from '@/ui/ui-kit';

export interface PirateWatersCallbacks {
  onClose(): void;
  onSelectFaction(factionId: string): void;
  onSelectHistory?(historyId: string): void;
  onFocus(target: PirateFocusTarget): void;
  onPayTribute(factionId: string): PirateActionResult | unknown;
  onHireFlotilla(factionId: string, targetId: string): PirateActionResult | unknown;
  onOpenAssault(factionId: string): void;
}

function text(tag: 'div' | 'span' | 'strong' | 'h2' | 'p', value: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

export function closePirateWatersPanels(container: ParentNode = document): void {
  container.querySelector('#pirate-waters-panel')?.remove();
  container.querySelector('#pirate-headquarters-assault-panel')?.remove();
}

export function createPirateWatersPanel(
  container: HTMLElement,
  presentation: PirateWatersPresentation,
  callbacks: PirateWatersCallbacks,
): HTMLElement {
  container.querySelector('#pirate-waters-panel')?.remove();
  const panel = document.createElement('section');
  panel.id = 'pirate-waters-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'pirate-waters-title');
  panel.dataset.layout = window.innerWidth <= 640 ? 'bottom-sheet' : 'side-panel';
  panel.style.cssText = panel.dataset.layout === 'bottom-sheet'
    ? 'position:absolute;left:0;right:0;bottom:0;max-height:72vh;overflow:auto;background:#111827;color:#f8fafc;padding:16px;z-index:30;border-radius:16px 16px 0 0;'
    : 'position:absolute;right:0;top:0;bottom:0;width:min(420px,90vw);overflow:auto;background:#111827;color:#f8fafc;padding:16px;z-index:30;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;';
  const title = text('h2', 'Pirate Waters');
  title.id = 'pirate-waters-title';
  header.appendChild(title);
  const close = createGameButton('X', 'close');
  close.setAttribute('aria-label', 'Close Pirate Waters');
  close.addEventListener('click', callbacks.onClose);
  header.appendChild(close);
  panel.appendChild(header);

  const layout = document.createElement('div');
  layout.dataset.layout = 'pirate-waters-content';
  layout.style.cssText = panel.dataset.layout === 'bottom-sheet'
    ? 'display:grid;grid-template-columns:minmax(0,1fr);gap:12px;'
    : 'display:grid;grid-template-columns:minmax(130px,0.8fr) minmax(0,1.4fr);gap:12px;';
  const list = document.createElement('nav');
  list.setAttribute('aria-label', 'Discovered pirate factions');
  for (const faction of presentation.factions) {
    const button = createGameButton(faction.name, faction.factionId === presentation.selectedFactionId ? 'primary' : 'secondary');
    button.dataset.pirateFaction = faction.factionId;
    button.style.width = '100%';
    button.style.marginBottom = '8px';
    button.addEventListener('click', () => callbacks.onSelectFaction(faction.factionId));
    list.appendChild(button);
  }
  for (const history of presentation.history) {
    const button = createGameButton(`${history.factionName} (history)`, history.id === presentation.selectedHistoryId ? 'primary' : 'secondary');
    button.dataset.pirateHistory = history.id;
    button.style.width = '100%';
    button.style.marginBottom = '8px';
    button.addEventListener('click', () => callbacks.onSelectHistory?.(history.id));
    list.appendChild(button);
  }
  layout.appendChild(list);

  const selected = presentation.factions.find(faction => faction.factionId === presentation.selectedFactionId)
    ?? presentation.factions[0];
  const selectedHistory = presentation.history.find(entry => entry.id === presentation.selectedHistoryId);
  const dossier = document.createElement('div');
  const requestConfirmation = (
    message: string,
    action: string,
    confirmAction: string,
    onConfirm: () => void,
  ): void => {
    dossier.querySelector('[data-pirate-confirmation]')?.remove();
    const confirmation = document.createElement('div');
    confirmation.dataset.pirateConfirmation = action;
    confirmation.style.cssText = 'margin-top:12px;padding:12px;border:1px solid rgba(232,193,112,0.6);border-radius:8px;background:rgba(232,193,112,0.08);';
    confirmation.appendChild(text('p', message));
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    const cancel = createGameButton('Cancel', 'ghost');
    cancel.addEventListener('click', () => confirmation.remove());
    const confirm = createGameButton(confirmAction, 'primary');
    confirm.dataset.action = `confirm-${action}`;
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      cancel.disabled = true;
      onConfirm();
    });
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    confirmation.appendChild(actions);
    dossier.appendChild(confirmation);
  };
  if (selectedHistory) {
    dossier.appendChild(text('strong', selectedHistory.factionName));
    dossier.appendChild(text('p', selectedHistory.summary));
    dossier.appendChild(text('p', `Recorded in round ${selectedHistory.round}.`));
  } else if (!selected) {
    dossier.appendChild(text('p', 'No pirate factions are currently known.'));
  } else {
    dossier.appendChild(text('strong', selected.name));
    dossier.appendChild(text('p', selected.level === 'rumor'
      ? 'Only a broad region is known.'
      : `${selected.behavior ?? 'Unknown behavior'} · Maritime stage ${selected.maritimeStage ?? '?'}`));
    if (selected.focusTarget) {
      const focus = createGameButton(selected.focusTarget.label, 'secondary');
      focus.dataset.action = 'focus-headquarters';
      focus.addEventListener('click', () => callbacks.onFocus(selected.focusTarget!));
      dossier.appendChild(focus);
    }

    const tribute = createGameButton(
      selected.tributeQuote.available ? `Pay ${selected.tributeQuote.cost} gold tribute` : 'Pay tribute',
      'primary',
      { disabled: !selected.tributeQuote.available },
    );
    tribute.dataset.action = 'pay-tribute';
    tribute.addEventListener('click', () => {
      requestConfirmation(
        `Pay ${selected.tributeQuote.cost} gold for ${selected.tributeQuote.durationRounds ?? 0} rounds of protection?`,
        'pay-tribute',
        'Confirm tribute',
        () => {
          callbacks.onPayTribute(selected.factionId);
        },
      );
    });
    dossier.appendChild(tribute);
    if (!selected.tributeQuote.available && selected.tributeQuote.reason) {
      dossier.appendChild(text('p', selected.tributeQuote.reason));
    }

    if (selected.contractTargets.length > 0) {
      const select = document.createElement('select');
      select.dataset.contractTarget = 'true';
      select.setAttribute('aria-label', 'Pirate contract target');
      select.style.cssText = 'display:block;width:100%;min-height:44px;margin-top:12px;background:#1f2937;color:#fff;border:1px solid #d4a13c;border-radius:8px;padding:8px;';
      for (const target of selected.contractTargets) {
        const option = document.createElement('option');
        option.value = target.civId;
        option.textContent = target.name;
        select.appendChild(option);
      }
      dossier.appendChild(select);
      const hire = createGameButton('Hire flotilla', 'secondary');
      hire.dataset.action = 'hire-flotilla';
      hire.addEventListener('click', () => {
        const target = selected.contractTargets.find(candidate => candidate.civId === select.value);
        if (!target) return;
        requestConfirmation(
          `Spend ${target.cost} gold to hire this flotilla against ${target.name} for ${target.durationRounds} rounds? Exposure remains possible after successful raids.`,
          'hire-flotilla',
          'Confirm contract',
          () => {
            callbacks.onHireFlotilla(selected.factionId, target.civId);
          },
        );
      });
      dossier.appendChild(hire);
    } else if (selected.contractUnavailableReason) {
      dossier.appendChild(text('p', selected.contractUnavailableReason));
    }

    if (selected.headquarters?.kind === 'coastal-enclave' && selected.headquarters.current) {
      const assault = createGameButton('Assault enclave', 'danger');
      assault.dataset.action = 'assault-enclave';
      assault.addEventListener('click', () => callbacks.onOpenAssault(selected.factionId));
      dossier.appendChild(assault);
    }
  }
  layout.appendChild(dossier);
  panel.appendChild(layout);
  container.appendChild(panel);
  return panel;
}
