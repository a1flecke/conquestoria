# Cyber Warfare Stub Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the anachronistic era-5 `cyber-warfare` stub, restore `cyber-warfare` as an era-12 military tech, and redistribute its four spy missions to historically correct eras (Cold War, Space Race, Information Age).

**Architecture:** Tech-tree change removes one entry from `RELOCATED_STUBS` and frees the ID for use in era-12. Mission-gating logic in `espionage-system.ts` replaces a single STAGE_5 block with three new stage blocks (STAGE_5/6/7). No new files; all changes are edits to existing files.

**Tech Stack:** TypeScript (strict), Vitest, `bash scripts/run-with-mise.sh yarn <cmd>`

## Global Constraints

- Run commands as `bash scripts/run-with-mise.sh yarn <cmd>` — never `yarn` directly or `eval "$(mise activate bash)"`
- `yarn test` only — do NOT run `yarn build` (tsc fails until Task 3 of the era-12 plan adds FALLBACK_ICONS/LOCOMOTION_CLASS entries for `cyber_unit` and `stealth_bomber`)
- All new tests use Vitest (`import { describe, it, expect } from 'vitest'`)
- Commit timeout: 30 000 ms; push timeout: 120 000 ms
- Total tech count after this plan: **368** (was 369 — one stub removed)
- Espionage track count after this plan: **25** (was 26)

---

### Task 1: Update tech-count tests to expect 368, espionage track 25, and fix era-12 test ID

**Files:**
- Modify: `tests/systems/tech-system.test.ts`
- Modify: `tests/systems/tech-definitions.test.ts`
- Modify: `tests/systems/era-12.test.ts`

**Interfaces:**
- Produces: three test files with updated expectations that currently fail (RED)

- [ ] **Step 1: Update `tests/systems/tech-system.test.ts`**

Change the total count description and assertion (currently line 42–44):
```ts
// FROM:
it('has 369 techs total after adding era-12 (30 new techs across 15 tracks)', () => {
  expect(TECH_TREE.length).toBe(369);

// TO:
it('has 368 techs total after removing cyber-warfare stub and adding era-12 (29 net new techs)', () => {
  expect(TECH_TREE.length).toBe(368);
```

Change the legacy shape test (currently lines 23–38) — espionage drops from 26 to 25 (same group as economy/science/etc), military stays 26:
```ts
// FROM:
  it('keeps the legacy shape after adding era-5 through era-12 nodes', () => {
    // Era 5-12 each add 2 techs per track. Espionage had 2 stubs → 26 total.
    // Economy/science/communication/maritime/exploration had 9 era1-4 + 16 (era5-12) = 25.
    // Military gets +2 from balloon-corps (era 7) + air-superiority (era 9) → 26.
    // Other tracks had 8 era1-4 + 16 (era5-12) = 24.
    const expectedCount = track === 'espionage' || track === 'military'
      ? 26
      : ['economy', 'science', 'communication', 'maritime', 'exploration'].includes(track)
        ? 25
        : 24;

// TO:
  it('keeps the legacy shape after removing cyber-warfare stub and adding era-5 through era-12 nodes', () => {
    // cyber-warfare stub removed: espionage drops from 26 to 25.
    // Economy/science/communication/maritime/exploration/espionage: 9 era1-4 + 16 (era5-12) = 25.
    // Military gets +2 from balloon-corps (era 7) + air-superiority (era 9) → 26.
    // Other tracks had 8 era1-4 + 16 (era5-12) = 24.
    const expectedCount = track === 'military'
      ? 26
      : ['economy', 'science', 'communication', 'maritime', 'exploration', 'espionage'].includes(track)
        ? 25
        : 24;
```

- [ ] **Step 2: Update `tests/systems/tech-definitions.test.ts`**

Change the total count (currently line 11–13):
```ts
// FROM:
it('has exactly 369 techs after adding era-12 (30 new techs across 15 tracks)', () => {
  expect(TECH_TREE.length).toBe(369);

// TO:
it('has exactly 368 techs after removing cyber-warfare stub and adding era-12', () => {
  expect(TECH_TREE.length).toBe(368);
```

