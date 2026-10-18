import { resolveAppAssetUrl } from '@/renderer/asset-url';
import { getBuildingArtPath } from './building-art-catalog';

// An SVG loaded as an <img> cannot fetch the PNG it references, so the canvas bake embeds it as a data URI. The bytes are
// fetched once per building (shared by every civilization) and kept until the page closes (a few tens of KB each).
const dataUris = new Map<string, Promise<string>>();

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Building art could not be read'));
    reader.readAsDataURL(blob);
  });
}

/** Resolves to the art as a data URI; rejects (and forgets the failure, so a later request retries) when the file is missing. */
export function loadBuildingArtDataUri(buildingId: string): Promise<string> {
  const cached = dataUris.get(buildingId);
  if (cached) return cached;
  const path = getBuildingArtPath(buildingId);
  if (!path) return Promise.reject(new Error(`No art for building ${buildingId}`));
  const pending = fetch(resolveAppAssetUrl(path))
    .then(response => {
      if (!response.ok) throw new Error(`Building art failed to load: ${path}`);
      return response.blob();
    })
    .then(blobToDataUri);
  dataUris.set(buildingId, pending);
  pending.catch(() => { dataUris.delete(buildingId); });
  return pending;
}

export function resetBuildingArtForTests(): void {
  dataUris.clear();
}
