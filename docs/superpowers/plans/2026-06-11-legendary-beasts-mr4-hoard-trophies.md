# Legendary Beasts MR4 — Hoard Choices + Lair Trophies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor model:** Sonnet 4.5. Grounded in the codebase **after MR1–MR3 merged**.

**Goal:** Slaying a tier ≥ 2 beast now presents a choose-one hoard reward — **Gold Hoard** (instant gold), **Ancient Lore** (instant research progress), or **Beast Trophy** (claim the lair for permanent +gold/turn) — with AI auto-resolution and hot-seat-safe queueing. Tier 1 beasts keep MR1's automatic gold.

**Architecture:** `recordBeastSlain` stops auto-paying gold for tier ≥ 2 and instead queues a pending choice on `BeastsState`. Human players resolve it via a blocking panel (modeled on `src/ui/required-choice-panel.ts`); AI civs auto-resolve to Gold during turn processing. Trophy income is a per-turn civ yield applied where per-turn gold already accrues, and surfaced in the same per-turn rate the HUD shows (misleading-HUD rule).

**Tech Stack:** TypeScript, vitest, DOM/CSS panel via `createGameButton`.

**Dependencies:** MR1–MR3 merged. Branches from `main`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | `BeastHoardChoice`, `pendingHoardChoices` on `BeastsState`, `claimedBy` on `BeastLair`, `'beast:hoard-claimed'` event |
| `src/systems/beast-system.ts` | Modify | `recordBeastSlain` queues choices; `applyHoardChoice`; `getHoardChoicePreview`; `getClaimedTrophyGoldPerTurn` |
| `src/core/turn-manager.ts` | Modify | AI auto-resolve pending choices; trophy income accrual |
| `src/ui/beast-hoard-panel.ts` | Create | The choose-one panel |
| `src/main.ts` | Modify | Show panel for human slayer; resolve queue at turn start |
| `tests/systems/beast-system.test.ts` | Modify | Choice application + queue + income tests |
| `tests/ui/beast-hoard-panel.test.ts` | Create | Rendered-DOM replay tests |

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| My attack kills the basilisk (tier 2) | (combat resolves) | Hoard panel appears: three options with explicit numbers ("+160 gold", "+120 research", "Trophy: +3 gold/turn forever") |
| Hoard panel open | Tap "Ancient Lore" | Panel closes; notification "Ancient Lore claimed: +120 research"; research progress visibly advanced next time tech panel opens |
| Hoard panel open | Tap "Beast Trophy" | Panel closes; lair glyph becomes 🏆; HUD per-turn gold rate increases by the trophy amount immediately |
| AI slays a tier-2 beast | (their turn processes) | Everyone gets the "X slew the beast" notification; AI silently took Gold; no panel ever shows for AI |
| Hot-seat: I slew a beast, then the app reloaded mid-choice | My turn starts | The pending choice panel re-appears (queued in state, not in DOM) |

## Misleading-UI risks + queue checklist

- The three option labels MUST show the actual computed numbers for THIS beast at THIS era — never generic text. `getHoardChoicePreview` is the single source; the panel renders only what it returns.
- HUD per-turn gold must include trophy income the same turn it's claimed, or the HUD lies. Task 4 wires the same helper into both accrual and the displayed rate.
- Pending choices are a queue (`pendingHoardChoices` array): two slain beasts in one turn = two sequential panels. Replay test covers resolve→next-panel.
- The panel is blocking by design (matches `required-choice-panel` UX); it must never be dismissible without choosing — no close button — but it only ever appears for the slayer civ on their own turn.
- Repeat-click: buttons remove the panel synchronously on first click; a second click can't fire (replay test asserts single application).

---

### Task 1: Types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Extend the beast types**

```typescript
export type BeastHoardChoice = 'gold' | 'lore' | 'trophy';

export interface PendingHoardChoice {
  lairId: string;
  civId: string;       // the slayer; only this civ may resolve it
}
```

`BeastLair` gains:

```typescript
  claimedBy?: string;   // civ that took the Trophy option
```

`BeastsState` gains:

```typescript
  pendingHoardChoices?: PendingHoardChoice[];
```

`GameEvents` gains:

