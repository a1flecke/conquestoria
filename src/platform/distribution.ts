export type Distribution = 'web' | 'tauri';

type DistributionEnv = Partial<Record<'VITE_CONQUESTORIA_DISTRIBUTION' | 'TAURI_ENV_PLATFORM', string>>;
type NavigatorLike = Pick<Navigator, 'serviceWorker'> | Record<string, unknown>;

export function resolveDistribution(env: DistributionEnv = import.meta.env): Distribution {
  if (env.VITE_CONQUESTORIA_DISTRIBUTION === 'tauri') {
    return 'tauri';
  }

  if (env.TAURI_ENV_PLATFORM) {
    return 'tauri';
  }

  return 'web';
}

export function getDistribution(): Distribution {
  return resolveDistribution(import.meta.env);
}

export function isTauriDistribution(): boolean {
  return getDistribution() === 'tauri';
}

export function shouldRegisterServiceWorker(
  distribution: Distribution = getDistribution(),
  navigatorLike: NavigatorLike = navigator,
): boolean {
  return distribution === 'web' && 'serviceWorker' in navigatorLike;
}
