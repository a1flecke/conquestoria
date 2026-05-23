import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { TERRITORY_PRESSURE_BALANCE } from '@/systems/city-territory-system';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { renderTerritoryFrontierInfo } from '@/ui/territory-frontier-info';
import { createGameButton } from '@/ui/ui-kit';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function addLine(parent: HTMLElement, label: string, value: string): void {
  const line = document.createElement('div');
  line.dataset.territoryInspectionLine = label.toLowerCase().replace(/\s+/g, '-');
  line.style.cssText = 'display:flex;justify-content:space-between;gap:16px;padding:4px 0;font-size:13px;';

  const labelNode = document.createElement('span');
  labelNode.style.cssText = 'color:rgba(244,241,232,0.65);';
  labelNode.textContent = `${label}: `;

  const valueNode = document.createElement('span');
  valueNode.style.cssText = 'color:#f4f1e8;text-align:right;';
  valueNode.textContent = value;

  line.appendChild(labelNode);
  line.appendChild(valueNode);
  parent.appendChild(line);
}

export function createTerritoryInspectionPanel(
  state: GameState,
  coord: HexCoord,
  viewerId: string,
  onClose?: () => void,
): HTMLElement {
  const key = hexKey(coord);
  const tile = state.map.tiles[key];
  const viewer = state.civilizations[viewerId];
  const viewerTechs = new Set(viewer?.techState?.completed ?? []);
  const visibility = viewer?.visibility
    ? getVisibility(viewer.visibility, coord)
    : 'unexplored';

  const panel = document.createElement('section');
  panel.id = 'territory-inspection-panel';
  panel.dataset.territoryInspection = visibility;
  panel.style.cssText = [
    'position:absolute',
    'left:16px',
    'bottom:16px',
    'z-index:45',
    'width:min(360px,calc(100vw - 32px))',
    'max-height:calc(100vh - 32px)',
    'overflow:auto',
    'background:rgba(23,27,33,0.96)',
    'border:1px solid rgba(232,193,112,0.35)',
    'border-radius:8px',
    'box-shadow:0 18px 46px rgba(0,0,0,0.38)',
    'color:#f4f1e8',
    'padding:14px',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0;font-size:16px;line-height:1.2;color:#e8c170;';
  title.textContent = visibility === 'fog' ? 'Last seen territory' : 'Territory';
  header.appendChild(title);

  if (onClose) {
    const close = createGameButton('Close', 'ghost');
    close.dataset.action = 'close-territory-inspection';
    close.style.minHeight = '32px';
    close.style.padding = '6px 10px';
    close.addEventListener('click', onClose);
    header.appendChild(close);
  }

  panel.appendChild(header);

  if (!tile || visibility === 'unexplored') {
    const hidden = document.createElement('p');
    hidden.style.cssText = 'margin:0;color:rgba(244,241,232,0.75);font-size:13px;';
    hidden.textContent = 'Unexplored territory';
    panel.appendChild(hidden);
    return panel;
  }

  addLine(panel, 'Terrain', titleCase(tile.terrain));
  addLine(panel, 'Elevation', titleCase(tile.elevation));
  const resDef = tile.resource
    ? RESOURCE_DEFINITIONS.find(r => r.id === tile.resource)
    : null;
  if (resDef && viewerTechs.has(resDef.tech)) {
    addLine(panel, 'Resource', `${resDef.name} (${resDef.type})`);
  }
  if (tile.improvement !== 'none') addLine(panel, 'Improvement', getImprovementDisplayName(tile.improvement));
  if (tile.wonder) addLine(panel, 'Wonder', getWonderDefinition(tile.wonder)?.name ?? tile.wonder);

  if (visibility === 'fog') {
    const fogNotice = document.createElement('p');
    fogNotice.style.cssText = 'margin:12px 0 0;color:rgba(244,241,232,0.7);font-size:13px;line-height:1.35;';
    fogNotice.textContent = 'Last seen information only. Current border pressure is unknown.';
    panel.appendChild(fogNotice);
    return panel;
  }

  const owner = tile.owner ? state.civilizations[tile.owner] : undefined;
  addLine(panel, 'Owner', owner?.name ?? tile.owner ?? 'Unclaimed');

  const cityAtCoord = Object.values(state.cities).find(candidate => hexKey(candidate.position) === key);
  const completedInCity = Object.entries(state.completedLegendaryWonders ?? {})
    .filter(([, completion]) => completion.ownerId === viewerId && completion.cityId === cityAtCoord?.id)
    .map(([wonderId]) => getLegendaryWonderDefinition(wonderId)?.name ?? 'Legendary wonder');
  if (completedInCity.length > 0) {
    addLine(panel, 'Completed legendary wonders', completedInCity.join(', '));
  }

  const frontier = state.territoryFrontiers?.[key];
  if (frontier) {
    const holderCity = state.cities[frontier.holderCityId];
    const challengerCity = state.cities[frontier.challengerCityId];
    addLine(panel, 'Held by', holderCity?.name ?? state.civilizations[frontier.holderCivId]?.name ?? frontier.holderCivId);
    addLine(panel, 'Challenger', challengerCity?.name ?? state.civilizations[frontier.challengerCivId]?.name ?? frontier.challengerCivId);
    addLine(panel, 'Progress', `${frontier.progress}/${TERRITORY_PRESSURE_BALANCE.frontierFlipProgress}`);
    panel.appendChild(renderTerritoryFrontierInfo(frontier));
  }

  return panel;
}
