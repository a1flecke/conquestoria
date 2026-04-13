# #80 — Message log leaks across hotseat players

**See [README.md](README.md) for shared diagnosis context.**

**Direct cause:** `src/main.ts:201` `notificationLog: NotificationEntry[]` is a single global array. Both players write to it; the log panel renders all entries.

**Fix:** Extract a tiny module that scopes the log per civId, then wire `main.ts` to it.

---

## Task 1: Per-player log module test (RED)

**Files:**
- Create: `tests/ui/notification-log.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import {
  appendNotification,
  createNotificationLog,
  getNotificationsForPlayer,
} from '@/ui/notification-log';

describe('notification log hot-seat scoping', () => {
  it('appends to the active player only', () => {
    const log = createNotificationLog();
    appendNotification(log, 'player', { message: 'P1 trained warrior', type: 'info', turn: 1 });
    appendNotification(log, 'ai-1', { message: 'P2 researched archery', type: 'info', turn: 1 });
    expect(getNotificationsForPlayer(log, 'player').map(e => e.message)).toEqual(['P1 trained warrior']);
    expect(getNotificationsForPlayer(log, 'ai-1').map(e => e.message)).toEqual(['P2 researched archery']);
  });

  it('caps each player log at 50 entries independently', () => {
    const log = createNotificationLog();
    for (let i = 0; i < 60; i++) {
      appendNotification(log, 'player', { message: `m${i}`, type: 'info', turn: i });
    }
    appendNotification(log, 'ai-1', { message: 'only-one', type: 'info', turn: 0 });
    const p1 = getNotificationsForPlayer(log, 'player');
    expect(p1.length).toBe(50);
    expect(p1[0].message).toBe('m10');
    expect(p1[49].message).toBe('m59');
    expect(getNotificationsForPlayer(log, 'ai-1').length).toBe(1);
  });

  it('returns an empty array for a civId with no entries', () => {
    const log = createNotificationLog();
    expect(getNotificationsForPlayer(log, 'never-seen')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
yarn test tests/ui/notification-log.test.ts
```

Expected: FAIL — module `@/ui/notification-log` does not exist.

---

## Task 2: Implement the module (GREEN)

**Files:**
- Create: `src/ui/notification-log.ts`

- [ ] **Step 1: Write the module**

```ts
// src/ui/notification-log.ts
export interface NotificationEntry {
  message: string;
  type: 'info' | 'success' | 'warning';
  turn: number;
}

export type NotificationLog = Record<string, NotificationEntry[]>;

const MAX_PER_PLAYER = 50;

export function createNotificationLog(): NotificationLog {
  return {};
}

export function appendNotification(log: NotificationLog, civId: string, entry: NotificationEntry): void {
  const list = log[civId] ?? (log[civId] = []);
  list.push(entry);
  if (list.length > MAX_PER_PLAYER) list.shift();
}

export function getNotificationsForPlayer(log: NotificationLog, civId: string): NotificationEntry[] {
  return log[civId] ?? [];
}
```

- [ ] **Step 2: Run regression**

```bash
yarn test tests/ui/notification-log.test.ts
```

Expected: PASS.

- [ ] **Step 3: Decide on `NotificationEntry` location**

Check whether `NotificationEntry` is currently exported from `src/core/types.ts`:

```bash
grep -n "NotificationEntry" src/core/types.ts src/main.ts
```

- If it lives in `src/core/types.ts`, **delete it from there** and have `src/main.ts` import it from `@/ui/notification-log` instead. Single source of truth.
- If it lives only in `src/main.ts`, no change to `types.ts` is needed.

---

## Task 3: Wire main.ts to per-player log (GREEN)

**Files:**
- Modify: `src/main.ts:200-208` (the `notificationLog` declaration and `showNotification`)
- Modify: `src/main.ts:281-298` (the `toggleNotificationLog` rendering loop)

- [ ] **Step 1: Replace the global log declaration**

Find:

```ts
const notificationLog: NotificationEntry[] = [];
```

Replace with:

```ts
import {
  appendNotification,
  createNotificationLog,
  getNotificationsForPlayer,
  type NotificationEntry,
} from '@/ui/notification-log';
// (Place the import at the top of the file with the other @/ui imports;
// remove the corresponding NotificationEntry import from @/core/types if it existed.)

const notificationLog = createNotificationLog();
```

- [ ] **Step 2: Replace `showNotification` body**

Find:

```ts
function showNotification(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  notificationQueue.push({ message, type });
  notificationLog.push({ message, type, turn: gameState?.turn ?? 0 });
  if (notificationLog.length > 50) notificationLog.shift();
  if (!isShowingNotification) displayNextNotification();
}
```

Replace with:

```ts
function showNotification(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  notificationQueue.push({ message, type });
  if (gameState) {
    appendNotification(notificationLog, gameState.currentPlayer, {
      message,
      type,
      turn: gameState.turn,
    });
  }
  if (!isShowingNotification) displayNextNotification();
}
```

- [ ] **Step 3: Replace the log rendering loop**

In `toggleNotificationLog` (around line 281-298), find:

```ts
if (notificationLog.length === 0) {
  // empty branch
} else {
  for (let i = notificationLog.length - 1; i >= 0; i--) {
    const entry = notificationLog[i];
    // … render row …
  }
}
```

Replace with:

```ts
const entries = gameState
  ? getNotificationsForPlayer(notificationLog, gameState.currentPlayer)
  : [];

if (entries.length === 0) {
  const empty = document.createElement('div');
  empty.style.cssText = 'font-size:11px;opacity:0.5;text-align:center;';
  empty.textContent = 'No messages yet';
  panel.appendChild(empty);
} else {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const row = document.createElement('div');
    row.style.cssText = 'font-size:11px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
    const turnSpan = document.createElement('span');
    turnSpan.style.cssText = `color:${colors[entry.type]};opacity:0.7;margin-right:4px;`;
    turnSpan.textContent = `T${entry.turn}`;
    row.appendChild(turnSpan);
    row.appendChild(document.createTextNode(entry.message));
    panel.appendChild(row);
  }
}
```

(Preserve any surrounding code — `colors`, panel/header construction — exactly as it is. Only the empty/non-empty rendering changes.)

- [ ] **Step 4: Run full suite + build**

```bash
yarn test
yarn build
```

Both must pass.

- [ ] **Step 5: Manual smoke test**

```bash
yarn dev
```

1. Start a 2-player hotseat game (Player 1 = `player`, Player 2 = `ai-1`).
2. As P1: train a unit. Toast appears. End turn.
3. As P2: research a tech. Toast appears. Open the message log. **Verify only P2's message is shown.**
4. End turn back to P1. Open the log. **Verify only P1's message is shown.**

If either log shows the other player's entries, the wiring is wrong — re-check that `gameState.currentPlayer` is being passed to both `appendNotification` and `getNotificationsForPlayer`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/notification-log.ts src/main.ts src/core/types.ts tests/ui/notification-log.test.ts
git commit -m "$(cat <<'EOF'
fix(hotseat): scope notification log per civ to stop cross-player leakage (#80)

The notification log was a single global array; in hot-seat both
players wrote to and read from the same list, so Player 2's actions
appeared in Player 1's log. Extract a NotificationLog keyed by civId
and route reads/writes through gameState.currentPlayer.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-check
- Did you remove the duplicate `NotificationEntry` definition (single source of truth)?
- Does the manual smoke test confirm logs are isolated per player?
- The transient toast queue (`notificationQueue`) is intentionally still a single array — it only ever contains the active player's notifications because `showNotification` is only called during their turn. Do not change it.
