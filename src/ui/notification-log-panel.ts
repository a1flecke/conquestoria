import type { NotificationCityAction, NotificationEntry, NotificationMapTarget, PirateNotificationReview } from '@/core/notification-log';
import { createGameButton } from '@/ui/ui-kit';

interface NotificationLogPanelOptions {
  onClose: () => void;
  onFocusTarget: (target: NotificationMapTarget) => void;
  onOpenCity?: (cityId: string) => void;
  onOpenWonderCity?: (action: NotificationCityAction) => void;
  onReviewPirate?: (review: PirateNotificationReview) => void;
  onMarkRead?: (notificationId: string) => void;
}

const colors: Record<NotificationEntry['type'], string> = {
  info: '#e8c170',
  success: '#6b9b4b',
  warning: '#d94a4a',
};

export function createNotificationLogPanel(
  entries: NotificationEntry[],
  options: NotificationLogPanelOptions,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'notification-log';
  panel.setAttribute('aria-label', 'Message log');
  panel.style.cssText = 'position:absolute;top:70px;right:12px;width:280px;max-height:300px;overflow-y:auto;background:rgba(10,10,30,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:10px;z-index:25;padding:12px;';

  const header = document.createElement('div');
  header.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:8px;display:flex;justify-content:space-between;';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = 'Message Log';
  const closeBtn = createGameButton('X', 'close');
  closeBtn.id = 'close-log';
  closeBtn.setAttribute('aria-label', 'Close message log');
  header.appendChild(headerTitle);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:11px;opacity:0.5;text-align:center;';
    empty.textContent = 'No messages yet';
    panel.appendChild(empty);
  } else {
    for (let i = entries.length - 1; i >= 0; i--) {
      panel.appendChild(createNotificationRow(entries[i]!, options));
    }
  }

  closeBtn.addEventListener('click', options.onClose);
  return panel;
}

function createNotificationRow(
  entry: NotificationEntry,
  options: NotificationLogPanelOptions,
): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'font-size:11px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
  if (entry.target?.kind === 'map') {
    row.dataset.notificationTarget = 'map';
    row.style.cursor = 'pointer';
    row.title = `Focus ${entry.target.label}`;
    row.addEventListener('click', event => {
      event.stopPropagation();
      options.onFocusTarget(entry.target!);
    });
  }
  if (entry.linkedCityId) {
    row.dataset.notificationCity = entry.linkedCityId;
    row.style.cursor = 'pointer';
    row.title = 'Open city panel';
    row.addEventListener('click', event => {
      event.stopPropagation();
      options.onOpenCity?.(entry.linkedCityId!);
    });
  }

  const turnSpan = document.createElement('span');
  turnSpan.style.cssText = `color:${colors[entry.type]};opacity:0.7;margin-right:4px;`;
  turnSpan.textContent = `T${entry.turn}`;
  const jumpTarget = entry.target?.kind === 'map' ? entry.target : null;
  const jumpCityId = entry.linkedCityId ?? null;
  if (jumpTarget || jumpCityId) {
    // #1459: a pointer shortcut needs a keyboard equivalent. The row (which also holds other buttons) stays
    // clickable; the message itself is the control that does the same thing.
    row.dataset.pointerShortcut = 'true';
    const message = document.createElement('button');
    message.type = 'button';
    message.style.cssText = 'display:block;width:100%;min-height:44px;background:none;border:none;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer;';
    message.setAttribute('aria-label', `${jumpCityId ? 'Open city' : `Focus ${jumpTarget!.label}`}: turn ${entry.turn}, ${entry.message}`);
    message.appendChild(turnSpan);
    message.appendChild(document.createTextNode(entry.message));
    message.addEventListener('click', event => {
      event.stopPropagation();
      if (jumpCityId) options.onOpenCity?.(jumpCityId);
      else options.onFocusTarget(jumpTarget!);
    });
    row.appendChild(message);
  } else {
    row.appendChild(turnSpan);
    row.appendChild(document.createTextNode(entry.message));
  }
  for (const action of entry.cityActions ?? []) {
    const actionButton = createGameButton(action.label, 'secondary');
    actionButton.dataset.wonderCityAction = action.cityId;
    actionButton.style.marginTop = '6px';
    actionButton.addEventListener('click', event => {
      event.stopPropagation();
      options.onOpenWonderCity?.(action);
    });
    row.appendChild(actionButton);
  }
  if (entry.review) {
    const reviewButton = createGameButton('Review', 'secondary');
    reviewButton.dataset.reviewPirate = entry.review.kind;
    reviewButton.style.marginTop = '6px';
    reviewButton.addEventListener('click', event => {
      event.stopPropagation();
      options.onMarkRead?.(entry.id);
      options.onReviewPirate?.(entry.review!);
    });
    row.appendChild(reviewButton);
  }
  if (entry.combatDetails) {
    const details = document.createElement('div');
    details.hidden = true;
    details.dataset.combatDetails = 'true';
    details.style.cssText = 'margin-top:6px;padding:6px;background:rgba(255,255,255,0.06);font-size:10px;';
    for (const fact of entry.combatDetails.facts) {
      const line = document.createElement('div');
      const value = fact.operation === 'multiplier' ? `×${fact.value}` : `${fact.value >= 0 ? '+' : ''}${fact.value}`;
      line.textContent = `${fact.label} ${value}${fact.outcome === 'ignored' ? ' (not active)' : ''}`;
      details.appendChild(line);
    }
    const detailsButton = createGameButton('Show calculation', 'secondary');
    detailsButton.dataset.combatDetailsToggle = entry.id;
    detailsButton.style.marginTop = '6px';
    detailsButton.addEventListener('click', event => {
      event.stopPropagation();
      details.hidden = !details.hidden;
      detailsButton.textContent = details.hidden ? 'Show calculation' : 'Hide calculation';
    });
    row.appendChild(detailsButton);
    row.appendChild(details);
  }
  return row;
}
