# S3 — Marketplace Tech-Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter the marketplace panel to show only tech-known resources, gate the fashion banner on viewer tech, fix the fashion banner's name display, and add a discoverable-count footer for hidden resources.

**Architecture:** All changes are in `src/ui/marketplace-panel.ts`. At panel entry, compute `viewerTechs` (Set of completed tech IDs) and `knownDefs` (RESOURCE_DEFINITIONS filtered to those the viewer can see). Drive all row rendering, the Your-Resources summary, and the setText injection loop off `knownDefs`. Fashion banner uses `fashionableDef` + `fashionVisible` guard. Footer uses `unknownCount`.

**Tech Stack:** TypeScript, jsdom (vitest). `RESOURCE_DEFINITIONS` and `getCivAvailableResources` are already imported in the panel.

---

## File map

| File | Change |
|---|---|
| `src/ui/marketplace-panel.ts` | Core implementation — all changes |
| `tests/ui/marketplace-panel.test.ts` | 7 new tests + 2 existing tests updated to reflect new behavior |

No new files. No new exports.

---

### Task 1: Write failing tests for core row filtering

**Files:**
- Modify: `tests/ui/marketplace-panel.test.ts`

These two tests will fail immediately because the panel currently shows all 16 rows regardless of tech.

- [ ] **Step 1: Add two tests inside the existing `describe('createMarketplacePanel', ...)` block, after the last existing test (line 233)**

```ts
it('hides all resource rows when viewer has no techs', () => {
  const state = buildState({ currentPlayer: 'p1', civTechs: [] });
  createMarketplacePanel(container, state, { onClose: vi.fn() });
  const text = document.getElementById('marketplace-panel')?.textContent ?? '';
  const allNames = [
    'Silk', 'Wine', 'Spices', 'Gems', 'Ivory', 'Incense',
    'Gold', 'Silver', 'Furs', 'Sheep',
    'Copper', 'Iron', 'Horses', 'Stone', 'Cattle', 'Salt',
  ];
  for (const name of allNames) {
    expect(text).not.toContain(name);
  }
});

it('shows tech-known resource and hides tech-unknown resource', () => {
  // 'mining-tech' unlocks gems + silver; 'irrigation' (not researched) unlocks silk
  const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech'] });
  createMarketplacePanel(container, state, { onClose: vi.fn() });
  const text = document.getElementById('marketplace-panel')?.textContent ?? '';
  expect(text).toContain('Gems');
  expect(text).not.toContain('Silk');
});
```

- [ ] **Step 2: Run to confirm both new tests fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: `hides all resource rows` and `shows tech-known resource` FAIL. All pre-existing tests still PASS.

---

### Task 2: Implement core row filtering

**Files:**
- Modify: `src/ui/marketplace-panel.ts`

- [ ] **Step 1: Add `viewerTechs`, `knownDefs`, `unknownCount` after the `ownedResources` line, and update the luxury/strategic owned filters to use `knownDefs`**

Find and replace this block (lines 24-32):

```ts
  const ownedResources = getCivAvailableResources(state, state.currentPlayer);

  // Build "Your Resources" summary
  const luxuryOwned = RESOURCE_DEFINITIONS
    .filter(d => d.type === 'luxury' && ownedResources.has(d.id as ResourceType))
    .map(d => d.name);
  const strategicOwned = RESOURCE_DEFINITIONS
    .filter(d => d.type === 'strategic' && ownedResources.has(d.id as ResourceType))
    .map(d => d.name);
```

Replace with:

```ts
  const ownedResources = getCivAvailableResources(state, state.currentPlayer);

  const civ = state.civilizations[state.currentPlayer];
  const viewerTechs  = new Set(civ?.techState.completed ?? []);
  const knownDefs    = RESOURCE_DEFINITIONS.filter(d => viewerTechs.has(d.tech));
  const unknownCount = RESOURCE_DEFINITIONS.length - knownDefs.length;

  // Build "Your Resources" summary — filter against knownDefs for self-documentation
  // (ownedResources already requires tech; result is identical, intent is explicit)
  const luxuryOwned = knownDefs
    .filter(d => d.type === 'luxury' && ownedResources.has(d.id as ResourceType))
    .map(d => d.name);
  const strategicOwned = knownDefs
    .filter(d => d.type === 'strategic' && ownedResources.has(d.id as ResourceType))
    .map(d => d.name);
```

- [ ] **Step 2: Change the row builder to iterate `knownDefs`**

