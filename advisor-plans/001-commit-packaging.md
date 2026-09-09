# Plan 001: Commit the uncommitted packaging changes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 001d326..HEAD -- package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (this lands first; every other plan needs a clean tree)
- **Category**: dx
- **Planned at**: commit `001d326`, 2026-09-09

## Why this matters

npm 1.0.0 was published from a dirty worktree: the packaging edits
(`private` removed, `pi-package` keyword, `pi` manifest, `files` allowlist)
were never committed. GitHub `main@001d326` therefore cannot reproduce the
published tarball. Until this lands, no source checkout builds the published
package, and every other plan starts on a dirty tree.

## Current state

- `package.json` — package manifest; uncommitted worktree modifications only
  (27 insertions, 2 deletions per `git diff --stat` at plan time):

```json
{
  "name": "termux-panel-live",
  "version": "1.0.0",
  "description": "Termux device panel extension for Pi",
  "type": "module",
  "main": "termux-panel.ts",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/luciusrockwing/termux-panel-live.git"
  },
  "license": "MIT",
  "scripts": {
    "build": "tsc --noEmit"
  },
  "files": [
    "termux-panel.ts",
    "pi-types.d.ts",
    "README.md",
    "plans/",
    "specs/"
  ],
  "keywords": [
    "pi-package",
    "pi-extension",
    "termux"
  ],
  "pi": {
    "extensions": [
      "./termux-panel.ts"
    ]
  }
}
```

- Repo conventions: conventional commits (`feat:`, `fix:`, `chore:` — see
  `git log --oneline`: `001d326 feat(extension): ...`,
  `b745e99 feat: init termux-panel-live`). `main` is push-protected; prior
  publishes went through branch `publish/v0.1`.
- Verification gate for this repo: `npm run build` → exit 0, zero output.

## Commands you will need

| Purpose   | Command           | Expected on success        |
|-----------|-------------------|----------------------------|
| Typecheck | `npm run build`   | exit 0, zero output        |
| Status    | `git status --short` | only `M package.json`   |
| Diff      | `git diff -- package.json` | packaging fields only |

## Scope

**In scope** (the only files you should modify):

- `package.json` (commit only — content is already correct; do not re-edit)

**Out of scope** (do NOT touch):

- `termux-panel.ts`, `pi-types.d.ts`, `README.md`, `plans/`, `specs/` — unrelated to this plan.
- Do NOT push and do NOT open a PR — the operator handles the protected-`main` path.

## Git workflow

- Check current branch first (prior sessions left a detached HEAD). If detached,
  create `advisor/001-commit-packaging` from `001d326`.
- One commit, message style: `chore(release): commit npm packaging manifest` —
  matches the conventional-commit history in `git log`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the worktree diff is packaging-only

Run `git status --short` → expect exactly `M package.json` and nothing else.
Run `git diff -- package.json` → expect only: `private` removed, plus
`description`, `repository`, `license`, `files`, `keywords`, `pi` manifest.
No changes to code, docs, or anything else.

**Verify**: `git status --short` → single line `M package.json`

### Step 2: Typecheck

Run `npm run build`.

**Verify**: exit 0, zero output.

### Step 3: Commit

Stage and commit only `package.json`:
`git add package.json && git commit -m "chore(release): commit npm packaging manifest"`.

**Verify**: `git status --short` → empty; `git log --oneline -1` → your new commit on top of `001d326`.

## Test plan

No test framework exists in this repo (deliberate — rejected in prior review).
Verification is the build gate (Step 2) plus `npm pack --dry-run` →
tarball lists 9 files, no `node_modules`, no `.pi`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 with zero output
- [ ] `git status --short` is empty (clean tree)
- [ ] `git log --oneline -1` shows the new `chore(release)` commit on top of `001d326`
- [ ] No files outside the in-scope list are modified
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `git rev-parse --short HEAD` is not `001d326` and the diff does not match the
  "Current state" excerpt (codebase drifted since planning).
- The worktree contains modifications beyond `package.json` (another task is
  mid-flight — do not sweep its files into your commit).
- The commit appears to require touching an out-of-scope file.
- You are asked to push to `main` (push-protected; operator's call).

## Maintenance notes

- After this lands, tag/release discipline is still undefined (npm 1.0.0 has no
  corresponding git tag). A follow-up should decide: tag `v1.0.0` retroactively
  or leave it.
- Reviewer: confirm the committed `package.json` byte-matches what `npm pack`
  published (compare `npm view termux-panel-live dist.tarball` manifest).