Change the track count test (currently lines 22–32) — same espionage/military fix:
```ts
// FROM:
    // Espionage had 10 (8 era1-4 + 2 stubs) + 16 (2×8 eras 5-12) = 26.
    // Economy/science/communication/maritime/exploration had 9 (era1-4) + 16 = 25.
    // Military gets +2 from balloon-corps (era 7) + air-superiority (era 9) → 26.
    // Other 8 tracks had 8 era1-4 + 16 = 24.
    const expected = track === 'espionage' || track === 'military'
      ? 26
      : ['economy', 'science', 'communication', 'maritime', 'exploration'].includes(track)
        ? 25
        : 24;

// TO:
    // cyber-warfare stub removed: espionage had 8 era1-4 + 1 stub + 16 (era5-12) = 25.
    // Economy/science/communication/maritime/exploration had 9 (era1-4) + 16 = 25.
    // Military gets +2 from balloon-corps (era 7) + air-superiority (era 9) → 26.
    // Other 8 tracks had 8 era1-4 + 16 = 24.
    const expected = track === 'military'
      ? 26
      : ['economy', 'science', 'communication', 'maritime', 'exploration', 'espionage'].includes(track)
        ? 25
        : 24;
```

- [ ] **Step 3: Update `tests/systems/era-12.test.ts`**

Change the `cyber-combat` references to `cyber-warfare`:
```ts
// FROM:
  it('cyber-combat unlocks cyber_unit', () => {
    const tech = era12Techs.find(t => t.id === 'cyber-combat');

// TO:
  it('cyber-warfare unlocks cyber_unit', () => {
    const tech = era12Techs.find(t => t.id === 'cyber-warfare');
```

- [ ] **Step 4: Run and confirm RED**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-system.test.ts tests/systems/tech-definitions.test.ts tests/systems/era-12.test.ts
```

Expected: all three files FAIL. `tech-system` and `tech-definitions` fail on count (368 vs 369, espionage count). `era-12` fails because `cyber-combat` still exists (no `cyber-warfare` in era 12 yet).

---

### Task 2: Remove the stub and restore `cyber-warfare` as an era-12 military tech

**Files:**
- Modify: `src/systems/tech-definitions-eras5-7.ts`
- Modify: `src/systems/tech-definitions-eras12.ts`

**Interfaces:**
- Consumes: Task 1 failing tests
- Produces: `cyber-warfare` ID in `TECH_TREE` at era 12 with `unlocksUnits: ['cyber_unit', 'spy_hacker']`; total tech count 368; espionage track 25

- [ ] **Step 1: Remove `cyber-warfare` from `RELOCATED_STUBS`**

In `src/systems/tech-definitions-eras5-7.ts`, remove this line from the `RELOCATED_STUBS` array:
```ts
// REMOVE this entire entry:
  { id: 'cyber-warfare', name: 'Cyber Warfare', track: 'espionage', cost: 185, prerequisites: ['digital-surveillance'], unlocks: ['Cyber Attack', 'Election Interference'], unlocksUnits: ['spy_hacker'], era: 5 },
```

`digital-surveillance` stays. The array shrinks by one entry.

- [ ] **Step 2: Rename `cyber-combat` → `cyber-warfare` in era-12 definitions**

In `src/systems/tech-definitions-eras12.ts`, change the first tech entry:
```ts
// FROM:
  { id: 'cyber-combat', name: 'Cyber Combat', track: 'military', cost: 390,
    prerequisites: ['icbm-development', 'satellite-surveillance'],
    unlocks: ['Deploy cyber specialists that drain enemy city gold each turn when adjacent; cities with no Cyber Defense Center are fully exposed'],
    unlocksUnits: ['cyber_unit'], era: 12 },

// TO:
  { id: 'cyber-warfare', name: 'Cyber Warfare', track: 'military', cost: 390,
    prerequisites: ['icbm-development', 'satellite-surveillance'],
    unlocks: ['Deploy cyber specialists that drain enemy city gold each turn when adjacent; cities with no Cyber Defense Center are fully exposed'],
    unlocksUnits: ['cyber_unit', 'spy_hacker'], era: 12 },
