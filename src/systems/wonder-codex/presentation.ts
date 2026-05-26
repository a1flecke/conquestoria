import type { GameState, HexCoord, LegendaryWonderProject } from '@/core/types';
import { getLegendaryWonderDefinition, getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderPresentationForCity } from '@/systems/legendary-wonder-presentation';
import { formatNaturalWonderEffectSummary } from '@/systems/wonder-presentation-formatting';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { getAllWonderCodexContent, getWonderCodexContent } from '@/systems/wonder-codex/content';
import { getRelatedWonderCodexEntries, type RelatedWonderCodexEntry } from '@/systems/wonder-codex/related';
import { getImageSource } from '@/systems/wonder-codex/sources';
import type { WonderCodexContent, WonderCodexSection } from '@/systems/wonder-codex/types';

export type WonderCodexResponsiveMode = 'desktop' | 'mobile';

export interface WonderCodexAction {
  type: 'view-map' | 'open-city';
  label: string;
  wonderId: string;
  coord?: HexCoord;
  cityId?: string;
}

export interface WonderCodexCatalogEntry {
  id: string;
  kind: WonderCodexContent['kind'];
  title: string;
  subtitle: string;
  stateLabel: string;
  visual: WonderVisualDefinition;
}

export interface WonderCodexPageViewModel extends WonderCodexCatalogEntry {
  authoredLead: string;
  learningText: string;
  image: {
    src: string;
    alt: string;
    attribution: string;
    sourceUrl: string;
    license: string;
  };
  statusLines: string[];
  sections: WonderCodexSection[];
  relatedEntries: RelatedWonderCodexEntry[];
  actions: WonderCodexAction[];
}

export interface WonderCodexViewModel {
  mode: WonderCodexResponsiveMode;
  catalogEntries: WonderCodexCatalogEntry[];
  selectedPage: WonderCodexPageViewModel | null;
}

export interface WonderCodexViewOptions {
  mode?: WonderCodexResponsiveMode;
  initialWonderId?: string;
}

function findWonderCoord(state: GameState, wonderId: string): HexCoord | null {
  const tile = Object.values(state.map.tiles).find(candidate => candidate.wonder === wonderId);
  return tile ? { ...tile.coord } : null;
}

function formatLocation(coord: HexCoord | null): string {
  return coord ? `Q${coord.q}, R${coord.r}` : 'Location unknown';
}

function isNaturalVisible(state: GameState, viewerId: string, wonderId: string): boolean {
  return (state.wonderDiscoverers?.[wonderId] ?? []).includes(viewerId);
}

function ownedProject(state: GameState, viewerId: string, wonderId: string): LegendaryWonderProject | undefined {
  return Object.values(state.legendaryWonderProjects ?? {})
    .find(project => project.ownerId === viewerId && project.wonderId === wonderId);
}

function safeOwnedHostCityId(state: GameState, viewerId: string, cityId: string | undefined): string | undefined {
  if (!cityId) return undefined;
  const city = state.cities[cityId];
  return city?.owner === viewerId ? cityId : undefined;
}

function legendaryStateLabel(state: GameState, viewerId: string, wonderId: string): string {
  const completion = state.completedLegendaryWonders?.[wonderId];
  if (completion?.ownerId === viewerId) return 'Completed';

  const project = ownedProject(state, viewerId, wonderId);
  if (!project) return 'Legendary wonder';
  if (project.phase === 'ready_to_build') {
    const cityEntry = getLegendaryWonderPresentationForCity(state, viewerId, project.cityId)
      .find(entry => entry.wonderId === wonderId);
    return cityEntry?.canStartBuild ? 'Available' : 'Legendary wonder';
  }
  if (project.phase === 'building') return 'Under construction';
  if (project.phase === 'completed') return 'Completed';
  if (project.phase === 'lost_race') return 'Recovered';
  if (project.phase === 'questing') return 'Quest in progress';
  return 'Legendary wonder';
}