```typescript
  'beast:hoard-claimed': { lairId: string; beastId: BeastId; civId: string; choice: BeastHoardChoice };
```

- [ ] **Step 2: Build (expect green — all fields optional), commit**

```bash
git add src/core/types.ts
git commit -m "feat(beasts): hoard choice types"
```

---

### Task 2: System — queue, preview, apply (TDD)

**Files:**
- Modify: `src/systems/beast-system.ts`
- Test: `tests/systems/beast-system.test.ts`

- [ ] **Step 1: Write failing tests (append)**

```typescript
import { applyHoardChoice, getHoardChoicePreview, getClaimedTrophyGoldPerTurn } from '@/systems/beast-system';

describe('hoard choices', () => {
  function stateWithSlainBasilisk() {
    const state = createNewGame('rome', 'beast-test-seed', 'small', 'Hoard Test');
    state.era = 2;
    state.beasts = {
      mode: 'wild',
      lairs: {
        'lair-emerald_basilisk': makeLair({ id: 'lair-emerald_basilisk', beastId: 'emerald_basilisk', status: 'awake', unitIds: ['beast-1'] }),
      },
      sightingsByCiv: {},
    };
    const beast = makeUnit({ id: 'beast-1', type: 'beast_basilisk', owner: 'beasts' });
    const victor = makeUnit({ id: 'hero-1', owner: state.currentPlayer, position: { q: 11, r: 10 } });
    state.units[beast.id] = beast;
    state.units[victor.id] = victor;
    return { state, beast, victor };
  }

  it('tier >= 2 slay queues a pending choice and awards NO automatic gold', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const goldBefore = state.civilizations[victor.owner].gold;
    const { state: next, slain } = recordBeastSlain(state, beast, victor);
    expect(slain).toBeDefined();
    expect(slain!.goldAwarded).toBe(0);
    expect(next.civilizations[victor.owner].gold).toBe(goldBefore);
    expect(next.beasts!.pendingHoardChoices).toEqual([{ lairId: 'lair-emerald_basilisk', civId: victor.owner }]);
  });

  it('tier 1 slay still auto-pays gold and queues nothing', () => {
    const { state, victor } = stateWithSlainBasilisk();
    state.beasts!.lairs['lair-giant_boar'] = makeLair({ status: 'awake', unitIds: ['boar-1'] });
    const boar = makeUnit({ id: 'boar-1', type: 'beast_boar', owner: 'beasts' });
    state.units[boar.id] = boar;
    const { state: next, slain } = recordBeastSlain(state, boar, victor);
    expect(slain!.goldAwarded).toBeGreaterThan(0);
    expect(next.beasts!.pendingHoardChoices ?? []).toEqual([]);
  });

  it('preview exposes concrete numbers for all three options', () => {
    const { state } = stateWithSlainBasilisk();
    const preview = getHoardChoicePreview(state, 'lair-emerald_basilisk');
    expect(preview.gold).toBeGreaterThan(0);
    expect(preview.lore).toBeGreaterThan(0);
    expect(preview.trophyGoldPerTurn).toBeGreaterThan(0);
  });

  it('applyHoardChoice gold pays out and clears the pending entry', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const { state: slainState } = recordBeastSlain(state, beast, victor);
    const goldBefore = slainState.civilizations[victor.owner].gold;
    const next = applyHoardChoice(slainState, 'lair-emerald_basilisk', victor.owner, 'gold');
    const preview = getHoardChoicePreview(slainState, 'lair-emerald_basilisk');
    expect(next.civilizations[victor.owner].gold).toBe(goldBefore + preview.gold);
    expect(next.beasts!.pendingHoardChoices).toEqual([]);
    expect(next.beasts!.lairs['lair-emerald_basilisk'].status).toBe('slain');
  });

  it('applyHoardChoice trophy claims the lair and produces per-turn income', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const { state: slainState } = recordBeastSlain(state, beast, victor);
    const next = applyHoardChoice(slainState, 'lair-emerald_basilisk', victor.owner, 'trophy');
    expect(next.beasts!.lairs['lair-emerald_basilisk'].status).toBe('claimed');
    expect(next.beasts!.lairs['lair-emerald_basilisk'].claimedBy).toBe(victor.owner);
    expect(getClaimedTrophyGoldPerTurn(next, victor.owner)).toBeGreaterThan(0);
    expect(getClaimedTrophyGoldPerTurn(next, 'someone-else')).toBe(0);
  });

  it('applyHoardChoice refuses the wrong civ', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const { state: slainState } = recordBeastSlain(state, beast, victor);
    const next = applyHoardChoice(slainState, 'lair-emerald_basilisk', 'ai-1', 'gold');
    expect(next).toBe(slainState);   // no-op, same reference
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts -t "hoard"`
Expected: FAIL.

