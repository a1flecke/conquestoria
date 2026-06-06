import type { WonderCodexVideoSource, WonderCodexVideoSurface } from '@/systems/wonder-codex/types';

export const HARD_VIDEO_ASSET_REVIEW_BYTES = 5 * 1024 * 1024;
export const TARGET_VIDEO_ASSET_BYTES = 2 * 1024 * 1024;

export const WONDER_CODEX_VIDEO_SOURCES = [
  {
    id: 'video-great-volcano-tonga-eruption',
    wonderId: 'great_volcano',
    title: 'Tonga volcano eruption satellite sequence',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tonga_Volcano_Eruption_2022-01-15_0320Z_to_0610Z_Himawari-8_visible.webm',
    creator: 'Japan Meteorological Agency / Digital Typhoon',
    license: 'CC BY 4.0 compatible public data terms',
    attribution: 'Japan Meteorological Agency / Digital Typhoon - CC BY 4.0 compatible public data terms',
    localPath: '/videos/wonders/great-volcano-tonga-eruption.mp4',
    fallbackImageSourceId: 'image-volcano',
    durationSeconds: 4,
    sizeBytes: 837274,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Satellite eruption sequence trimmed to a short loop for spike evaluation.',
    audio: 'silent',
  },
  {
    id: 'video-starvault-paranal-observatory',
    wonderId: 'starvault-observatory',
    title: 'Morning observations time-lapse at Paranal',
    surfaces: ['codex', 'legendary-completion'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Morning_observations_time-lapse_at_Paranal.webm',
    creator: 'ESO/J. Colosimo',
    license: 'CC BY 4.0',
    attribution: 'ESO/J. Colosimo - CC BY 4.0',
    localPath: '/videos/wonders/starvault-paranal-observatory.mp4',
    fallbackImageSourceId: 'image-observatory',
    durationSeconds: 4,
    sizeBytes: 929955,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Observatory time-lapse trimmed to a short loop for spike evaluation.',
    audio: 'silent',
  },
] satisfies WonderCodexVideoSource[];

export function getWonderCodexVideoSources(): WonderCodexVideoSource[] {
  return WONDER_CODEX_VIDEO_SOURCES.map(source => ({
    ...source,
    surfaces: [...source.surfaces],
  }));
}

export function getWonderCodexVideoSource(id: string): WonderCodexVideoSource | undefined {
  return WONDER_CODEX_VIDEO_SOURCES.find(source => source.id === id);
}

export function getWonderCodexVideoSourceForWonder(
  wonderId: string,
  surface: WonderCodexVideoSurface,
): WonderCodexVideoSource | undefined {
  return WONDER_CODEX_VIDEO_SOURCES.find(source =>
    source.wonderId === wonderId && (source.surfaces as readonly WonderCodexVideoSurface[]).includes(surface),
  );
}
