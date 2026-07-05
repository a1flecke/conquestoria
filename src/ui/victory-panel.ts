import type { GameOverReason } from '@/core/types';
import { createGameButton } from '@/ui/ui-kit';

export interface VictoryPanelOptions {
  winnerName: string;
  victoryType: string;
  outcome?: 'victory' | 'defeat';
  reason?: GameOverReason;
  turn: number;
  onNewGame: () => void;
}

export function showVictoryPanel(container: HTMLElement, options: VictoryPanelOptions): void {
  container.querySelector('#victory-panel')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'victory-panel';
  overlay.style.cssText = [
    'position:absolute;top:0;left:0;right:0;bottom:0;',
    'background:rgba(10,10,30,0.97);z-index:100;',
    'display:flex;flex-direction:column;align-items:center;',
    'justify-content:center;padding:32px;text-align:center;',
  ].join('');

  const trophy = document.createElement('div');
  const isDefeat = options.outcome === 'defeat';
  trophy.textContent = isDefeat ? '⚔️' : '🏆';
  trophy.style.cssText = 'font-size:64px;margin-bottom:16px;';

  const title = document.createElement('h1');
  title.textContent = isDefeat ? 'Defeat' : 'Victory!';
  title.style.cssText = 'font-size:32px;color:#e8c170;margin:0 0 8px;';

  const type = document.createElement('h2');
  type.style.cssText = 'font-size:18px;color:#aaa;margin:0 0 24px;';
  type.textContent = options.victoryType;

  const winner = document.createElement('p');
  winner.style.cssText = 'font-size:22px;color:white;margin:0 0 8px;';
  winner.textContent = options.reason === 'all-humans-eliminated'
    ? 'No human civilizations remain.'
    : options.winnerName;

  const turnLine = document.createElement('p');
  turnLine.style.cssText = 'font-size:14px;color:#aaa;margin:0 0 32px;';
  turnLine.textContent = `Turn ${options.turn}`;

  const btn = createGameButton('New Game', 'primary');
  btn.id = 'victory-new-game-btn';
  btn.type = 'button';
  btn.style.padding = '14px 40px';
  btn.addEventListener('click', options.onNewGame);

  overlay.appendChild(trophy);
  overlay.appendChild(title);
  overlay.appendChild(type);
  overlay.appendChild(winner);
  overlay.appendChild(turnLine);
  overlay.appendChild(btn);

  container.appendChild(overlay);
}
