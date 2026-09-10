---
title: Standalone release must re-own GitHub Release creation, changelog staging, and downstream asserts
date: 2026-09-10
category: integration-issues
module: omp-claude-compat
problem_type: integration_issue
component: tooling
symptoms:
  - "npm publish and the git tag succeed but no GitHub Release object is ever created"
  - "the consumed changeset intent persists on main while no generated changelogs exist anywhere"
  - "version and publish jobs assert nothing about release notes, so the gap passes silently"
root_cause: incomplete_setup
resolution_type: workflow_improvement
severity: medium
related_components:
  - infrastructure
  - development_workflow
tags: [release, changesets, pnpm, github-actions, github-release, ci, standalone-repo, monorepo-extraction]
---

# Standalone release must re-own GitHub Release creation, changelog staging, and downstream asserts

## Problem

Pushing a changeset to main produced an npm publish and a git tag but no GitHub Release object. The extraction from the monorepo dropped the release-creation step, and the release flow staged generated release notes so poorly that main never even held them.

## Symptoms

- The release ran green: registry version up, tag pushed, no Release page, no notes, no latest-pointer promotion.
- The consumed intent file persists on main (the version command records consumption in a ledger rather than deleting intents) while zero generated changelogs exist anywhere downstream.
- Neither the versioning phase nor the publishing phase checks that release notes were produced, so the degraded state is indistinguishable from success.

## What Didn't Work

There was no hypothesis space to probe — the failure was a silent regression, settled by reproducing the version command in a scratch workspace. That probe established the generated-file sequence (intent retained, ledger written, one changelog per versioned package) and made the fix mechanical rather than guessed.

## Solution

Four changes, each owning one broken link:

1. **Terminal release-creation step.** The publish phase now ends with a GitHub Releases step that consumes the previously captured release set. Creation is fail-closed: any missing or empty changelog aborts with an annotated error before any Release is posted. Existing releases are skipped by tag lookup with conflict-tolerant create, and exactly one created release is promoted to latest afterwards; any other transport failure is a hard error.
2. **Full-surface staging in the release-PR step.** Staging now covers the version command's whole output surface instead of tracked modifications only, so freshly generated changelogs and the ledger enter the release branch and reach main on merge.
3. **Assert gates in both phases.** A capture-plus-assert pair runs in the versioning phase (fail the release PR before it opens) and again in the publishing phase (fail before build/publish/tag), so dropped notes break the workflow instead of degrading into a tag with no Release.
4. **Runtime provisioning for the versioning phase.** Its new steps invoke the Deno toolchain the other phases already provision; without it the very first version run fails on a missing binary.

## Why This Works

Root-cause chain: the port preserved the plan/version/publish skeleton but dropped the creation step, demoting the terminal action to a tag push — and a tag is not a release. Independently, update-only staging is blind to generated files, so even a present creator would have found no notes on main. No assert covered either gap.

Architectural invariants:

- **Terminal-action completeness.** A release pipeline's terminal phase must produce every consumer-visible artifact (registry version, tag, Release object with notes and latest promotion). If the last step only moves a ref, the pipeline ships half a release by construction.
- **Generated-output capture.** Let $G$ be the generator's output set and $S$ the staged set. Update-only staging stages $\{f : \text{tracked}(f)\}$; generated files start untracked, so $S \cap G = \varnothing$ always. Completeness requires the staging predicate to cover $G$, not just tracked modifications.
- **Assert at consumption.** Each phase asserts the artifacts it consumes before acting on them. A producer/consumer handoff (captured set, changelog files) with no consumer-side check converts every upstream drop into a silent downstream degradation.

## Prevention

Port checklist for any future monorepo-to-standalone extraction of a release pipeline:

- Diff workflow phases step by step against the source before calling the port complete — a dropped terminal step is invisible when the surrounding skeleton survives verbatim.
- Reproduce the version command in a scratch workspace and inspect what it generates versus what the staging step picks up; update-only staging silently drops generated files.
- Assert generated artifacts where the next phase consumes them, so a missing file fails the workflow instead of degrading the release.

## Related Issues

- Bare edge: docs/solutions/build-errors/standalone-extraction-build-gates.md — same extraction-dropped-obligation cause class, disjoint domain (build gates vs release pipeline). Precedence: neither supersedes; a future consolidation pass may group both under a shared monorepo-extraction obligations umbrella.