Find:
```ts
  // Build resource row placeholders
  const resourceRowsHtml = RESOURCE_DEFINITIONS.map((def, idx) => {
```

Replace with:
```ts
  // Build resource row placeholders — knownDefs only (tech-gated)
  // NOTE: Both this builder and the setText loop below are index-coupled on knownDefs;
  // they must iterate the same array in the same order. Tests catch any desync.
  const resourceRowsHtml = knownDefs.map((def, idx) => {
```

- [ ] **Step 3: Change the setText loop to iterate `knownDefs`**

Find:
```ts
  RESOURCE_DEFINITIONS.forEach((def, idx) => {
```

Replace with:
```ts
  knownDefs.forEach((def, idx) => {
```

- [ ] **Step 4: Run the two new tests — expect both to pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: `hides all resource rows` and `shows tech-known resource` PASS. All pre-existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/marketplace-panel.ts tests/ui/marketplace-panel.test.ts
git commit -m "feat(marketplace): S3 — filter rows to tech-known resources only"
```

---

### Task 3: Update existing tests that assert old behavior, add new label/empty-state tests

**Files:**
- Modify: `tests/ui/marketplace-panel.test.ts`

Two existing tests describe behavior we are deliberately changing. Update them to assert the new behavior first — this makes them fail and creates the TDD gate for Task 4.

- [ ] **Step 1: Update the existing `shows ✗ Not available badge` test (line 106) to assert the new label**

Find the test:
```ts
  it('shows ✗ Not available badge when player has tech but no improvement', () => {
```

Change its assertion at the end from:
```ts
    expect(panel?.textContent).toContain('✗ Not available');
```

To:
```ts
    expect(panel?.textContent).toContain('✗ Not in inventory');
    expect(panel?.textContent).not.toContain('✗ Not available');
```

- [ ] **Step 2: Update the existing `Your Resources empty state mentions tech and improvements` test (line 188)**

Find the test:
```ts
  it('Your Resources empty state mentions tech and improvements', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: [] });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    const text = panel?.textContent ?? '';
    expect(text).toContain('Your Resources');
    expect(text).toMatch(/tech|research/i);
    expect(text).toMatch(/improvement/i);
  });
```

Replace entirely with:
```ts
  it('Your Resources empty state shows "None" when no resources are owned', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: [] });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    const text = panel?.textContent ?? '';
    expect(text).toContain('Your Resources');
    expect(text).toContain('None');
    expect(text).not.toContain('research techs');
    expect(text).not.toContain('build improvements');
  });
```

- [ ] **Step 3: Add a new test confirming "None" still shown when viewer has a tech but owns nothing**

Append after the updated test above (still inside the describe block):
```ts
  it('Your Resources shows "None" when viewer has tech but no resources acquired', () => {
    // Has mining-tech so gems/silver rows are visible, but no mine built
    const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech'] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const panel = document.getElementById('marketplace-panel');
    expect(panel?.textContent).toContain('Your Resources');
    expect(panel?.textContent).toContain('None');
  });
```

- [ ] **Step 4: Run to confirm the updated and new tests now fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: `shows ✗ Not available badge` and `Your Resources empty state shows "None"` and `Your Resources shows "None" when viewer has tech` FAIL. The other existing tests still PASS.

---

### Task 4: Implement label change and empty-state change

**Files:**
- Modify: `src/ui/marketplace-panel.ts`

- [ ] **Step 1: Change the status badge label in the `setText` loop**

Find:
```ts
    setText(`res-owned-${idx}`, isOwned ? '✓ Owned' : '✗ Not available');
```

Replace with:
```ts
    setText(`res-owned-${idx}`, isOwned ? '✓ Owned' : '✗ Not in inventory');
```

- [ ] **Step 2: Change the "Your Resources" empty-state text**

Find:
```ts
    if (emptyEl) emptyEl.textContent = 'None yet — research techs and build improvements to harvest resources.';
```

Replace with:
```ts
    if (emptyEl) emptyEl.textContent = 'None';
```

- [ ] **Step 3: Run — expect all three Task 3 tests to now pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/marketplace-panel.ts tests/ui/marketplace-panel.test.ts
git commit -m "feat(marketplace): S3 — update status label and Your Resources empty state"
```

---

### Task 5: Write failing tests for fashion banner tech-gate and name fix

**Files:**
- Modify: `tests/ui/marketplace-panel.test.ts`

- [ ] **Step 1: Add two tests inside the describe block**

