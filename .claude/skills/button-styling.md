---
name: button-styling
description: Use when creating or editing any button in src/ui/. Enforces the createGameButton design system so all buttons have consistent visual styling and 44px touch targets.
paths:
  - "src/ui/**"
---

# Button Styling — Conquestoria Design System

Every button in `src/ui/` must use `createGameButton()` from `src/ui/ui-kit.ts`. Do not call `document.createElement('button')` directly in UI files except inside `ui-kit.ts` itself or `primary-action-bar.ts` (which has a custom icon+label design).

## Import

```ts
import { createGameButton } from '@/ui/ui-kit';
```

## API

```ts
createGameButton(
  label: string,
  variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'close',
  options?: { disabled?: boolean; type?: 'button' | 'submit' }
): HTMLButtonElement
```

After calling `createGameButton`, you can set `dataset.*`, `id`, and event listeners normally. Do not override `style` properties — they are set by the factory.

## Variants

### `'primary'` — Main CTA
Gold background, dark bold text. For the most important action on the screen.

Use for: Start Campaign, Confirm, Save, Research (tech panel), Occupy city.

```ts
const btn = createGameButton('Start Campaign', 'primary');
btn.dataset.action = 'start-campaign';
btn.addEventListener('click', () => callbacks.onStart());
```

### `'secondary'` — Secondary action
Dark semi-transparent background, gold border, light text. For important but non-destructive actions that aren't the primary CTA.

Use for: Choose Civilization, Open Tech Panel, Open City, Start Build, Return to Game.

```ts
const btn = createGameButton('Choose Civilization', 'secondary');
btn.dataset.action = 'choose-civ';
```

### `'ghost'` — Cancel / Back
Transparent background, muted border, lower-opacity text. Never the first button the player's eye lands on.

Use for: Cancel, Back, any dismiss-without-committing action.

```ts
const btn = createGameButton('Cancel', 'ghost');
```

### `'danger'` — Destructive action
Red background, white bold text. Reserve for actions that cannot be undone.

Use for: Raze city, Delete unit, Discard & Start New Game, Move Anyway.

```ts
const btn = createGameButton('Raze City', 'danger');
```

### `'close'` — Panel ✕ button
Transparent, no border, muted white. Small. For the top-right close button on panels.

Use for: Panel close (✕) buttons anywhere in the game.

```ts
const close = createGameButton('✕', 'close');
close.setAttribute('aria-label', 'Close panel');
close.style.fontSize = '20px'; // font size override is OK for close buttons
```

## Disabled state

Pass `{ disabled: true }` to get the greyed-out / non-interactive style:

```ts
const startBtn = createGameButton('Start Campaign', 'primary', { disabled: true });
// Later, when ready:
startBtn.disabled = false;
startBtn.style.opacity = '1';
startBtn.style.cursor = 'pointer';
startBtn.style.pointerEvents = '';
```

Or create enabled and call `syncButtonDisabledState(btn, isDisabled)` if you need to toggle it.

## Touch target contract

All variants enforce `min-height: 44px; min-width: 44px`. Do not override these — they exist for mobile touch accuracy.

## Common mistakes to avoid

| Mistake | Fix |
|---------|-----|
| `document.createElement('button')` in a UI file | Use `createGameButton` |
| Setting `button.style.cssText` after `createGameButton` | Append individual properties instead |
| No `background` or `color` set | createGameButton handles this — don't skip it |
| Using `'secondary'` for a destructive action | Use `'danger'` |
| Using `'primary'` for cancel | Use `'ghost'` |

## Hook enforcement

The `check-src-edit` PostToolUse hook will flag any `createElement('button')` in `src/ui/` that lacks an adjacent style assignment. Fix the violation before continuing.
