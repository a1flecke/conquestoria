import { type Distribution, getDistribution, shouldRegisterServiceWorker } from './distribution';

export async function registerConquestoriaServiceWorker(
  distribution: Distribution = getDistribution(),
  navigatorLike: Navigator = navigator,
): Promise<void> {
  if (!shouldRegisterServiceWorker(distribution, navigatorLike)) {
    return;
  }

  try {
    await navigatorLike.serviceWorker.register('/conquestoria/sw.js');
  } catch {
    // Service worker registration is a web-only enhancement. The game still runs without it.
  }
}