- [ ] **Step 3: Implement (modify + append in `src/systems/beast-system.ts`)**

Modify `recordBeastSlain`: where it currently pays `gold` to the slayer (MR1 Task 6), branch on tier:

```typescript
  const def = BEAST_DEFINITIONS[lair.beastId];
  const isChoiceTier = def.tier >= 2;
  const gold = isChoiceTier ? 0 : getBeastHoardGold(def, state.era);
  // ...existing lair-slain update...
  // gold payment block: only when gold > 0
  // after building `next`, queue the choice:
  if (isChoiceTier && slayerCiv) {
    next = {
      ...next,
      beasts: {
        ...next.beasts!,
        pendingHoardChoices: [...(next.beasts!.pendingHoardChoices ?? []), { lairId: lair.id, civId: victor.owner }],
      },
    };
  }
```

Append the new exports:

```typescript
const TROPHY_GOLD_PER_TURN: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 8 };

export interface HoardChoicePreview {
  gold: number;             // instant gold option
  lore: number;             // instant research-progress option
  trophyGoldPerTurn: number;
  beastName: string;
}

export function getHoardChoicePreview(state: GameState, lairId: string): HoardChoicePreview {
  const lair = state.beasts!.lairs[lairId];
  const def = BEAST_DEFINITIONS[lair.beastId];
  const baseGold = getBeastHoardGold(def, state.era);
  return {
    gold: baseGold * 2,                       // choice gold is richer than tier-1 auto-gold
    lore: Math.round(baseGold * 1.5),
    trophyGoldPerTurn: TROPHY_GOLD_PER_TURN[def.tier],
    beastName: def.name,
  };
}

export function getClaimedTrophyGoldPerTurn(state: GameState, civId: string): number {
  if (!state.beasts) return 0;
  let total = 0;
  for (const lair of Object.values(state.beasts.lairs)) {
    if (lair.status === 'claimed' && lair.claimedBy === civId) {
      total += TROPHY_GOLD_PER_TURN[BEAST_DEFINITIONS[lair.beastId].tier];
    }
  }
  return total;
}

export function applyHoardChoice(
  state: GameState,
  lairId: string,
  civId: string,
  choice: BeastHoardChoice,
): GameState {
  const beasts = state.beasts;
  const pending = beasts?.pendingHoardChoices?.find(p => p.lairId === lairId && p.civId === civId);
  if (!beasts || !pending) return state;
  const preview = getHoardChoicePreview(state, lairId);
  const lair = beasts.lairs[lairId];
  const civ = state.civilizations[civId];
  if (!civ) return state;

  let next: GameState = {
    ...state,
    beasts: {
      ...beasts,
      pendingHoardChoices: (beasts.pendingHoardChoices ?? []).filter(p => !(p.lairId === lairId && p.civId === civId)),
    },
  };

  if (choice === 'gold') {
    next = { ...next, civilizations: { ...next.civilizations, [civId]: { ...civ, gold: civ.gold + preview.gold } } };
  } else if (choice === 'lore') {
    next = applyBeastLoreResearch(next, civId, preview.lore);
  } else {
    next = {
      ...next,
      beasts: {
        ...next.beasts!,
        lairs: { ...next.beasts!.lairs, [lairId]: { ...lair, status: 'claimed', claimedBy: civId } },
      },
    };
  }
  return next;
}
```

For `applyBeastLoreResearch`: the tribal-village system already grants instant research (see `applyResearchBonus` imported in `src/systems/village-system.ts` from `@/systems/tech-system`). Read `grep -n "applyResearchBonus" -B2 -A12 src/systems/village-system.ts src/systems/tech-system.ts` and implement `applyBeastLoreResearch(state, civId, amount)` as a thin immutable wrapper around the exact same call the village outcome uses (same fields, same progress semantics). Do not invent a new research-progress mechanism.

