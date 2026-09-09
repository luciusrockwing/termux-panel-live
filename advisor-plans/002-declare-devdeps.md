# Plan 002: Declare the vendored toolchain as devDependencies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 001d326..HEAD -- package.json node_modules`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: advisor-plans/001-commit-packaging.md (needs a clean tree; both touch `package.json`)
- **Category**: dx
- **Planned at**: commit `001d326`, 2026-09-09

## Why this matters

The build works only on machines that already have the vendored
`node_modules/` (tsc + `@types/node`). That directory is gitignored and
`package.json` declares zero `devDependencies`, so `git clone` → `npm install`
→ `npm run build` fails with `tsc: command not found`. Every new contributor
and every CI checkout hits this. Declaring pinned devDependencies makes the
toolchain reproducible without changing the offline-friendly vendored setup.

## Current state

- `package.json` — scripts: `{ "build": "tsc --noEmit" }`; NO
  `devDependencies` key at all (full file quoted in plan 001).
- `node_modules/` — vendored, gitignored (`.gitignore`: `node_modules/`,
  `.pi/`). Contains `typescript` + `@types/node` (per `AGENTS.md`).
- `tsconfig.json` — `types: ["node"]`, `include: [termux-panel.ts, pi-types.d.ts]`.
- Convention: single-file deploy virtue — `node_modules/` must never ship
  (already excluded via the `files` allowlist in `package.json`).

## Commands you will need

| Purpose   | Command                                  | Expected on success          |
|-----------|------------------------------------------|------------------------------|
| Typecheck | `npm run build`                          | exit 0, zero output          |
| Versions  | `node -p "require('./node_modules/typescript/package.json').version"` | a version string |
| Versions  | `node -p "require('./node_modules/@types/node/package.json').version"` | a version string |
| List      | `npm ls typescript @types/node --depth=0` | shows both as extraneous/dev |

## Scope

**In scope** (the only files you should modify):

- `package.json` (add `devDependencies` only)

**Out of scope** (do NOT touch, even though they look related):

- `node_modules/` — vendored dir stays as-is; do NOT delete, reinstall, or
  `npm install` (environment may be offline; network ops are out of scope).
- `termux-panel.ts`, `pi-types.d.ts`, `tsconfig.json` — no code/config changes.
- `package-lock.json` — do NOT create one (no network install runs here).

## Git workflow

- Branch: `advisor/002-dev-dependencies` (or the operator's current working branch if one is already assigned).
- Commit message style: conventional commits, e.g. `chore(deps): declare vendored toolchain as devDependencies` (see `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the vendored versions

Run the two `node -p require(...)` commands above. Record the exact versions
(e.g. `5.x.y`, `2x.y.z`).

**Verify**: both commands print a version string, no error.

### Step 2: Add pinned devDependencies

Edit `package.json`, adding (exact pins from Step 1, `=` semantics via plain
version string):

```json
"devDependencies": {
  "typescript": "<vendored version>",
  "@types/node": "<vendored version>"
}
```

Keep key order tidy (after `scripts` is fine). Touch nothing else.

**Verify**: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` → parses; `npm run build` → exit 0, zero output.

### Step 3: Confirm nothing else changed

**Verify**: `git status --short` → only `M package.json`; `git diff` shows only the added `devDependencies` block.

## Test plan

No test framework in this repo (deliberate). Verification:

- `npm run build` → exit 0, zero output (the repo's sole gate).
- `npm ls typescript @types/node --depth=0` → both listed (validates the
  declaration resolves against the vendored tree).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 with zero output
- [ ] `package.json` contains `devDependencies` with `typescript` and `@types/node` pinned to the vendored versions
- [ ] `git status` shows only `M package.json`
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The vendored `node_modules/` lacks `typescript` or `@types/node` (assumption false — toolchain layout differs from recon).
- `package.json` already contains `devDependencies` with different content (plan 001 or another task changed it — reconcile, don't overwrite blindly).
- Any step requires network access (`npm install`, registry fetch) — out of scope; report instead.

## Maintenance notes

- Future toolchain bumps = update vendored dir AND these pins together; a
  reviewer should check they match (`npm ls` must be clean, not `extraneous`).
- If CI is ever added, `npm ci` will use these pins — that is the point.
- Follow-up deferred: `package-lock.json` (needs one networked `npm install` to generate; explicitly out of this plan).
