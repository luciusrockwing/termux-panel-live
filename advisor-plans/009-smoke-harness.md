# Plan 009: Add a zero-dependency runtime smoke harness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 001d326..HEAD -- termux-panel.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: advisor-plans/001-commit-packaging.md (clean tree only)
- **Category**: tests
- **Planned at**: commit `001d326`, 2026-09-09

## Why this matters

This repo's only gate is `tsc --noEmit`: types check, behavior doesn't. Every
prior audit produced findings that typecheck cannot see (timeout-message
shape, headless `ctx` shape, array-line formatting) — each had to be argued
from reading. A smoke harness that runs the real extension code against mock
`termux-*` binaries turns those arguments into assertions, with no test
framework (prior review rejected frameworks; this uses only Node builtins, so
the zero-dependency virtue survives).

## Current state

- `termux-panel.ts` — default-exports a factory `(pi: ExtensionAPI) => void`
  registering 3 commands + 1 tool. Runtime imports are `node:child_process`
  - `node:util` only (plan 006 may add `node:fs` — check before writing the
  harness); the `ExtensionAPI` import is `import type` (erased at compile, so
  plain Node CAN import the file if run through a TS stripper — Node ≥22
  `--experimental-strip-types` handles erasable syntax, OR transpile via the
  vendored `typescript` module API without emitting files).
- `package.json` scripts: `{ "build": "tsc --noEmit" }` — add a `smoke` script here.
- Spawn surface: everything flows through `run()` → `execFileAsync(cmd, args,
  { timeout })` with bare command names (`termux-battery-status`, ...), so
  mock binaries on `PATH` fully control device behavior.
- Fake-pi shape needed: `{ registerCommand(name, {handler}), registerTool(tool) }`
  capturing into a dict; fake ctx: `{ mode: "tui", hasUI: true, ui: { select/input/confirm/notify } }`
  recording calls (mirror the `Ui` interface at `termux-panel.ts:90-98`).
- Prior rejection to honor: NO test framework (no vitest/jest/mocha, no new
  dependencies). `node:test` + `node:assert/strict` are Node builtins, not a
  framework — that distinction is the license for this plan. If the maintainer
  disagrees, this plan is the one to REJECT (see STOP).

## Commands you will need

| Purpose   | Command                  | Expected on success        |
|-----------|--------------------------|----------------------------|
| Typecheck | `npm run build`          | exit 0, zero output        |
| Smoke     | `npm run smoke`          | all tests pass, exit 0     |
| Node ver  | `node --version`         | v22+ (type-stripping)      |

## Scope

**In scope** (the only files you should CREATE or modify):

- CREATE `scripts/smoke.mjs` (harness: mock PATH, fake pi/ctx, `node:test` cases)
- CREATE `scripts/mock-bin/termux-battery-status`, `termux-location`, `termux-device-info` (tiny shell scripts with canned JSON; chmod +x)
- MODIFY `package.json` (add `"smoke"` script only)

**Out of scope** (do NOT touch, even though they look related):

- `termux-panel.ts` — harness tests current behavior; NEVER edit source to fit the harness.
- Any dependency, devDependency, lockfile, or framework install.
- Mocking SMS/photo/torch (side-effecting actions stay manual-only; mock the three read CLIs above and no others).

## Git workflow

