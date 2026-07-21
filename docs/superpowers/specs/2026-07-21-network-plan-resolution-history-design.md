# NetworkPlan Resolution History Design

## Goal

Make Era 13 legendary-wonder NetworkPlan quests advance only from explicit, once-per-owner-turn resolution facts.

## Decision

`network-plan-system` will own a typed owner-turn resolver. It cleans invalid plans, identifies active constructive or Survey Grid plans that are actually resolving this owner turn, and returns immutable resolution facts. Recovery and Surge turns produce no Stable facts. The legendary-wonder history helper will only append supplied facts; it will no longer scan active plans.

## Verification

Tests prove ordinary active plans resolve once, invalid plans do not resolve, Surge and recovery do not resolve, and the history ledger preserves supplied owner/host facts without adding inferred records.
