/**
 * The factory that used to live here (`createUiInteractionState`) was
 * retired in #787 phase 11: `PanelHost` (`src/app/panel-host.ts`) was its
 * only remaining production constructor, and now inlines the same
 * `blockingOverlayId: string | null` closure directly instead of composing
 * it. Only this interface survives, for `context-menu.ts`'s type-only
 * consumption and the two UI test suites that build a plain object literal
 * shaped like it instead of calling a shared factory.
 */
export interface UiInteractionState {
  setBlockingOverlay(id: string | null): void;
  isInteractionBlocked(): boolean;
}
