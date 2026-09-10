---
title: Standalone extraction must re-own four monorepo-silent build obligations
date: 2026-09-09
category: build-errors
module: omp-claude-compat
problem_type: build_error
component: tooling
symptoms:
  - "pnpm install exits ERR_PNPM_IGNORED_BUILDS over undeclared transitive build scripts (msgpackr-extract, onnxruntime-node, protobufjs, sharp)"
  - "tsdown warns Module not found and treats vendored workspace members as external, so dist ships bare imports of never-published packages"
  - "oxlint fails with Failed to load config: Cannot find package @systemfsoftware/oxlint-config — auto-discovered nested configs carried by vendored members import the monorepo-private strict preset"
  - "type-aware oxlint fails with Failed to find tsgolint executable when the strict preset is inlined standalone"
root_cause: incomplete_setup
resolution_type: config_change
severity: high
related_components:
  - infrastructure
  - development_workflow
tags: [pnpm, tsdown, oxlint, standalone-repo, monorepo-extraction, workspace-vendoring, build-gates, pnpm-workspace]
---

# Standalone extraction must re-own four monorepo-silent build obligations

## Problem

Extracting `@systemfsoftware/omp-claude-compat` verbatim from the systemfsoftware monorepo into a standalone repo failed four build/lint gates that the monorepo's shared tooling had silently satisfied. The transplanted tree was file-faithful and gate-broken.

## Symptoms

1. `pnpm install` exits `ERR_PNPM_IGNORED_BUILDS` on undeclared transitive build scripts (`msgpackr-extract`, `onnxruntime-node`, `protobufjs`, `sharp`).
2. The bundler's `deps.alwaysBundle` warns `Module not found, treating it as an external dependency` for the vendored members (`@systemfsoftware/harness-toml`, `@systemfsoftware/omp-runtime`); emitted `dist` chunks carry bare imports of packages that will never be published.
3. oxlint fails with `Failed to load config: ... Cannot find package @systemfsoftware/oxlint-config` — oxlint auto-discovers nested lint configs, and the configs carried inside the vendored members import the monorepo-private strict preset.
4. Type-aware oxlint fails with `Failed to find tsgolint executable` — the inlined strict config names a type-aware backend the repo never declares.

## What Didn't Work

- Treating the four failures as independent. Fixing the install manifests alone still left the bundle shipping bare private imports: `dist` became self-consistent only after dependency-build ordering was owned, not after install went green.
- Keeping the vendored members' configs byte-identical to upstream. Their nested lint configs were correct in the monorepo and break lint standalone — fidelity to the source tree was itself the defect.

## Solution

Four explicit ownership moves:

1. The workspace manifest declares the transitive build-script decision with explicit `allowBuilds` entries set to `false` (one per ignored script). Note: pnpm appends a scaffold `allowBuilds` block to the manifest when it first errors — delete the duplicated key, or the YAML parse fails next run.
2. The root package's `build` script chains the vendored members' builds before the root bundle (`pnpm --filter <member-a> --filter <member-b> run build && rimraf dist && tsdown`), reproducing the monorepo's turbo dependency ordering. With member `dist` present, the bundler's `alwaysBundle` list resolves and inlines them instead of externalizing.
3. Deleted the vendored members' nested lint configs. The root strict config lints the whole tree; members are typechecked, not separately linted.
4. Declared `oxlint-tsgolint` as an explicit devDependency — the type-aware lint backend the monorepo had supplied transitively through its private oxlint-config.

## Why This Works

The failure mode is general: **a verbatim transplant copies the closure of files but not the closure of obligations.** The monorepo's shared tooling owned four obligations invisibly — dependency-build ordering before the consumer bundle, build-script allowances for transitive deps, a workspace-wide lint-config resolution scope, and transitive provisioning of the lint backend. A standalone repo has no such owner, so each obligation must be re-declared inside the repo or its gate fails.

The invariant that prevents the whole defect class: **every obligation a workspace's shared infrastructure satisfies on a package's behalf must be re-declared inside the extracted repo before the extraction is called complete.** Equivalently: the repo's gate set must be derivable from the repo's own declarations alone — no gate may pass because some outer harness would have run, resolved, or provisioned it.

## Prevention

When extracting a package from a monorepo workspace, audit for these four obligation classes before declaring done — each with its observable gate:

- **Build-script allowances** — gate: a pristine `pnpm install --frozen-lockfile` passes with no `ERR_PNPM_IGNORED_BUILDS`.
- **Dependency-build ordering for bundled workspace deps** — gate: a fresh-clone build, then scan `dist` for bare imports of any package outside the published dependency graph; none may remain.
- **Lint-config discovery scope** — gate: the lint run passes with no `Failed to load config` from carried configs; exactly one lint config governs the tree.
- **Lint backend binaries** — gate: the type-aware lint run passes with no `Failed to find tsgolint executable`.

## Related Issues

- None — first document in this repo's solutions corpus (2026-09-09).
