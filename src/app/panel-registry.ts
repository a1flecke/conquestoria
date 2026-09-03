/**
 * Panel routing types shared by `panel-router.ts` and the real registry
 * `main.ts` builds from them (#787 phase 5).
 *
 * See docs/superpowers/plans/2026-08-04-composition-root-decomposition.md,
 * "Phase 5 — PanelHost, PanelRouter, registry, and global shortcuts".
 */
import type { GameSession, Notifier, SelectionStore } from '@/app/ports';
import type { PanelHost } from '@/app/panel-host';
import type { PanelRouter } from '@/app/panel-router';

export type PanelId =
  | 'council' | 'tech' | 'city' | 'espionage' | 'diplomacy' | 'marketplace'
  | 'network' | 'wonder' | 'wonder-atlas' | 'bestiary' | 'pirate-waters'
  | 'notification-log' | 'city-overview' | 'territory-inspection' | 'pacing-debug'
  | 'strategic-arsenal' | 'hall-of-fame';

/**
 * Panels in the same group close each other. 'main' is the mutually-exclusive
 * set that `togglePanel` cleared before this phase; 'transient' panels close
 * on their own and do not force-close a 'main' panel or each other.
 */
export type PanelGroup = 'main' | 'transient';

/** Everything a panel factory needs. Panels never reach for `document` directly. */
export interface PanelContext {
  readonly session: GameSession;
  readonly notifier: Notifier;
  readonly host: PanelHost;
  readonly selection: SelectionStore;
  readonly router: PanelRouter;
}

export interface PanelDescriptor {
  /** The DOM id the panel factory assigns to its root element. */
  readonly domId: string;
  readonly group: PanelGroup;
  readonly open: (ctx: PanelContext) => void;
}

export type PanelRegistry = Readonly<Record<PanelId, PanelDescriptor>>;
