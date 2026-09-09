# Plan 008: Accept an optional provider argument in /location

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 001d326..HEAD -- termux-panel.ts README.md AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: advisor-plans/001-commit-packaging.md (clean tree only)
- **Category**: direction
- **Planned at**: commit `001d326`, 2026-09-09

## Why this matters

Surface asymmetry, grounded in the repo itself: the `/termux` panel's Location
action offers three providers (network/gps/passive) via menu, and the
`termux_read` tool accepts a provider parameter — but the `/location` slash
command hardcodes `network`. Users who know they want GPS must open the panel
instead of typing `/location gps`. One optional argument closes the gap; the
default keeps today's behavior byte-identical.

## Current state

- `termux-panel.ts` location action (`~lines 140-150`) — provider via menu:

```ts
    run: async (ctx) => {
      const prov = await ctx.ui.select("Provider", ["network", "gps", "passive"]);
      if (!prov) return;
      const lines = await locationText(prov, prov === "gps" ? CONFIG.gpsTimeoutMs : CONFIG.timeoutMs);
      await showLines(ctx, `Location (${prov})`, lines);
    },
```

- `/location` handler (`~lines 270-277`) — hardcoded:

```ts
  pi.registerCommand("location", {
    description: "Show current location (network provider)",
    handler: async (_args, ctx) => {
      await withErrors(ctx, async () => {
        const lines = await locationText("network");
        await showLines(ctx, "Location", lines);
      });
    },
  });
```

  (`_args: string` is available and currently ignored — the underscore prefix
  is the only thing to change.)

- `locationText(prov, timeoutMs)` already implements provider + GPS-timeout
  selection (`termux-panel.ts:101-103`) — reuse it, do not duplicate.
- `termux_read` allowlist pattern to mirror:
  `["network", "gps", "passive"].includes(...)` with fallback `"network"`.
- Conventions: slash handlers stay thin; errors via `withErrors`; GPS timeout
  via `CONFIG.gpsTimeoutMs` (plan 003 may refine mapping — don't touch it).

## Commands you will need

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npm run build`   | exit 0, zero output |

## Scope

**In scope** (the only files you should modify):

- `termux-panel.ts` (`/location` handler only)
- `README.md` (slash-commands table row for `/location` only)
- `AGENTS.md` (registered-cmds line only, if it names the provider)

**Out of scope** (do NOT touch):

- Panel Location action, `termux_read`, `locationText`, timeouts, error mapping.
- `/battery`, `/termux`, dispatch, guards.

## Git workflow

- Branch: `advisor/008-location-provider-arg` (or the operator's assigned branch).
- Commit message style: conventional commits, e.g. `feat: /location accepts optional provider argument` (see `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Parse and validate the optional argument

In the `/location` handler, rename `_args` → `args`, then:

```ts
const prov = ["network", "gps", "passive"].includes(args.trim()) ? args.trim() : "network";
const lines = await locationText(prov, prov === "gps" ? CONFIG.gpsTimeoutMs : CONFIG.timeoutMs);
await showLines(ctx, `Location (${prov})`, lines);
```

Rules: empty/whitespace/unknown → today's behavior (`network`, title
`Location (network)` — note the title now always carries the provider, which
is the one visible change on the default path). GPS → `CONFIG.gpsTimeoutMs`,
mirroring the panel action exactly.

**Verify**: `npm run build` → exit 0, zero output.

### Step 2: Update the two doc rows

- `README.md` slash table: ``/location`` row → "Show location (provider arg:
  `network` default, `gps`, `passive`; e.g. `/location gps`)".
- `AGENTS.md` registered-cmds line: same one-phrase addition if it mentions
  `(network provider)`.

**Verify**: `grep -n "location gps\|provider arg" README.md AGENTS.md` → matches in both (or README only, if AGENTS.md line lacks provider detail — then leave AGENTS.md alone and note why).

## Test plan

No test framework in this repo (deliberate). Verification:

- Build gate per step.
- Logic probe (no device): extract the one-line allowlist expression into a
  scratch Node one-liner OUTSIDE the repo (`/tmp`) over
  `["", "  ", "gps", "passive", "network", "GLONASS", "GPS"]` → expect
  `network, network, gps, passive, network, network, network` (case-sensitive:
  `GPS` falls back — intended, document in probe output).
- If plan 009 (smoke harness) has landed, encode these cases there following
  its pattern.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 with zero output
- [ ] Probe maps the 7 sample inputs to the expected providers
- [ ] Bare `/location` output identical to today except the title gains `(network)`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `handler: async (_args, ctx)` signature differs from "Current state" (drift).
- Pi splits slash args differently (e.g. passes only first token — verify
  against one live `/location gps` run if possible; on doubt, report).
- Case-insensitivity or provider aliases are requested — explicitly out of
  scope (report as follow-up, don't gold-plate).

## Maintenance notes

- Reviewer: the default-path title change (`Location` → `Location (network)`)
  is intentional (consistency with the panel action's `Location (${prov})`).
- If more commands grow args later, factor a `parseProvider` helper — not
  before (one call site today).
