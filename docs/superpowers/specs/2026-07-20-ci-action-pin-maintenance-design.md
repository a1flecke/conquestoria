# CI Action Pin Maintenance Design

## Goal

Clear the workflow scanner's false blocking findings while retaining immutable, verified GitHub Action pins.

## Decision

Keep the existing `actions/checkout` SHA because it is the official, signed `v4.3.1` release. Correct every adjacent version comment to `v4.3.1`, and update the pinned zizmor action and its scanner version to their current reviewed releases. No workflow permissions, triggers, credentials, or job behavior change.

## Verification

The workflow source must contain the exact current pins and exact version comments. The GitHub Actions security-analysis job is the final authoritative scanner run.
