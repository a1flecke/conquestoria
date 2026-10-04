export interface PrimaryActionBarCallbacks {
  onOpenCouncil: () => void;
  onOpenTech: () => void;
  onOpenCity: () => void;
  onOpenEspionage: () => void;
  onOpenDiplomacy: () => void;
  onOpenMarketplace: () => void;
  onEndTurn: () => void | Promise<void>;
}

interface ActionButtonDefinition {
  label: string;
  icon: string;
  accent?: string;
  busyLabel?: string;
  onClick: () => void | Promise<void>;
}

function createActionButton(definition: ActionButtonDefinition): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;min-height:44px;padding:0;background:none;border:0;color:white;font-size:10px;cursor:pointer;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
  button.setAttribute('aria-label', definition.label);

  const icon = document.createElement('span');
  icon.textContent = definition.icon;
  icon.style.cssText = `width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;color:${definition.accent ?? 'white'};`;
  button.appendChild(icon);

  const label = document.createElement('span');
  label.textContent = definition.label;
  button.appendChild(label);

  const trigger = async (event: Event): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    const result = definition.onClick();
    if (!definition.busyLabel || !result) return;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.style.opacity = '0.65';
    label.textContent = definition.busyLabel;
    try {
      await result;
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.style.opacity = '';
      label.textContent = definition.label;
    }
  };

  button.addEventListener('click', event => {
    void trigger(event);
  });

  return button;
}

export function createPrimaryActionBar(callbacks: PrimaryActionBarCallbacks): HTMLDivElement {
  const bar = document.createElement('div');
  bar.id = 'bottom-bar';
  bar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:8px 12px 24px;background:rgba(0,0,0,0.8);display:flex;justify-content:space-around;z-index:10;';

  const buttons: ActionButtonDefinition[] = [
    { label: 'Council', icon: '🪑', onClick: callbacks.onOpenCouncil },
    { label: 'Tech', icon: '🔬', onClick: callbacks.onOpenTech },
    { label: 'City', icon: '🏛️', onClick: callbacks.onOpenCity },
    { label: 'Intel', icon: '🕵️', onClick: callbacks.onOpenEspionage },
    { label: 'Diplo', icon: '🤝', onClick: callbacks.onOpenDiplomacy },
    { label: 'Trade', icon: '💰', onClick: callbacks.onOpenMarketplace },
    {
      label: 'End Turn',
      busyLabel: 'Ending…',
      icon: '⏭️',
      accent: '#e8c170',
      onClick: callbacks.onEndTurn,
    },
  ];

  for (const definition of buttons) {
    bar.appendChild(createActionButton(definition));
  }

  return bar;
}
