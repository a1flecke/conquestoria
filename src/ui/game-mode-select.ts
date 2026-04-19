import { createSetupSection, createSetupShell } from '@/ui/setup-shell';

export interface GameModeSelectCallbacks {
  initialTitle?: string;
  onChooseSolo: (title: string) => void;
  onChooseHotSeat: (title: string) => void;
  onTitleRequired?: () => void;
}

function createModeButton(label: string, description: string, action: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  Object.assign(button.style, {
    minHeight: '96px',
    borderRadius: '16px',
    border: '1px solid rgba(232,193,112,0.24)',
    background: 'rgba(255,255,255,0.04)',
    color: '#f4f1e8',
    cursor: 'pointer',
    padding: '18px',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  });

  const title = document.createElement('span');
  title.textContent = label;
  Object.assign(title.style, {
    fontSize: '18px',
    fontWeight: '700',
    color: '#f7f1d7',
  });
  button.appendChild(title);

  const subtitle = document.createElement('span');
  subtitle.textContent = description;
  Object.assign(subtitle.style, {
    fontSize: '13px',
    lineHeight: '1.45',
    color: 'rgba(244,241,232,0.7)',
  });
  button.appendChild(subtitle);

  return button;
}

export function showGameModeSelect(container: HTMLElement, callbacks: GameModeSelectCallbacks): HTMLElement {
  container.querySelector('#mode-select')?.remove();

  const shell = createSetupShell({
    panelId: 'mode-select',
    eyebrow: 'Campaign Setup',
    title: 'New Game',
    subtitle: 'Choose how this campaign begins, then continue into the matching setup flow.',
  });

  const titleSection = createSetupSection({
    title: 'Campaign Title',
    description: 'Name this run before choosing solo or hot seat.',
    role: 'mode-select-title-section',
  });

  const titleInput = document.createElement('input');
  titleInput.id = 'new-game-title';
  titleInput.type = 'text';
  titleInput.value = callbacks.initialTitle ?? 'New Campaign';
  Object.assign(titleInput.style, {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.08)',
    color: '#f4f1e8',
    fontSize: '14px',
  });
  titleSection.content.appendChild(titleInput);
  shell.body.appendChild(titleSection.section);

  const modeSection = createSetupSection({
    title: 'Choose A Mode',
    description: 'Solo pits you against AI rivals. Hot seat keeps multiple human players on one device.',
    role: 'mode-select-modes',
  });

  const modeGrid = document.createElement('div');
  modeGrid.dataset.role = 'mode-select-grid';
  Object.assign(modeGrid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
  });
  modeSection.content.appendChild(modeGrid);

  const getSoloTitle = (): string => titleInput.value.trim() || 'New Campaign';
  const getHotSeatTitle = (): string | null => {
    const title = titleInput.value.trim();
    if (!title) {
      callbacks.onTitleRequired?.();
      return null;
    }
    return title;
  };

  const soloButton = createModeButton('Solo', 'Lead one civilization against AI rivals.', 'choose-solo-mode');
  soloButton.addEventListener('click', () => callbacks.onChooseSolo(getSoloTitle()));
  modeGrid.appendChild(soloButton);

  const hotSeatButton = createModeButton('Hot Seat', 'Pass the device between human players sharing one world.', 'choose-hotseat-mode');
  hotSeatButton.addEventListener('click', () => {
    const title = getHotSeatTitle();
    if (!title) {
      return;
    }
    callbacks.onChooseHotSeat(title);
  });
  modeGrid.appendChild(hotSeatButton);

  shell.body.appendChild(modeSection.section);

  container.appendChild(shell.surface);
  return shell.surface;
}
