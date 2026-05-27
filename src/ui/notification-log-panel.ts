import type { NotificationEntry, NotificationMapTarget } from '@/ui/notification-log';

interface NotificationLogPanelOptions {
  onClose: () => void;
  onFocusTarget: (target: NotificationMapTarget) => void;
  onOpenCity?: (cityId: string) => void;
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
  panel.style.cssText = 'position:absolute;top:70px;right:12px;width:280px;max-height:300px;overflow-y:auto;background:rgba(10,10,30,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:10px;z-index:25;padding:12px;';

  const header = document.createElement('div');
  header.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:8px;display:flex;justify-content:space-between;';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = 'Message Log';
  const closeBtn = document.createElement('span');
  closeBtn.id = 'close-log';
  closeBtn.style.cssText = 'cursor:pointer;opacity:0.6;';
  closeBtn.textContent = 'X';
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
  row.appendChild(turnSpan);
  row.appendChild(document.createTextNode(entry.message));
  return row;
}