```ts
  it('suppresses fashion banner when fashionable resource tech is unknown to viewer', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: [] }); // no irrigation → silk unknown
    // Mutate the marketplace stub directly
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionable = 'silk';
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionTurnsLeft = 5;

    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    // The word "fashionable" only appears in the banner
    expect(text).not.toContain('fashionable');
  });

  it('shows fashion banner with display name (not raw id) when tech is known', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ['irrigation'] }); // irrigation → silk known
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionable = 'silk';
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionTurnsLeft = 5;

    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).toContain('fashionable');
    expect(text).toContain('Silk');   // display name
    expect(text).not.toContain('silk is fashionable'); // raw id not injected
  });
```

- [ ] **Step 2: Run to confirm both fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: `suppresses fashion banner` and `shows fashion banner with display name` FAIL. All other tests PASS.

---

### Task 6: Implement fashion banner tech-gate and name fix

**Files:**
- Modify: `src/ui/marketplace-panel.ts`

- [ ] **Step 1: Replace the `fashionBannerHtml` block**

Find (the existing fashion banner block after the `yourResourcesHtml` assignment):
```ts
  // Build structural HTML with only safe hardcoded strings; dynamic data goes in data-text placeholders
  const fashionBannerHtml = marketplace.fashionable
    ? `<div style="background:#4a3520;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#e8c170;">✨ <span data-text="fashion-resource"></span> is fashionable! (<span data-text="fashion-turns"></span> turns left) — prices doubled</div>`
    : '';
```

Replace with:
```ts
  // Fashion banner — only show if the fashionable resource's tech is known to the viewer
  const fashionableDef  = RESOURCE_DEFINITIONS.find(d => d.id === marketplace.fashionable);
  const fashionVisible  = !!fashionableDef && viewerTechs.has(fashionableDef.tech);
  const fashionBannerHtml = fashionVisible
    ? `<div style="background:#4a3520;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#e8c170;">✨ <span data-text="fashion-resource"></span> is fashionable! (<span data-text="fashion-turns"></span> turns left) — prices doubled</div>`
    : '';
```

- [ ] **Step 2: Replace the fashion `setText` block**

Find:
```ts
  if (marketplace.fashionable) {
    setText('fashion-resource', marketplace.fashionable);
    setText('fashion-turns', String(marketplace.fashionTurnsLeft));
  }
```

Replace with:
```ts
  if (fashionVisible && fashionableDef) {
    setText('fashion-resource', fashionableDef.name);  // display name, not raw id
    setText('fashion-turns', String(marketplace.fashionTurnsLeft));
  }
```

- [ ] **Step 3: Run — expect both Task 5 tests to now pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/marketplace-panel.ts tests/ui/marketplace-panel.test.ts
git commit -m "feat(marketplace): S3 — gate fashion banner on viewer tech; show name not raw id"
```

---

### Task 7: Write tests for discoverable footer and catalog completeness

**Files:**
- Modify: `tests/ui/marketplace-panel.test.ts`

The unique techs needed to unlock all 16 resources are:
`irrigation` (silk), `pottery` (wine, salt), `cartography` (spices), `mining-tech` (gems, silver), `foraging` (ivory, furs), `currency` (incense, gold), `animal-husbandry` (sheep, horses), `stone-weapons` (copper), `bronze-working` (iron), `gathering` (stone), `domestication` (cattle).

- [ ] **Step 1: Add three tests inside the describe block**

```ts
  it('shows discoverable footer when viewer is missing some resource techs', () => {
    // mining-tech unlocks gems + silver (2 of 16); 14 remain hidden
    const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech'] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).toContain('more resources');
    expect(text).toContain('research');
  });

  it('omits discoverable footer when viewer has all 16 enabling techs', () => {
    const allTechs = [
      'irrigation', 'pottery', 'cartography', 'mining-tech', 'foraging',
      'currency', 'animal-husbandry', 'stone-weapons', 'bronze-working',
      'gathering', 'domestication',
    ];
    const state = buildState({ currentPlayer: 'p1', civTechs: allTechs });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).not.toContain('more resources');
  });

  it('shows all 16 resource names when viewer has all enabling techs (catalog completeness)', () => {
    const allTechs = [
      'irrigation', 'pottery', 'cartography', 'mining-tech', 'foraging',
      'currency', 'animal-husbandry', 'stone-weapons', 'bronze-working',
      'gathering', 'domestication',
    ];
    const state = buildState({ currentPlayer: 'p1', civTechs: allTechs });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    const allNames = [
      'Silk', 'Wine', 'Spices', 'Gems', 'Ivory', 'Incense',
      'Gold', 'Silver', 'Furs', 'Sheep',
      'Copper', 'Iron', 'Horses', 'Stone', 'Cattle', 'Salt',
    ];
    for (const name of allNames) {
      expect(text).toContain(name);
    }
  });