- Branch: `advisor/009-smoke-harness` (or the operator's assigned branch).
- Commit message style: conventional commits, e.g. `test: add zero-dependency smoke harness` (see `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Prove the load path works

Scratch-probe OUTSIDE the repo (`/tmp`, never committed): import the factory
from the repo path with a fake `pi` and call it. Resolve ONE question: does
`node scripts/smoke.mjs` run the `.ts` directly (Node ≥22 type-stripping), or
must the harness transpile via `require('typescript').transpileModule` from
vendored `node_modules`? Pick whichever works; document the choice in a header
comment. `node --version` first — if <22 and transpile path also fails, STOP.

**Verify**: probe prints the 3 registered command names + `termux_read`.

### Step 2: Write the mocks

`scripts/mock-bin/` — three executable shell scripts printing canned JSON:

- `termux-battery-status` → `{"percentage": 77, "status": "discharging"}`
- `termux-location` → echo args to stderr (so tests can assert `-p gps` was
  passed), print `{"latitude": 1.0, "longitude": 2.0, "provider": "mock"}`
- `termux-device-info` → `{"model": "MockDevice", "android": "99"}`
`chmod +x` all three. Prepend to `PATH` inside the harness (`process.env.PATH =
"<abs>/scripts/mock-bin:" + process.env.PATH` — resolve abs from
`import.meta.dirname`, no hardcoding).

**Verify**: `PATH=scripts/mock-bin:$PATH termux-battery-status` → canned JSON.

### Step 3: Write the harness cases (`node:test` + `node:assert/strict`)

`scripts/smoke.mjs` cases (each independent, no shared mutable state):

1. `/battery` handler with recording ctx → `select` got title `"Battery"` +
   a `percentage: 77` line.
2. `termux_read.execute("x", { field: "battery" })` → text contains `77`,
   `terminate === false`, no `ctx.ui` touched (pass a ctx-less call — tool
   takes no ctx).
3. `termux_read.execute("x", { field: "location", provider: "gps" })` →
   mock saw `-p gps` (stderr capture or sentinel file in `os.tmpdir()`).
4. Unknown field → `invalid_field` details marker.
5. Timeout mapping (plan 003's predicate, if landed; else today's regex):
   synthesize `{ killed: true, signal: "SIGTERM", message: "Command failed" }`
   → assert `apiError`-equivalent classifies timeout. (Import `apiError`? It's
   module-private — re-implement the 3-line predicate in-test with a comment
   citing the line, OR skip with a TODO comment referencing plan 003. Prefer
   skip-with-pointer over duplication.)
6. Headless: `/battery` handler with `ctx = {}` → resolves, no throw
   (encodes plan 004's contract; if 004 hasn't landed this case FAILS — mark
   it `test(..., { skip: 'needs plan 004' })` rather than deleting).

**Verify**: `npm run smoke` → 6 pass (or 5 pass + 1 skip with reason).

### Step 4: Wire the script and run both gates

`package.json`: `"smoke": "node scripts/smoke.mjs"` (keep `build` first).
Run `npm run build` then `npm run smoke`, back to back, from a clean shell.

**Verify**: build exit 0 zero output; smoke exit 0, `pass` count matches case count.

## Test plan

The harness IS the test plan (Step 3 cases + Step 4 gates). Regression rule
for future plans: any behavior plan must add/adjust a case here following the
existing pattern (plans 003/004/006/008 already name their cases).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 with zero output
- [ ] `npm run smoke` exits 0; pass count == case count (skips named with reason)
- [ ] Zero new dependencies (`git status` shows no `package-lock.json`; `package.json` diff = one `smoke` line)
- [ ] Mock dir contains exactly the 3 read-CLI mocks, all executable
- [ ] `termux-panel.ts` unmodified by this plan (`git diff --name-only` lacks it)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Node <22 AND vendored-typescript transpile path fails (no load path — report versions).
- The maintainer's "no test framework" rejection is judged to cover `node:test`
  (operator call — the plan is written so REJECT is cheap: delete `scripts/` + the script line).
- Any case requires editing `termux-panel.ts` to pass (harness follows code, never leads).
- Mocks need to cover write actions (SMS/photo/torch) — explicitly out of scope.

## Maintenance notes

- Reviewer: confirm mocks print STABLE canned JSON (flaky mocks = flaky gate).
- When real device behavior differs from a mock, the mock is wrong — file a bug
  against the harness, not the extension.
- Future: CI would run `npm run build && npm run smoke` — no network needed
  (vendored tsc + builtins only), which preserves the offline virtue.
