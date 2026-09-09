# Plan 007: Refresh stale docs (AGENTS.md, tech-stack, README baseline)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 001d326..HEAD -- AGENTS.md specs/tech-architecture/tech-stack.md README.md termux-panel.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: advisor-plans/001-commit-packaging.md, advisor-plans/003-timeout-mapping.md, advisor-plans/004-headless-guards.md, advisor-plans/005-tool-shim-typing.md, advisor-plans/006-carried-p2s.md (docs must describe final code)
- **Category**: docs
- **Planned at**: commit `001d326`, 2026-09-09

## Why this matters

Three docs are actively wrong: `AGENTS.md` claims "No git repo" (the project
has `.git` plus a public GitHub remote) and "~230 lines" (the file is 324 and
growing), and `specs/tech-architecture/tech-stack.md` documents three commands
while omitting the `termux_read` agent tool entirely. Stale docs are worse
than missing ones — executors follow them into wrong assumptions (editing
without git, ignoring the tool surface).

## Current state

- `AGENTS.md:14`: "`termux-panel.ts` — entire extension (~230 lines). Factory
  default-export, `ctx: any` throughout" — actual: 324 lines (`wc -l`), plus
  typed `Ctx`/`Ui` interfaces and casts alongside `ctx: any` handlers.
- `AGENTS.md:52` (Constraints): "No git repo. Drift via sha1 quoted in plans.
  Verify before edit" — actual: git repo with `main` (protected) +
  `publish/v0.1`, remote
  `https://github.com/luciusrockwing/termux-panel-live.git`.
- `AGENTS.md` Commands section: "`sha1sum termux-panel.ts` # drift check, no
  git in repo" — the "no git in repo" tail is false.
- `specs/tech-architecture/tech-stack.md`, Architecture section: "Entry
  points: Three registered commands (`pi.registerCommand`): `/termux` →
  `openPanel` ..., `/battery`, `/location` (network provider only)." — no
  mention of `termux_read` (`termux-panel.ts:281-323`, headless-safe,
  reads-only, fields battery|location).
- `README.md` baseline line: "Baseline sha1 of `termux-panel.ts`:
  `7c19b7583e90550b37a38574d1ca7434d3567c2f`" — must be recomputed AFTER
  plans 003–006 land (code changes move the hash).
- Convention: `plans/README.md` is the status source of truth; `advisor-plans/`
  holds these specs (do NOT write into `plans/`).

## Commands you will need

| Purpose   | Command                     | Expected on success  |
|-----------|-----------------------------|----------------------|
| Typecheck | `npm run build`             | exit 0, zero output  |
| Hash      | `sha1sum termux-panel.ts`   | new baseline value   |
| Lines     | `wc -l termux-panel.ts`     | current line count   |

## Scope

**In scope** (the only files you should modify):

- `AGENTS.md` (Structure line, Commands drift-check line, Deploy registered-cmds line, Constraints git line)
- `specs/tech-architecture/tech-stack.md` (Entry points + Data flow: add tool)
- `README.md` (baseline sha1 line only — recompute, don't reword)

**Out of scope** (do NOT touch):

- `termux-panel.ts`, `pi-types.d.ts`, `package.json` — no code changes.
- `plans/` directory — different system, leave alone.
- Rewording docs beyond the stale claims (minimal diff).

## Git workflow

- Branch: `advisor/007-refresh-docs` (or the operator's assigned branch).
- Commit message style: conventional commits, e.g. `docs: refresh stale repo claims and tool surface` (see `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix AGENTS.md Structure + Commands lines

- Line ~14: `~230 lines` → actual `wc -l` value (e.g. `~320 lines`);
  `ctx: any` throughout → `ctx: any` at handler boundaries, typed
  `Ctx`/`Ui` internals (match reality after plans 004–005).
- Commands drift-check line: drop the `, no git in repo` tail.
- Deploy registered-cmds line: append the agent tool
  (``termux_read`(battery|location, headless-safe, reads-only)`).

**Verify**: `grep -n "No git repo\|230 lines\|no git in repo" AGENTS.md` → no matches.

### Step 2: Fix Constraints git claim

Replace "No git repo. Drift via sha1 quoted in plans. Verify before edit"
with the truth: git repo present, `main` push-protected (work on branches,
operator opens PRs); sha1 drift check still stands. Keep it to two lines max.

**Verify**: `grep -n "No git repo" AGENTS.md` → no matches; `npm run build` → exit 0.

### Step 3: Document the tool in tech-stack.md

In Entry points, add: ``termux_read`agent tool (`registerTool`):
fields`battery`|`location`, providers network|gps|passive, headless-safe (no
`ctx.ui`), reads-only — see`termux-panel.ts` `execute`." One short paragraph
in Data flow noting tool →`batteryText`/`locationText` → text result (mirrors
the README mermaid diagram, prose only).

**Verify**: `grep -c "termux_read" specs/tech-architecture/tech-stack.md` → ≥2.

### Step 4: Recompute the README baseline sha1

Run `sha1sum termux-panel.ts`, replace the hash in the README "Baseline sha1"
line with the new value. Nothing else in README changes.

**Verify**: `sha1sum termux-panel.ts` output matches the README line exactly.

## Test plan

Docs-only: verification is the grep/hash checks above plus `npm run build`
(untouched code must stay green). Read the final diff in full — every hunk
must trace to a stale claim listed here.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "No git repo\|230 lines\|no git in repo" AGENTS.md` → no matches
- [ ] `grep -c "termux_read" specs/tech-architecture/tech-stack.md` → ≥2
- [ ] README baseline hash equals `sha1sum termux-panel.ts`
- [ ] `npm run build` exits 0 with zero output
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plans 003–006 have not landed (their SHAs/hashes are inputs — docs would
  describe code that doesn't exist yet).
- The live code contradicts the "Current state" excerpts (drift — reconcile first).
- A doc fix requires changing code to match (never bend code to docs; report it).

## Maintenance notes

- Reviewer: the `~320 lines` figure rots on every edit — acceptable (tilde);
  the sha1 baseline is the precise instrument.
- The `plans/001` + `plans/003` absolute `/data/data/...` paths were normalized
  at publish time; if any resurface, that's a separate hygiene issue, not this plan.
