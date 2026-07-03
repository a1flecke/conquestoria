# Cyber Warfare Stub Retirement

**Date:** 2026-07-03
**Status:** Approved for implementation

## Problem

`cyber-warfare` exists at era 5 (Early Modern) as a relocated stub — a placeholder added before era 8–12 content existed. It was never thematically correct: hacking and cyber operations belong in the Information Age, not the 1500s. The stub is actively wiring three game behaviors that all need to move:

1. **Stage 5 spy missions** — `cyber_attack`, `misinformation_campaign`, `election_interference`, `satellite_surveillance` all unlock when `digital-surveillance` OR `cyber-warfare` is researched (era 5). None of these missions fit era 5 historically.
2. **Security bureau CI fade** — the building's CI bonus drops from +30 → +15 when `cyber-warfare` is researched (era 5). This should trigger in the Cold War era when signals intelligence made human counterintelligence less dominant.
3. **`spy_hacker` gating** — the Cyber Operative is gated by the era-5 stub but belongs in the Information Age.

Additionally, era-12 Task 1 hit a duplicate ID collision with this stub, requiring a workaround (`cyber-combat`).

## Solution

Remove the stub entirely. Split Stage 5 missions across their historically appropriate eras. Redirect the CI fade. Restore `cyber-warfare` as the era-12 military tech.

## Changes

### `src/systems/tech-definitions-eras5-7.ts`

Remove `cyber-warfare` from `RELOCATED_STUBS`. `digital-surveillance` remains — it still gates the intelligence-agency CI fade (drops from +20 → +10 when researched). However, after this change `digital-surveillance` no longer unlocks any spy missions. Players will see no mission benefit from researching it until Issue B adds era-appropriate espionage missions for eras 5–9. This is an intentional temporary gap: the missions it formerly unlocked (`cyber_attack`, etc.) were historically wrong for era 5.

### `src/systems/tech-definitions-eras12.ts`

Rename `cyber-combat` back to `cyber-warfare` (now free). Add `spy_hacker` to its `unlocksUnits` alongside `cyber_unit`.

### `src/systems/espionage-system.ts`

**Stage 5 missions — retired and redistributed into three new stages:**

| Mission | New gate tech | Track | Era | Historical rationale |
|---|---|---|---|---|
| `misinformation_campaign` | `cold-war-networks` | espionage | 10 | Soviet active measures, Cold War propaganda |
| `election_interference` | `cold-war-networks` | espionage | 10 | Cold War-era political subversion |
| `satellite_surveillance` (mission) | `satellite-surveillance` (tech) | espionage | 11 | First spy satellites (Corona, 1960) |
| `cyber_attack` | `cyber-intelligence` | espionage | 12 | State-sponsored hacking via cyber operatives |

All four new gate techs are in the espionage track, consistent with STAGE_1–4 which all use espionage-track techs. `cyber-warfare` (military track) is deliberately excluded as a mission gate.

`STAGE_5_TECHS` and `STAGE_5_MISSIONS` are removed. Three new constants replace them, continuing the numeric sequence without a gap:

```ts
const STAGE_5_TECHS = ['cold-war-networks'];
const STAGE_5_MISSIONS: SpyMissionType[] = ['misinformation_campaign', 'election_interference'];

const STAGE_6_TECHS = ['satellite-surveillance'];
const STAGE_6_MISSIONS: SpyMissionType[] = ['satellite_surveillance'];

const STAGE_7_TECHS = ['cyber-intelligence'];
const STAGE_7_MISSIONS: SpyMissionType[] = ['cyber_attack'];
```

`getAvailableMissions` gains three new `if` blocks for STAGE_5/6/7, replacing the old STAGE_5 block.

**Security bureau CI fade:** Change `completedTechs.includes('cyber-warfare')` to `completedTechs.includes('signals-intelligence')` (era 10, espionage track).

### `src/systems/city-system.ts`

Update `security-bureau` description: *"Bonus halves at cyber-warfare era"* → *"Bonus halves when Signals Intelligence is researched."*

No change to `spy_hacker.techRequired` — it already says `'cyber-warfare'`, which now correctly points to the era-12 tech.