```

- [ ] **Step 2: Run to see which fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: `shows discoverable footer` FAIL (footer not yet rendered); `omits discoverable footer` and `catalog completeness` should PASS (row filtering from Task 2 already handles them). If catalog completeness fails, investigate before proceeding.

---

### Task 8: Implement discoverable footer, run full suite, final commit

**Files:**
- Modify: `src/ui/marketplace-panel.ts`

- [ ] **Step 1: Add the footer placeholder to the `panel.innerHTML` template**

Find the `panel.innerHTML` template. Inside it, between the closing `</div>` of the resource rows flex container and `${tradeRoutesHtml}`, add the footer placeholder:

```ts
  panel.innerHTML = `
    <div style="max-width:500px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="margin:0;font-size:18px;color:#e8c170;">Marketplace</h2>
        <span id="mp-close" style="cursor:pointer;font-size:22px;opacity:0.6;">✕</span>
      </div>
      ${fashionBannerHtml}
      ${yourResourcesHtml}
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${resourceRowsHtml}
      </div>
      ${unknownCount > 0 ? '<div style="font-size:12px;opacity:0.5;text-align:center;margin-top:8px;" data-text="discoverable-footer"></div>' : ''}
      ${tradeRoutesHtml}
    </div>
  `;
```

- [ ] **Step 2: Add the footer `setText` call after the "Your Resources" population block**

After the closing `}` of the Your-Resources `else` block (after the `bodyEl.appendChild(strLine)` section), add:

```ts
  // Discoverable-count footer
  if (unknownCount > 0) {
    setText('discoverable-footer', `🔬 ${unknownCount} more resources will become visible as you research new technologies`);
  }
```

- [ ] **Step 3: Run marketplace panel tests — expect all to pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: all tests PASS including the newly green `shows discoverable footer` test.

- [ ] **Step 4: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: all tests PASS. If any failures, investigate before proceeding — do not continue to Step 5.

- [ ] **Step 5: Run the production build (runs `tsc` — the only type-check path)**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 6: Final commit**

```bash
git add src/ui/marketplace-panel.ts tests/ui/marketplace-panel.test.ts
git commit -m "feat(marketplace): S3 — add discoverable-count footer for tech-hidden resources"
```

---

## Self-review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Only tech-known resources appear as rows | Tasks 1-2 |
| Tech-unknown resources absent; count in footer | Tasks 1-2 (absent) + 7-8 (footer) |
| "✓ Owned" for inventory; "✗ Not in inventory" for tech-known unowned | Tasks 3-4 |
| Fashion banner suppressed when fashionable resource tech unknown | Tasks 5-6 |
| Fashion banner shows resource name, not raw ID | Tasks 5-6 |
| "Your Resources" empty state reads "None" | Tasks 3-4 |
| Footer present when `unknownCount > 0`; absent when `unknownCount === 0` | Tasks 7-8 |
| `state.currentPlayer` throughout | `civ = state.civilizations[state.currentPlayer]` in Task 2; no hardcoded IDs added |
| `yarn build` + `yarn test` exit 0 | Task 8 steps 4-5 |

All 7 spec tests covered. Two additional footer tests added (not in spec, implied by "done when").

### Existing tests that are intentionally updated

| Test | Why updated |
|---|---|
| `shows ✗ Not available badge` (line 106) | Label changes from "Not available" to "Not in inventory" |
| `Your Resources empty state mentions tech and improvements` (line 188) | Empty state changes from advice text to "None" |

Both updated in Task 3 before implementation in Task 4 — proper TDD update cycle.

### Type consistency

- `viewerTechs: Set<string>` — introduced Task 2, used Task 2 (filter), Task 6 (fashion gate)
- `knownDefs: ResourceDefinition[]` — introduced Task 2, used Task 2 (row builder + setText loop), Task 2 (luxury/strategic filter)
- `unknownCount: number` — introduced Task 2, used Task 8 (footer condition + setText)
- `fashionableDef: ResourceDefinition | undefined` — introduced Task 6 Step 1, used Task 6 Step 2
- `fashionVisible: boolean` — introduced Task 6 Step 1, used Task 6 Step 1 (banner) + Step 2 (setText guard)

All consistent across tasks. ✓