Also import `BeastHoardChoice` in beast-system.ts from `@/core/types`.

- [ ] **Step 4: Run to verify pass, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: PASS. (The MR1 test "marks the lair slain, awards hoard gold" covers a tier-1 boar — it must still pass unchanged. If you changed its expectations, you broke tier-1; fix the code, not the test.)

```bash
git add src/systems/beast-system.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): hoard choice queue, preview, and application"
```

---

### Task 3: Turn-manager — AI auto-resolve + trophy income

**Files:**
- Modify: `src/core/turn-manager.ts`
- Test: `tests/core/turn-manager-beasts.test.ts`

- [ ] **Step 1: Write failing tests (append)**

```typescript
import { applyHoardChoice, getClaimedTrophyGoldPerTurn } from '@/systems/beast-system';

describe('turn-manager hoard handling', () => {
  it('AI pending hoard choices auto-resolve to gold during processTurn', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'AI Hoard Test');
    const aiCivId = Object.keys(state.civilizations).find(id => id !== state.currentPlayer)!;
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-emerald_basilisk': { id: 'lair-emerald_basilisk', beastId: 'emerald_basilisk', position: { q: 10, r: 10 }, status: 'slain', strength: 0, unitIds: [], slainBy: aiCivId, slainTurn: 1 } },
      sightingsByCiv: {},
      pendingHoardChoices: [{ lairId: 'lair-emerald_basilisk', civId: aiCivId }],
    };
    const goldBefore = state.civilizations[aiCivId].gold;
    const next = processTurn(state, new EventBus());
    expect(next.beasts!.pendingHoardChoices).toEqual([]);
    expect(next.civilizations[aiCivId].gold).toBeGreaterThan(goldBefore);
  });

  it('claimed trophies pay per-turn gold during processTurn', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Trophy Test');
    const me = state.currentPlayer;
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-emerald_basilisk': { id: 'lair-emerald_basilisk', beastId: 'emerald_basilisk', position: { q: 10, r: 10 }, status: 'claimed', claimedBy: me, strength: 0, unitIds: [], slainBy: me, slainTurn: 1 } },
      sightingsByCiv: {},
    };
    const baseline = createNewGame('rome', 'beast-turn-seed', 'small', 'Trophy Baseline');
    const withTrophy = processTurn(state, new EventBus());
    const withoutTrophy = processTurn(baseline, new EventBus());
    const delta = withTrophy.civilizations[me].gold - withoutTrophy.civilizations[me].gold;
    expect(delta).toBe(getClaimedTrophyGoldPerTurn(state, me));
  });
});
```