`spy_operative.obsoletedByTech: 'cyber-warfare'` stays as-is — operatives being superseded by cyber hackers now happens at era 12 rather than era 5.

**Known balance consequence:** `spy_operative` is the top spy unit from era 4 through era 11 — eight eras. This is a significant plateau in spy unit progression. It is an accepted consequence of this change; Issue B addresses it by adding intermediate spy units and missions for eras 5–9.

### Tests

**`tests/systems/tech-system.test.ts`**
- Espionage track count: 26 → 25
- Military track count: stays 26 (era-12 `cyber-warfare` is military)
- Total: 369 → 368

**`tests/systems/tech-definitions.test.ts`**
- Same espionage and total count updates

**`tests/systems/era-12.test.ts`**
- `cyber-combat` → `cyber-warfare` in the test that checks `id === 'cyber-combat'`

**`tests/systems/tech-unlocks-consistency.test.ts`**
- Era-12 skip stays for `unlocksUnits` forward-check (covers `cyber_unit`, `stealth_bomber` not yet in TRAINABLE_UNITS)

**`tests/systems/espionage-system.test.ts` — update existing tests, add new ones**

*Update (lines ~282–285):* The existing test that asserts `digital-surveillance` unlocks `cyber_attack`, `misinformation_campaign`, `election_interference`, `satellite_surveillance` must be changed. After this change, `digital-surveillance` unlocks no missions. Assert that `getAvailableMissions(['digital-surveillance'])` does NOT include any of the four former Stage 5 missions.

*New tests in the `getAvailableMissions` describe block:*
```ts
it('cold-war-networks unlocks misinformation and election_interference', () => {
  const missions = getAvailableMissions(['cold-war-networks']);
  expect(missions).toContain('misinformation_campaign');
  expect(missions).toContain('election_interference');
  expect(missions).not.toContain('satellite_surveillance');
  expect(missions).not.toContain('cyber_attack');
});

it('satellite-surveillance tech unlocks satellite_surveillance mission', () => {
  const missions = getAvailableMissions(['satellite-surveillance']);
  expect(missions).toContain('satellite_surveillance');
  expect(missions).not.toContain('cyber_attack');
});

it('cyber-intelligence unlocks cyber_attack', () => {
  const missions = getAvailableMissions(['cyber-intelligence']);
  expect(missions).toContain('cyber_attack');
});

it('digital-surveillance alone unlocks no missions after stub retirement', () => {
  const missions = getAvailableMissions(['digital-surveillance']);
  expect(missions).not.toContain('cyber_attack');
  expect(missions).not.toContain('misinformation_campaign');
  expect(missions).not.toContain('election_interference');
  expect(missions).not.toContain('satellite_surveillance');
});
```

## Out of Scope (GitHub Issues)

**Issue A — Espionage building era rebalance:**
Both espionage buildings are gated by early-era techs that predate the era expansion. `intelligence-agency` (gated at era 2) and `security-bureau` (gated at era 4) are institution-level buildings that historically emerged in eras 8–10. This issue covers repositioning them with appropriate era gates, adjusted CI values, and updated fade triggers. Also: `spy_hacker` costs 110 production, which is trivially cheap at era-12 production rates — cost should be reviewed here.

**Issue B — Era-appropriate espionage missions and spy units for eras 5–9:**
After this change, researching espionage techs in eras 5–9 yields no new missions and no new spy units (`spy_operative` is the top unit from era 4 through era 11). This issue covers designing era-appropriate missions (industrial-era sabotage, telegraph interception, WWI signals work, Cold War HUMINT) and intermediate spy unit upgrades to fill the eight-era plateau.

## Invariants

- `digital-surveillance` stays at era 5; it gates only the intelligence-agency CI fade (+20 → +10), not any missions
- STAGE_1 through STAGE_4 mission gates are unchanged
- `cyber-warfare` (era 12, military track) gates no spy missions; all mission gates remain espionage-track
- `spy_hacker` remains gated by `cyber-warfare` (now correctly era 12)
- Total tech count after this change: **368** (339 − 1 stub + 30 era-12)
- Espionage track count: **25**; military track count: **26**
