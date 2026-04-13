# #78 — Bronze Working falsely unlocks Barracks

**See [README.md](README.md) for shared diagnosis context.**

**Direct cause:** `src/systems/tech-definitions.ts:7` claims `'Unlock Barracks building'` but `barracks` in `src/systems/city-system.ts:37` has `techRequired: null`.

**Fix:** Remove the false claim, rewrite the Barracks description to match its real (currently no-op) behavior, and add a consistency regression that catches future drift.

---

## Task 1: Add tech-unlock consistency regression (RED)

**Files:**
- Create: `tests/systems/tech-unlocks-consistency.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';

describe('tech.unlocks copy matches gameplay gating', () => {
  it('every "Unlock <Name> building" claim corresponds to a building gated by that tech', () => {
    const failures: string[] = [];
    for (const tech of TECH_TREE) {
      for (const u of tech.unlocks) {
        const m = u.match(/^Unlock (.+?) building$/);
        if (!m) continue;
        const name = m[1];
        const building = Object.values(BUILDINGS).find(b => b.name === name);
        if (!building) {
          failures.push(`${tech.id}: claims "${u}" but no building named "${name}" exists`);
          continue;
        }
        if (building.techRequired !== tech.id) {
          failures.push(`${tech.id}: claims "${u}" but ${building.id}.techRequired is ${building.techRequired}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('every "Unlock <Name> unit" claim corresponds to a trainable unit gated by that tech', () => {
    const failures: string[] = [];
    for (const tech of TECH_TREE) {
      for (const u of tech.unlocks) {
        const m = u.match(/^Unlock (.+?) unit$/);
        if (!m) continue;
        const name = m[1];
        const unit = TRAINABLE_UNITS.find(t => t.name === name);
        if (!unit) {
          failures.push(`${tech.id}: claims "${u}" but no trainable unit named "${name}" exists`);
          continue;
        }
        if (unit.techRequired !== tech.id) {
          failures.push(`${tech.id}: claims "${u}" but ${unit.type}.techRequired is ${unit.techRequired}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
yarn test tests/systems/tech-unlocks-consistency.test.ts
```

Expected: FAIL with at least `bronze-working: claims "Unlock Barracks building" but barracks.techRequired is null`. If other failures appear (legitimate drift), capture them and fix them in Task 2.

---

## Task 2: Remove false claim and rewrite description (GREEN)

**Files:**
- Modify: `src/systems/tech-definitions.ts:7`
- Modify: `src/systems/city-system.ts:37`

- [ ] **Step 1: Investigate Barracks effects**

Check whether Barracks has any current gameplay effect (heal bonus, training discount, etc.):

```bash
grep -rn "'barracks'" src/ tests/
```

Note what you find; the description rewrite must match reality.

- [ ] **Step 2: Update tech-definitions.ts**

In `src/systems/tech-definitions.ts`, replace line 7:

```ts
{ id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 50, prerequisites: ['stone-weapons'], unlocks: ['Unlock Barracks building', 'swordsman'], era: 2 },
```

with:

```ts
{ id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 50, prerequisites: ['stone-weapons'], unlocks: ['Unlock Swordsman unit'], era: 2 },
```

(Confirm `Swordsman` is the exact `name` field of the swordsman entry in `TRAINABLE_UNITS`. Use whatever the actual name is.)

- [ ] **Step 3: Rewrite Barracks description**

In `src/systems/city-system.ts:37`, change `description: 'Trains soldiers'`:

- If Step 1 found a real Barracks effect, describe it concretely (e.g., `'Stationed units heal +5 HP per turn'`).
- If no effect exists, use: `description: 'A training ground. Required by future military doctrines.'` AND open a follow-up GitHub issue titled "Barracks has no mechanical effect" with body summarizing what `grep` showed.

- [ ] **Step 4: Run regression and full suite**

```bash
yarn test tests/systems/tech-unlocks-consistency.test.ts
yarn test
yarn build
```

All must pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/tech-definitions.ts src/systems/city-system.ts tests/systems/tech-unlocks-consistency.test.ts
git commit -m "$(cat <<'EOF'
fix(tech): remove false Bronze Working→Barracks unlock claim (#78)

Bronze Working claimed to unlock Barracks, but barracks.techRequired
was already null — Barracks is buildable from turn 1. Drop the false
claim, rewrite Barracks description to match real behavior, and add
a regression that asserts every "Unlock <Name> building/unit" string
matches the actual techRequired gating.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-check
- Did you also verify the `'Unlock Swordsman unit'` claim passes the second regression case (i.e., `swordsman.techRequired === 'bronze-working'`)? If not, the test will catch it; fix the swordsman entry too.
- If the follow-up issue was opened, include its number in the commit body or a note.