```

- [ ] **Step 3: Run and confirm Task 1 tests now pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-system.test.ts tests/systems/tech-definitions.test.ts tests/systems/era-12.test.ts tests/systems/tech-unlocks-consistency.test.ts
```

Expected: all PASS. (The era-12 skip in `tech-unlocks-consistency.test.ts` covers `cyber_unit` and `stealth_bomber` not yet in TRAINABLE_UNITS; `spy_hacker` is covered by the reverse check since it has `techRequired: 'cyber-warfare'` and `cyber-warfare` now contains it in `unlocksUnits`.)

- [ ] **Step 4: Commit**

```bash
git add src/systems/tech-definitions-eras5-7.ts src/systems/tech-definitions-eras12.ts tests/systems/tech-system.test.ts tests/systems/tech-definitions.test.ts tests/systems/era-12.test.ts
git commit -m "$(cat <<'EOF'
feat(espionage): retire cyber-warfare era-5 stub; restore as era-12 military tech

Removes the relocated stub from era-5 espionage track (368 total techs, espionage
track 25). Restores cyber-warfare as the era-12 military tech that unlocks cyber_unit
and spy_hacker. Mission gate wiring and CI fade follow in the next commit.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jBXuK84vwoV6C4o63JVpE
EOF
)"
```

---

### Task 3: Write failing tests for the mission gate split and CI fade

**Files:**
- Modify: `tests/systems/espionage-system.test.ts`

**Interfaces:**
- Consumes: `getAvailableMissions` from `src/systems/espionage-system.ts`
- Produces: failing tests for the three new mission gates and the inverted `digital-surveillance` assertion

- [ ] **Step 1: Replace the existing Stage 5 test (lines ~272–286)**

Find and replace the test titled `'unlocks Stage 5 missions from digital-surveillance and cyber-warfare'`:
```ts
// REPLACE the entire it() block with:
    it('digital-surveillance alone does not unlock any former Stage-5 missions', () => {
      const missions = getAvailableMissions(['digital-surveillance']);
      expect(missions).not.toContain('cyber_attack');
      expect(missions).not.toContain('misinformation_campaign');
      expect(missions).not.toContain('election_interference');
      expect(missions).not.toContain('satellite_surveillance');
    });
```

- [ ] **Step 2: Add new gate tests inside the `getAvailableMissions` describe block, after the replaced test**

```ts
    it('cold-war-networks unlocks misinformation and election_interference only', () => {
      const missions = getAvailableMissions(['cold-war-networks']);
      expect(missions).toContain('misinformation_campaign');
      expect(missions).toContain('election_interference');
      expect(missions).not.toContain('satellite_surveillance');
      expect(missions).not.toContain('cyber_attack');
    });

    it('satellite-surveillance tech unlocks satellite_surveillance mission only', () => {
      const missions = getAvailableMissions(['satellite-surveillance']);
      expect(missions).toContain('satellite_surveillance');
      expect(missions).not.toContain('cyber_attack');
      expect(missions).not.toContain('misinformation_campaign');
    });

    it('cyber-intelligence unlocks cyber_attack only', () => {
      const missions = getAvailableMissions(['cyber-intelligence']);
      expect(missions).toContain('cyber_attack');
      expect(missions).not.toContain('misinformation_campaign');
      expect(missions).not.toContain('satellite_surveillance');
    });

    it('full era-10+ tech ladder unlocks all missions', () => {
      const missions = getAvailableMissions([
        'espionage-scouting', 'espionage-informants', 'spy-networks',
        'cryptography', 'cold-war-networks', 'satellite-surveillance', 'cyber-intelligence',
      ]);
      expect(missions).toContain('cyber_attack');
      expect(missions).toContain('misinformation_campaign');
      expect(missions).toContain('election_interference');
      expect(missions).toContain('satellite_surveillance');
    });
```

