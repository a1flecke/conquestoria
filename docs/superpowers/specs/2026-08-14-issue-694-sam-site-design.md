# Issue #694 SAM Site Design

**Date:** 2026-08-14
**Status:** Approved
**Parent:** GitHub issue #547, delivery 30 of 63

## Goal

Add a Surface-to-Air Missile (SAM) Site as a late-city air-defense choice without
duplicating combat rules or pre-implementing the Radar Station follow-up in #695.

## Player-facing behavior

SAM Site is a 195-production military building that protects friendly defenders within
two hexes with +12 defense against air attacks. It requires Radar Systems and Rocketry,
plus an Anti-Air Battery and a Radar Station in the same city. Its description spells out
"Surface-to-Air Missile (SAM)" on first use and states the exact radius and strength.

An Anti-Air Battery remains available to new cities after SAM Site is unlocked. When
multiple ground air-defense providers cover a defender, the canonical resolver uses the
single strongest provider in the existing `ground-air-defense` stacking group and marks
weaker known providers as superseded in its presentation facts.

## Architecture

The building definition supplies the existing typed `airDefenseProvider` contract; the
air-defense system, combat preview, history, and viewer-filtered overlay consume it
unchanged. Conjunctive technology and building gates use the current production
eligibility helper rather than an ID-specific check.

The building is catalog-driven, so it enters legal AI production candidates through the
normal building catalog. Its tests will verify that no difficulty changes its legality and
that AI does not gain information unavailable to its civilization.

## Scope boundary

This issue does not make Radar Station operational status activate, deactivate, or change
AA coverage, and it does not change overlay controls or caching. Those mechanics belong
to #695. #694 only establishes the SAM Site prerequisite and typed provider data that
#695 will consume.

## Tests and acceptance

Tests are written first and must cover the dual-tech and dual-building gate, normal
Anti-Air Battery availability in a new city, radius-two positive and radius-three
negative coverage, strongest-provider selection, viewer-safe facts/providers, and
catalog-driven AI eligibility. The smallest mirrored system tests run before broader
verification.