(Adjust `EventBus` construction to match the file's existing tests. The pending-choice auto-resolve must only fire for civs that are NOT the human `currentPlayer` — check how turn-manager distinguishes AI civs, e.g. the loop that runs `basic-ai` per civ, and resolve inside that loop.)

- [ ] **Step 2: Implement in `processTurn`**

Inside the per-civ AI processing loop (find it: `grep -n "basic-ai\|runAi\|processAi" src/core/turn-manager.ts src/ai/basic-ai.ts | head`), for each AI civ:

```typescript
    for (const pending of [...(newState.beasts?.pendingHoardChoices ?? [])]) {
      if (pending.civId !== aiCivId) continue;
      newState = applyHoardChoice(newState, pending.lairId, pending.civId, 'gold') as typeof newState;
    }
```

Trophy income: find where per-turn civ gold accrues (the economy block — `grep -n "gold +=\|goldPerTurn" src/core/turn-manager.ts src/systems/economy-system.ts | head`) and add, per civ, in the same place city gold is added:

```typescript
    civ.gold += getClaimedTrophyGoldPerTurn(newState, civId);
```

**HUD rule:** the HUD per-turn gold rate must include this. Find the helper that computes the displayed per-turn gold (`grep -rn "perTurn\|goldRate" src/ui/ | head`) and add `getClaimedTrophyGoldPerTurn(state, state.currentPlayer)` there too, so accrual and display can't drift.

- [ ] **Step 3: Run, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/turn-manager-beasts.test.ts`
Expected: PASS.

```bash
git add src/core/turn-manager.ts src/ui tests/core/turn-manager-beasts.test.ts
git commit -m "feat(beasts): AI hoard auto-resolve and per-turn trophy income"
```

---

### Task 4: Hoard panel UI (TDD)

**Files:**
- Create: `src/ui/beast-hoard-panel.ts`
- Test: `tests/ui/beast-hoard-panel.test.ts`

- [ ] **Step 1: Write failing DOM tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createBeastHoardPanel } from '@/ui/beast-hoard-panel';

describe('beast hoard panel', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const preview = { gold: 160, lore: 120, trophyGoldPerTurn: 3, beastName: 'Emerald Basilisk' };

  it('shows all three options with concrete numbers', () => {
    createBeastHoardPanel(container, preview, () => {});
    const panel = container.querySelector('#beast-hoard-panel')!;
    expect(panel.textContent).toContain('Emerald Basilisk');
    expect(panel.textContent).toContain('160');
    expect(panel.textContent).toContain('120');
    expect(panel.textContent).toContain('3');
    expect(panel.querySelectorAll('button[data-choice]')).toHaveLength(3);
  });

  it('applies exactly once even on double-click (replay safety)', () => {
    const chosen: string[] = [];
    createBeastHoardPanel(container, preview, choice => chosen.push(choice));
    const goldButton = container.querySelector('button[data-choice="gold"]') as HTMLButtonElement;
    goldButton.click();
    goldButton.click();
    expect(chosen).toEqual(['gold']);
    expect(container.querySelector('#beast-hoard-panel')).toBeNull();
  });

  it('has no dismiss/close affordance (blocking by design)', () => {
    createBeastHoardPanel(container, preview, () => {});
    expect(container.querySelector('#beast-hoard-panel button[data-action="close"]')).toBeNull();
  });

  it('reopening never duplicates', () => {
    createBeastHoardPanel(container, preview, () => {});
    createBeastHoardPanel(container, preview, () => {});
    expect(container.querySelectorAll('#beast-hoard-panel')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement `src/ui/beast-hoard-panel.ts`**

```typescript
import type { BeastHoardChoice } from '@/core/types';
import type { HoardChoicePreview } from '@/systems/beast-system';
import { createGameButton } from '@/ui/ui-kit';

export function createBeastHoardPanel(
  container: HTMLElement,
  preview: HoardChoicePreview,
  onChoose: (choice: BeastHoardChoice) => void,
): HTMLElement {
  container.querySelector('#beast-hoard-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'beast-hoard-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:50;padding:16px;overflow:auto;';

  const title = document.createElement('h2');
  title.textContent = `The ${preview.beastName} is slain!`;
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0 0 8px;';
  panel.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = 'Claim your prize. Choose one:';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 16px;';
  panel.appendChild(intro);

  const options: Array<{ choice: BeastHoardChoice; label: string; detail: string }> = [
    { choice: 'gold', label: `💰 Gold Hoard — +${preview.gold} gold`, detail: 'The beast guarded a fortune. Take it all, right now.' },
    { choice: 'lore', label: `📜 Ancient Lore — +${preview.lore} research`, detail: 'Secrets of a forgotten age speed your current research.' },
    { choice: 'trophy', label: `🏆 Beast Trophy — +${preview.trophyGoldPerTurn} gold every turn`, detail: 'Claim the lair as a monument. Pilgrims and traders pay tribute forever.' },
  ];

  for (const option of options) {
    const card = document.createElement('section');
    card.style.cssText = 'margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';
    const button = createGameButton(option.label, 'primary');
    button.dataset.choice = option.choice;
    button.style.width = '100%';
    button.addEventListener('click', () => { panel.remove(); onChoose(option.choice); });
    card.appendChild(button);
    const detail = document.createElement('div');
    detail.textContent = option.detail;
    detail.style.cssText = 'font-size:12px;opacity:0.75;margin-top:6px;';
    card.appendChild(detail);
    panel.appendChild(card);
  }

  container.appendChild(panel);
  return panel;
}
```

- [ ] **Step 3: Run to verify pass, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/beast-hoard-panel.test.ts`
Expected: PASS.

```bash
git add src/ui/beast-hoard-panel.ts tests/ui/beast-hoard-panel.test.ts
git commit -m "feat(beasts): blocking hoard choice panel"
```

---

### Task 5: main.ts wiring — show, resolve, persist across reload

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Resolve helper**

```typescript
function maybeShowPendingHoardChoice(): void {
  const pending = (gameState.beasts?.pendingHoardChoices ?? [])
    .find(p => p.civId === gameState.currentPlayer);
  if (!pending) return;
  const preview = getHoardChoicePreview(gameState, pending.lairId);
  createBeastHoardPanel(uiContainer, preview, choice => {
    const lair = gameState.beasts!.lairs[pending.lairId];
    gameState = applyHoardChoice(gameState, pending.lairId, pending.civId, choice) as typeof gameState;
    bus.emit('beast:hoard-claimed', { lairId: pending.lairId, beastId: lair.beastId, civId: pending.civId, choice });
    refreshHud();                       // per-turn rates may have changed (trophy)
    maybeShowPendingHoardChoice();      // next pending choice, if any (queue)
  });
}
```

Use the actual HUD-refresh function name (`grep -n "function refreshHud\|updateHud" src/main.ts`). Match the state-update idiom of surrounding code (reassign vs slice-copy), as in MR1 Task 8.

- [ ] **Step 2: Call sites**

1. Immediately after the player slay path (MR1 Task 8's `recordBeastSlain` block in each combat branch): `maybeShowPendingHoardChoice();`
2. At the start of each human player's turn (same place MR2's sighting scan runs on turn handoff) — this covers both the multi-slay queue and the reload-mid-choice case, since pending choices live in the save.

- [ ] **Step 3: Notification on claim**

```typescript
bus.on('beast:hoard-claimed', ({ beastId, civId, choice }) => {
  const def = BEAST_DEFINITIONS[beastId];
  const label = choice === 'gold' ? 'took the Gold Hoard' : choice === 'lore' ? 'claimed the Ancient Lore' : 'raised a Beast Trophy';
  appendNotification(notificationLog, civId, {
    message: `You ${label} of the ${def.name}.`, type: 'success', turn: gameState.turn,
  });
});
```

- [ ] **Step 4: Lair glyph for claimed lairs**

MR1's render-loop glyph map already shows 🏆 for `'claimed'` (and `'slain'`). Verify the MR1 code includes `'claimed'`; if not, update the glyph expression:

```typescript
const glyph = lair.status === 'slain' || lair.status === 'claimed' ? '🏆' : '🐾';
```

- [ ] **Step 5: Gates + manual check, then PR**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: both exit 0.
Manual (`yarn dev`): slay a basilisk (temporarily raise its awaken chance locally if needed; revert) → panel shows with numbers → pick Trophy → HUD gold rate increases, lair shows 🏆, notification logged. Save+reload mid-choice → panel reappears.

```bash
git add src/main.ts src/renderer/render-loop.ts
git commit -m "feat(beasts): hoard choice flow wired into game shell"
git push -u origin HEAD
gh pr create --title "feat(beasts): MR4 — hoard choices + lair trophies" --body "$(cat <<'EOF'
## Summary
- Tier ≥ 2 beast slays now present a blocking choose-one reward: Gold Hoard / Ancient Lore (instant research) / Beast Trophy (permanent +gold per turn)
- AI civs auto-resolve to gold during turn processing; choices queue in save state (reload-safe, multi-slay-safe)
- Trophy income accrues in turn processing AND is included in the HUD per-turn gold rate (no lying HUD)

## Why this is safe to merge partial
All surfaces fully wired; tier-1 beasts keep the existing auto-gold flow unchanged. See docs/superpowers/plans/2026-06-11-legendary-beasts-index.md for the remaining MRs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [ ] Tier-1 auto-gold path unchanged (MR1 tests pass untouched)
- [ ] `applyHoardChoice` is the only mutation path for choices; wrong-civ calls are no-ops (test)
- [ ] AI resolution lives in turn processing, not UI (actor-complete)
- [ ] HUD rate and accrual share `getClaimedTrophyGoldPerTurn`
- [ ] Queue handles multiple pending choices sequentially; double-click safe
- [ ] Lore reuses the village-system research-bonus mechanism — no parallel invention