- [ ] **Step 3: Run and confirm RED**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/espionage-system.test.ts
```

Expected: FAIL — the replaced test now asserts `digital-surveillance` does NOT unlock the missions, but the implementation still unlocks them. The four new gate tests also fail (no new stages exist yet).

---

### Task 4: Implement the mission gate split and CI fade redirect

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/systems/city-system.ts`

**Interfaces:**
- Consumes: Task 3 failing tests
- Produces: `getAvailableMissions` with STAGE_5/6/7 replacing old STAGE_5; `applyBuildingCI` using `signals-intelligence` for security-bureau fade

- [ ] **Step 1: Replace the STAGE_5 constants in `src/systems/espionage-system.ts`**

Find the block (lines ~270–276):
```ts
// FROM:
const STAGE_5_TECHS = ['digital-surveillance', 'cyber-warfare'];

const STAGE_1_MISSIONS: SpyMissionType[] = ['scout_area', 'monitor_troops'];
const STAGE_2_MISSIONS: SpyMissionType[] = ['gather_intel', 'identify_resources', 'monitor_diplomacy'];
const STAGE_3_MISSIONS: SpyMissionType[] = ['steal_tech', 'sabotage_production', 'incite_unrest'];
const STAGE_4_MISSIONS: SpyMissionType[] = ['assassinate_advisor', 'forge_documents', 'fund_rebels', 'arms_smuggling'];
const STAGE_5_MISSIONS: SpyMissionType[] = ['cyber_attack', 'misinformation_campaign', 'election_interference', 'satellite_surveillance'];
```

```ts
// TO:
// STAGE_5 is intentionally absent — digital-surveillance gates no missions until era-appropriate
// missions are added in a follow-up issue. cold-war-networks resumes the ladder at era 10.
const STAGE_5_TECHS = ['cold-war-networks'];       // era 10 — Cold War propaganda/subversion
const STAGE_6_TECHS = ['satellite-surveillance'];   // era 11 — spy satellites
const STAGE_7_TECHS = ['cyber-intelligence'];        // era 12 — cyber operative attacks

const STAGE_1_MISSIONS: SpyMissionType[] = ['scout_area', 'monitor_troops'];
const STAGE_2_MISSIONS: SpyMissionType[] = ['gather_intel', 'identify_resources', 'monitor_diplomacy'];
const STAGE_3_MISSIONS: SpyMissionType[] = ['steal_tech', 'sabotage_production', 'incite_unrest'];
const STAGE_4_MISSIONS: SpyMissionType[] = ['assassinate_advisor', 'forge_documents', 'fund_rebels', 'arms_smuggling'];
const STAGE_5_MISSIONS: SpyMissionType[] = ['misinformation_campaign', 'election_interference'];
const STAGE_6_MISSIONS: SpyMissionType[] = ['satellite_surveillance'];
const STAGE_7_MISSIONS: SpyMissionType[] = ['cyber_attack'];
```

- [ ] **Step 2: Update `getAvailableMissions` to check STAGE_5/6/7**

Find the function body (lines ~278–286):
```ts
// FROM:
export function getAvailableMissions(completedTechs: string[]): SpyMissionType[] {
  const missions: SpyMissionType[] = [];
  if (STAGE_1_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_1_MISSIONS);
  if (STAGE_2_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_2_MISSIONS);
  if (STAGE_3_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_3_MISSIONS);
  if (STAGE_4_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_4_MISSIONS);
  if (STAGE_5_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_5_MISSIONS);
  return missions;
}

// TO:
export function getAvailableMissions(completedTechs: string[]): SpyMissionType[] {
  const missions: SpyMissionType[] = [];
  if (STAGE_1_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_1_MISSIONS);
  if (STAGE_2_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_2_MISSIONS);
  if (STAGE_3_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_3_MISSIONS);
  if (STAGE_4_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_4_MISSIONS);
  if (STAGE_5_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_5_MISSIONS);
  if (STAGE_6_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_6_MISSIONS);
  if (STAGE_7_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_7_MISSIONS);
  return missions;
}
```

