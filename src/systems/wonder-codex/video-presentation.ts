import { getImageSource } from '@/systems/wonder-codex/sources';
import { getWonderCodexVideoSourceForWonder } from '@/systems/wonder-codex/video-sources';
import type { WonderCodexVideoSurface } from '@/systems/wonder-codex/types';

export interface WonderVideoPreviewView {
  id: string;
  wonderId: string;
  surface: WonderCodexVideoSurface;
  src: string;
  mimeType: string;
  label: string;
  attribution: string;
  sourceUrl: string;
  license: string;
  audio: 'silent';
  fallbackImage: {
    src: string;
    alt: string;
    attribution: string;
    sourceUrl: string;
    license: string;
  };
}

function publicAssetUrl(localPath: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${localPath.replace(/^\/+/, '')}`;
}

export function getWonderVideoPreviewForSurface(
  wonderId: string,
  surface: WonderCodexVideoSurface,
  label: string,
): WonderVideoPreviewView | null {
  const source = getWonderCodexVideoSourceForWonder(wonderId, surface);
  if (!source) return null;

  const fallback = getImageSource(source.fallbackImageSourceId);
  if (!fallback) return null;

  return {
    id: source.id,
    wonderId: source.wonderId,
    surface,
    src: publicAssetUrl(source.localPath),
    mimeType: source.mimeType,
    label,
    attribution: source.attribution,
    sourceUrl: source.sourceUrl,
    license: source.license,
    audio: source.audio,
    fallbackImage: {
      src: publicAssetUrl(fallback.localPath),
      alt: `${label} source image`,
      attribution: fallback.attribution,
      sourceUrl: fallback.sourceUrl,
      license: fallback.license,
    },
  };
}
