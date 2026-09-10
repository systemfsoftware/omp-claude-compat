---
title: Extracted workspace must re-own the parent task graph or CI enumerates a weaker gate
date: 2026-09-10
category: build-errors
module: omp-claude-compat
problem_type: build_error
component: tooling
symptoms:
  - "CI re-runs workspace scripts via pnpm -r with no task graph, no task cache, and no single named gate"
  - "turbo query packageGraph has no runner; root typecheck:node is absent from Packages in scope"
  - "boundaries reports cannot import package because it is not a dependency for a lint-config import that only resolved via hoisting"
root_cause: incomplete_setup
resolution_type: tooling_addition
severity: high
related_components:
  - infrastructure
  - development_workflow
tags: [turbo, monorepo-extraction, ci-gate, task-graph, incomplete-setup]
---

# Extracted workspace must re-own the parent task graph or CI enumerates a weaker gate

## Problem

A package extract copies member scripts. It does not copy the parent workspace's task runner, so CI falls back to enumerating `pnpm -r` steps. That enumeration can exit 0 while the parent graph would have run a different order, a root-only program, or a cached miss. Local `pnpm build` and GitHub CI then disagree about what "the gate" is.

## Symptoms

- Merge-blocking workflow lists format, typecheck, build, lint, test, mutation as separate steps instead of one named script.
- `turbo query` is not a valid command until the runner is a workspace dependency.
- `turbo run typecheck:node --dry=json` lists no `//#typecheck:node` when the root program is declared as a package-shaped task.

## What Didn't Work

- Copying parent `dependsOn: ["^build", "build"]` onto `lint`. `turbo run lint --dry=json` then waits on this package's own `build`; oxlint reads source, not `dist`. False serialization, not a missing compile.
- Declaring `typecheck:node` without the `//#` prefix. Turbo's default package scope excludes the root; the dry-run `Packages in scope` line names only the plugin. The root `tsc -p tsconfig.node.json --noEmit` never runs.

## Solution

Re-own the parent runner inside the extract:

1. Add the turbo dependency and a task graph whose task names match scripts that exist (`build`, `typecheck`, `lint`, `test`, `mutation`, `attw`, `clean`).
2. Name one script `check:ci` that is the only merge-blocking command after install. It runs format, then `gate:tasks` (`lint`, `typecheck`, `typecheck:node`, `test` with `--continue`), then `gate:dist` (`build`), then `mutation`, folding each failure into `s` and `exit $s`.
3. Declare the root node program as `//#typecheck:node`. Gate: `turbo run typecheck:node --dry=json` emits `//#typecheck:node`.
4. `lint.dependsOn` is `^build` only. Gate: `turbo run lint --dry=json` task ids are exactly `#lint`.
5. Declare every import in the package lint config as a package `devDependency`. Gate: `turbo query '{ boundaries { length } }'` returns `length: 0`.

CI restores the local turbo cache directory and runs `pnpm check:ci`. It does not re-list the inner steps.

## Why This Works

Failure mode: $\text{CI steps} \neq \text{local scripts} \neq \text{declared graph}$. Each side can be green while another is red. The extract looks complete because member scripts still exist.

Invariant — **Single declared gate:**

$$\text{merge block} = \text{check:ci} = \text{local gate}$$

No workflow step after install may name a task `check:ci` already runs. A root-only program is a `//#` task or it is not in the graph.

Anti-pattern: a workflow `run:` line that is also a root script other than `check:ci` (except install, cache restore, and toolchain PATH).

## Prevention

- Extraction done-check: `pnpm check:ci` is the CI Gate step; `turbo query '{ packages { length } }'` is non-zero.
- Root programs: `turbo run <root-task> --dry=json` includes `//#<root-task>`.
- Boundaries: `turbo query '{ boundaries { length } }'` is 0.
- Lint wait: `turbo run lint --dry=json` does not list this package's `#build` unless oxlint consumes `dist`.

## Related Issues

- docs/solutions/build-errors/standalone-extraction-build-gates.md — same extract class (file closure vs obligation closure); this doc is the task-graph obligation that extract still missed after those four gates went green.
