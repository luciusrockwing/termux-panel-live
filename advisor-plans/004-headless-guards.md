# Plan 004: Guard all command paths against headless (no-UI) invocation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 001d326..HEAD -- termux-panel.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: advisor-plans/001-commit-packaging.md (clean tree only)
- **Category**: bug
- **Planned at**: commit `001d326`, 2026-09-09

## Why this matters

Only `/termux` checks for UI availability — and even that guard calls
`ctx.ui.notify`, which itself assumes `ctx.ui` exists. `/battery`, `/location`,
`withErrors`, and `showLines` touch `ctx.ui.*` unconditionally. If Pi ever
invokes a slash command in a headless context (no TUI, no `ctx.ui`), the user
gets a `TypeError: Cannot read properties of undefined` instead of a graceful
message. (`termux_read` exists precisely for headless reads, so commands must
fail soft, not crash.)

## Current state

- `termux-panel.ts:52-58` — `showLines` calls `ctx.ui.select` unguarded:

```ts
function showLines(ctx: any, title: string, lines: string[]): Promise<void> {
  const items = lines.length > 0 ? lines : ["(no output)"];
  const view = items.slice(0, CONFIG.maxLines);
  view.push("← Back");
  return ctx.ui.select(title, view);
}
```

- `termux-panel.ts:80-88` — `withErrors` calls `ctx.ui.notify` in the catch:

```ts
async function withErrors(ctx: any, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    ctx.ui.notify(apiError(e), "error");
  }
}
```

- `termux-panel.ts:242-251` — `openPanel` guard notifies via the very object it distrusts:

```ts
async function openPanel(ctx: any): Promise<void> {
  if (ctx.mode !== "tui" && !ctx.hasUI) {
    ctx.ui.notify("Panel needs interactive mode", "warning");
    return;
  }
```

- `termux-panel.ts:261-277` — `/battery` and `/location` handlers have NO
  headless guard at all (straight to `showBattery` / `showLines`).
- Convention: UI text and notify semantics must not change for the
  UI-present path (prior review defended current semantics — keep them).

## Commands you will need

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npm run build`   | exit 0, zero output |

## Scope

**In scope** (the only files you should modify):

- `termux-panel.ts` (UI guards only: one helper + call-site guards)

**Out of scope** (do NOT touch):

- `termux_read` tool — already headless-safe, leave alone.
- Error mapping (`apiError`), timeouts, SMS flow, dispatch Maps.
- Any UI-present behavior or message text.

## Git workflow

- Branch: `advisor/004-headless-guards` (or the operator's assigned branch).
- Commit message style: conventional commits, e.g. `fix: fail soft when commands run without UI` (see `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a UI-availability helper

Next to the `Ctx`/`Ui` interfaces (`termux-panel.ts:90-104`), add:

```ts
function uiAlive(ctx: any): boolean {
  return !!ctx?.ui && (ctx.mode === "tui" || !!ctx.hasUI);
}
```

Mirrors the existing `openPanel` condition, plus a null-guard on `ctx.ui`.

**Verify**: `npm run build` → exit 0, zero output.

### Step 2: Guard the three command handlers

- `openPanel`: replace the condition with `if (!uiAlive(ctx)) return;` —
  if `ctx.ui` exists but mode is non-interactive, keep today's notify
  (`ctx.ui.notify("Panel needs interactive mode", "warning")`); if `ctx.ui`
  itself is missing, return silently (nothing to notify through).
- `/battery` and `/location` handlers: `if (!uiAlive(ctx)) return;` as the
  first line (same silent-return rule when `ctx.ui` is missing).

**Verify**: `npm run build` → exit 0, zero output.

### Step 3: Harden `withErrors` and `showLines`

- `withErrors` catch: `ctx.ui?.notify?.(apiError(e), "error");` — optional
  chaining, so a UI-less throw never throws a second error while handling
  the first.
- `showLines`: `return ctx.ui.select(title, view);` →
  `if (!ctx?.ui) return; return ctx.ui.select(title, view);`

**Verify**: `npm run build` → exit 0, zero output.

### Step 4: Prove UI-present behavior unchanged

`git diff` review: every hunk must be a guard addition; no message string, no
branch, no dispatch logic altered. Simulate headless in Node (no device needed):
a stub `ctx = {}` passed through the factory's `/battery` handler must resolve
without throwing (import the built logic via a scratch script OUTSIDE the repo
tree, e.g. `/tmp`, so no stray files land in scope).

**Verify**: stub-ctx run resolves clean; `git status --short` shows only `M termux-panel.ts`.

## Test plan

No test framework in this repo (deliberate). Verification is the Step 4 stub
probe plus the build gate. If plan 009 (smoke harness) has already landed,
encode the stub-ctx case there following its pattern instead of the throwaway.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 with zero output
- [ ] Stub `ctx = {}` through `/battery` handler resolves without throwing
- [ ] UI-present paths byte-identical in behavior (diff = guards only)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Pi runtime guarantees `ctx.ui` always exists (then the premise is false —
  report the evidence, e.g. runtime docs or a runtime probe, and stop).
- A guard changes UI-present behavior (message text, menu flow, notify kind).
- The fix requires touching the agent tool, dispatch, or any out-of-scope file.

## Maintenance notes

- Reviewer: the silent-return-when-no-`ctx.ui` rule is deliberate (nowhere to
  send the message). If Pi later adds headless result channels, revisit.
- If `Ctx`/`Ui` interfaces are ever made exact (plan 005 direction), these
  guards become the `hasUI === false` branch — keep them.
