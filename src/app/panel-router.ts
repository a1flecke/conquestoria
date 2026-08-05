/**
 * Dispatches panel opens/closes through a `PanelRegistry` instead of the
 * 288-line `else if` chain `togglePanel` used to be in `main.ts` (#787 phase 5).
 *
 * `isOpen`/`close`/`closeGroup` are DOM-derived (querying `host.layer` by
 * each descriptor's `domId`), not internally tracked booleans -- that keeps
 * them correct regardless of whether a panel's DOM was created through
 * `open()` or through one of the parameterized helpers (`openWonderPanelForCityId`,
 * `openCityPanelForCity`, `openTerritoryInspectionPanel`) that still create
 * their panel directly, since `PanelDescriptor.open(ctx)` takes no per-call
 * arguments and those three genuinely need one (a city id or a hex coord).
 * Their registry entries exist so `closeGroup`/`isOpen`/`close` behave
 * correctly against them; their `open` is never invoked by any real call site
 * and throws if it ever is.
 */
import type { PanelHost } from '@/app/panel-host';
import type { PanelContext, PanelGroup, PanelId, PanelRegistry } from '@/app/panel-registry';

export interface PanelRouter {
  toggle(panel: PanelId): void;
  open(panel: PanelId): void;
  close(panel: PanelId): void;
  closeGroup(group: PanelGroup): void;
  isOpen(panel: PanelId): boolean;
}

export interface PanelRouterDeps {
  readonly host: PanelHost;
  /**
   * Partial so isolated unit tests can exercise the router against a
   * two-or-three-entry fixture registry instead of the full 15-panel one
   * `main.ts` builds. `open`/`close`/`isOpen`/`closeGroup` all assume the
   * caller only ever passes a `PanelId` present in `registry` -- true for
   * every real call site, since `main.ts`'s registry `satisfies PanelRegistry`
   * (all keys present).
   */
  readonly registry: Partial<PanelRegistry>;
  readonly context: PanelContext;
  /**
   * Fires before every `open()`. Wired in Phase 10 to `drawer.close()` --
   * `togglePanel` called `drawer?.close()` as its first line today. Phase 5
   * leaves the existing scattered `drawer?.close()` calls inside the
   * migrated panel-open functions in place rather than wiring this, so this
   * stays optional and unused until the composition root passes it.
   */
  readonly onBeforeOpen?: () => void;
}

export function createPanelRouter(deps: PanelRouterDeps): PanelRouter {
  const { host, registry, context, onBeforeOpen } = deps;

  const descriptorFor = (panel: PanelId) => {
    const descriptor = registry[panel];
    if (!descriptor) throw new Error(`No panel registered for '${panel}'.`);
    return descriptor;
  };

  const isOpen = (panel: PanelId): boolean =>
    host.layer.querySelector(`#${descriptorFor(panel).domId}`) !== null;

  const close = (panel: PanelId): void => {
    host.layer.querySelector(`#${descriptorFor(panel).domId}`)?.remove();
  };

  const closeGroup = (group: PanelGroup): void => {
    for (const panel of Object.keys(registry) as PanelId[]) {
      if (registry[panel]?.group === group) close(panel);
    }
  };

  const open = (panel: PanelId): void => {
    onBeforeOpen?.();
    // Only 'main' panels mutually exclude on open -- 'transient' panels
    // (network, wonder-atlas, bestiary, pirate-waters, notification-log,
    // pacing-debug, ...) coexist freely, matching current behavior where
    // opening the Wonder Atlas does not silently close the notification log.
    if (descriptorFor(panel).group === 'main') closeGroup('main');
    descriptorFor(panel).open(context);
  };

  const toggle = (panel: PanelId): void => {
    if (isOpen(panel)) close(panel);
    else open(panel);
  };

  return { toggle, open, close, closeGroup, isOpen };
}