- [ ] **Step 3: Redirect the security-bureau CI fade in `applyBuildingCI`**

Find the function (lines ~755–773). Change only the fade check for `security-bureau`:
```ts
// FROM:
  if (city.buildings.includes('security-bureau')) {
    const faded = completedTechs.includes('cyber-warfare');
    ciBonus += faded ? 15 : 30;
  }

// TO:
  if (city.buildings.includes('security-bureau')) {
    const faded = completedTechs.includes('signals-intelligence');
    ciBonus += faded ? 15 : 30;
  }
```

- [ ] **Step 4: Update the security-bureau building description in `src/systems/city-system.ts`**

Find the `security-bureau` entry (around line 91–98):
```ts
// FROM:
    description: 'Raises CI by 30 each turn and makes captured spies 50% less likely to be turned. Bonus halves at cyber-warfare era.',

// TO:
    description: 'Raises CI by 30 each turn and makes captured spies 50% less likely to be turned. Bonus halves when Signals Intelligence is researched.',
```

- [ ] **Step 5: Run and confirm all tests GREEN**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/espionage-system.test.ts tests/systems/tech-system.test.ts tests/systems/tech-definitions.test.ts tests/systems/era-12.test.ts tests/systems/tech-unlocks-consistency.test.ts
```

Expected: ALL PASS.

- [ ] **Step 6: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: ALL PASS. No regressions.

- [ ] **Step 7: Commit**

```bash
git add src/systems/espionage-system.ts src/systems/city-system.ts tests/systems/espionage-system.test.ts
git commit -m "$(cat <<'EOF'
feat(espionage): split era-5 spy missions to historically correct eras 10-12

Retires the monolithic STAGE_5 gate (digital-surveillance/cyber-warfare at era 5).
Redistributes missions:
  - misinformation_campaign, election_interference → cold-war-networks (era 10)
  - satellite_surveillance → satellite-surveillance tech (era 11)
  - cyber_attack → cyber-intelligence (era 12)

Also redirects security-bureau CI fade from cyber-warfare to signals-intelligence
(era 10). digital-surveillance gates no missions until era-appropriate missions
are added (tracked in follow-up issue).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jBXuK84vwoV6C4o63JVpE
EOF
)"
```

---

### Task 5: Create GitHub issues and open PR

**Files:** none (GitHub only)

- [ ] **Step 1: Create Issue A — espionage building era rebalance**

```bash
gh issue create \
  --title "Espionage building era rebalance (intelligence-agency, security-bureau)" \
  --body "$(cat <<'EOF'
## Problem

Both espionage buildings are gated by early-era techs that predate the era expansion:

- **Intelligence Agency** — unlocked by \`espionage-informants\` (era 2, Classical). Formal intelligence agencies (Okhrana 1881, MI5 1909, FBI 1908) are an era 8–9 phenomenon.
- **Security Bureau** — unlocked by \`counter-intelligence\` (era 4, Renaissance). Secret police / internal security bureaus (KGB, Stasi, CIA) are a Cold War-era concept.

The \`security-bureau\` CI fade now triggers on \`signals-intelligence\` (era 10) as a temporary measure. The buildings themselves should be repositioned.

Also: \`spy_hacker\` (Cyber Operative) costs 110 production — appropriate for era 5 but trivially cheap at era-12 production rates. Review cost as part of this issue.

## Proposed direction

- Move \`intelligence-agency\` to era 8 (Nationalist), gated by \`political-intelligence\` or \`disinformation-bureau\`
- Move \`security-bureau\` to era 10 (Cold War), gated by \`cold-war-networks\` or \`signals-intelligence\`
- Adjust CI values and fade thresholds to match repositioned eras
- Review \`spy_hacker\` production cost for era-12 balance
EOF
)"
```

- [ ] **Step 2: Create Issue B — era-appropriate espionage missions for eras 5–9**