function visibleCatalogEntries(state: GameState, viewerId: string): WonderCodexCatalogEntry[] {
  const naturalEntries = getAllWonderCodexContent()
    .filter(entry => entry.kind === 'natural' && isNaturalVisible(state, viewerId, entry.id))
    .map(entry => {
      const definition = getWonderDefinition(entry.id);
      return {
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        subtitle: definition?.description ?? entry.subtitle,
        stateLabel: 'Discovered',
        visual: getWonderVisualDefinition(entry.id),
      };
    });

  const legendaryEntries = getLegendaryWonderDefinitions().map(definition => {
    const content = getWonderCodexContent(definition.id);
    return {
      id: definition.id,
      kind: 'legendary' as const,
      title: content?.title ?? definition.name,
      subtitle: content?.subtitle ?? 'Legendary wonder',
      stateLabel: legendaryStateLabel(state, viewerId, definition.id),
      visual: getWonderVisualDefinition(definition.id),
    };
  });

  return [...naturalEntries, ...legendaryEntries];
}

function buildNaturalStatus(state: GameState, wonderId: string): { statusLines: string[]; actions: WonderCodexAction[] } {
  const coord = findWonderCoord(state, wonderId);
  const statusLines = [
    formatNaturalWonderEffectSummary(wonderId),
    `Known location: ${formatLocation(coord)}`,
  ];
  const actions: WonderCodexAction[] = coord
    ? [{ type: 'view-map', label: 'View on Map', wonderId, coord }]
    : [];
  return { statusLines, actions };
}

function publicAssetUrl(localPath: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${localPath.replace(/^\/+/, '')}`;
}

function buildLegendaryStatus(
  state: GameState,
  viewerId: string,
  wonderId: string,
): { statusLines: string[]; actions: WonderCodexAction[] } {
  const definition = getLegendaryWonderDefinition(wonderId);
  const label = legendaryStateLabel(state, viewerId, wonderId);
  const statusLines = [`Status: ${label}`];
  if (definition && label !== 'Legendary wonder') statusLines.push(`Reward: ${definition.reward.summary}`);

  const project = ownedProject(state, viewerId, wonderId);
  if (project?.phase === 'building') {
    statusLines.push(`Progress recorded in your city: ${project.investedProduction} production invested.`);
  }

  const completion = state.completedLegendaryWonders?.[wonderId];
  const cityId = safeOwnedHostCityId(state, viewerId, completion?.cityId ?? project?.cityId);
  const actions: WonderCodexAction[] = cityId
    ? [{ type: 'open-city', label: 'Open City', wonderId, cityId }]
    : [];
  return { statusLines, actions };
}

function buildPage(
  state: GameState,
  viewerId: string,
  entry: WonderCodexCatalogEntry,
  visibleWonderIds: Set<string>,
): WonderCodexPageViewModel | null {
  const content = getWonderCodexContent(entry.id);
  if (!content) return null;
  const imageSource = getImageSource(content.imageSourceId);
  if (!imageSource) return null;
  const status = content.kind === 'natural'
    ? buildNaturalStatus(state, entry.id)
    : buildLegendaryStatus(state, viewerId, entry.id);

  return {
    ...entry,
    authoredLead: content.authoredLead,
    learningText: content.learningText,
    image: {
      src: publicAssetUrl(imageSource.localPath),
      alt: `${entry.title} source image`,
      attribution: imageSource.attribution,
      sourceUrl: imageSource.sourceUrl,
      license: imageSource.license,
    },
    statusLines: status.statusLines,
    sections: content.sections.map(section => ({ ...section })),
    relatedEntries: getRelatedWonderCodexEntries(entry.id, visibleWonderIds),
    actions: status.actions,
  };
}

export function getWonderCodexViewModel(
  state: GameState,
  viewerId: string,
  options: WonderCodexViewOptions = {},
): WonderCodexViewModel {
  const catalogEntries = visibleCatalogEntries(state, viewerId);
  const visibleWonderIds = new Set(catalogEntries.map(entry => entry.id));
  const selectedEntry = catalogEntries.find(entry => entry.id === options.initialWonderId)
    ?? catalogEntries[0]
    ?? null;

  return {
    mode: options.mode ?? 'desktop',
    catalogEntries,
    selectedPage: selectedEntry ? buildPage(state, viewerId, selectedEntry, visibleWonderIds) : null,
  };
}