```bash
gh issue create \
  --title "Add era-appropriate espionage missions for eras 5–9 (filling the mission gap)" \
  --body "$(cat <<'EOF'
## Problem

After retiring the era-5 \`cyber-warfare\` stub, researching espionage techs in eras 5–9 unlocks no new spy missions. The mission ladder jumps from Stage 4 (era 4: \`assassinate_advisor\`, \`forge_documents\`, \`fund_rebels\`, \`arms_smuggling\`) directly to era 10.

Additionally, \`spy_operative\` is the top spy unit from era 4 through era 11 — an eight-era plateau with no unit upgrades.

## Proposed direction

Design and implement era-appropriate missions for each gap era. Historical anchors:

| Era | Name | Example missions |
|---|---|---|
| 5 | Early Modern | \`intercept_courier\`, \`bribe_official\` |
| 6 | Industrial | \`industrial_sabotage\`, \`railroad_disruption\` |
| 7 | Modern | \`double_agent\`, \`arms_embargo\` |
| 8 | Nationalist | \`propaganda_pamphlet\`, \`nationalist_incitement\` |
| 9 | Progressive | \`signals_intercept\`, \`telegraph_tap\` |

Also design 1–2 intermediate spy unit upgrades (eras 7–9) to break up the operative plateau.

\`digital-surveillance\` (era 5) is a natural gate for at least one new mission — it currently gates nothing after the stub retirement.
EOF
)"
```

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin era12-task1
gh pr create \
  --title "feat(era12): Task 1 — tech definitions, ERA_NAMES 8–12, cyber-warfare stub retirement" \
  --body "$(cat <<'EOF'
## Summary

- Adds 30 era-12 tech definitions (15 tracks × 2 techs, cost 380–420) in `src/systems/tech-definitions-eras12.ts`
- Extends `UnitType` union with `cyber_unit | stealth_bomber`; adds `geneTherapyReady?`, `cyberMarketDisruption?`, `trainedFromBuilding?` to types
- Wires `TECH_TREE_ERAS_12` into `TECH_TREE` (338 → 368 entries after stub removal)
- Adds `ERA_NAMES[8..12]` to tech-panel
- **Retires the era-5 `cyber-warfare` stub** — restores the ID as a proper era-12 military tech, redistributes its four spy missions to Cold War / Space Race / Information Age era gates, redirects security-bureau CI fade to `signals-intelligence` (era 10)

## Spy mission gate changes

| Mission | Was | Now |
|---|---|---|
| `misinformation_campaign` | era-5 `digital-surveillance` or `cyber-warfare` | era-10 `cold-war-networks` |
| `election_interference` | era-5 `digital-surveillance` or `cyber-warfare` | era-10 `cold-war-networks` |
| `satellite_surveillance` | era-5 `digital-surveillance` or `cyber-warfare` | era-11 `satellite-surveillance` |
| `cyber_attack` | era-5 `digital-surveillance` or `cyber-warfare` | era-12 `cyber-intelligence` |

## Out of scope (follow-up issues opened)

- #TBD — Espionage building era rebalance (intelligence-agency → era 8, security-bureau → era 10)
- #TBD — Era-appropriate espionage missions for eras 5–9 (fills the mission gap left by this change)
- Task 2: 12 era-12 buildings
- Task 3: cyber_unit + stealth_bomber full unit wiring
- Tasks 4–8: combat behaviors, turn-manager, NPs/wonder, passive tech effects, SFX/UI

## Why this is safe to merge partial

No player-visible surfaces are introduced. The new techs appear in `TECH_TREE` behind era-12 progression no player can reach yet. Spy missions now require era-10+ techs instead of era-5 techs — players in existing saves who had `digital-surveillance` but not `cold-war-networks` will lose access to the four former Stage-5 missions. This is intentional: those missions were never historically appropriate for era 5.

🤖 Generated with Claude Code
EOF
)"
```

- [ ] **Step 4: Record issue numbers in the PR body if needed**

After `gh issue create` outputs issue numbers, you can update the PR description to replace `#TBD` with the real numbers:
```bash
# gh pr edit <PR-number> --body "..." if you want to update
```
This step is optional — the issue links are cosmetic in the PR body.
