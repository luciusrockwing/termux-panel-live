# Plan 002: Esc-back, showLines output, safeParse (grilled fixes 1–3)

> **Executor instructions**: Follow step by step. Run every verification.
> STOP conditions apply — report, don't improvise. Update `plans/README.md`
> row 002 when done.
>
> **Drift check (run first)**: plan 001 row = DONE AND `npm run build`
> exits 0 in `~/workspace/termux-panel-live` AND `sha1sum termux-panel.ts`
> still `c3fdb1826fc5119894497b6aab66e45a27e635eb`... UNLESS 001 already
> recorded a new baseline hash in plans/README.md — then that hash governs.
> (001 touches only scaffold, but re-verify anyway.)

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (one file, three small hunks, full build gate)
- **Depends on**: 001 (must be DONE — its `npm run build` is every step's gate)
- **Category**: bug
- **Planned at**: no git repo, 2026-09-09

## Why this matters

Three grilled, user-confirmed behavior fixes: (1) Esc on Torch/Location
submenus currently FIRES the action (`??` treats cancel as choice) — Esc must
go back; (2) `/battery` + `/location` spam 5–8 stacked notifies — must render
one scrollable `showLines` dialog like every panel action; (3) 6× bare
`JSON.parse` on external CLI output — must degrade to a raw-text line, never a
cryptic SyntaxError. Grilled decisions: Esc-back (not exit-all), showLines
(not joined notify), local guard (file stays single-file installable), SMS
validation dropped (confirm dialog is the control — NOT in this plan).

## Current state (exact excerpts, `termux-panel.ts`)

- Esc-default pair 1 (~line 99): `const prov = (await ctx.ui.select("Provider", ["network", "gps", "passive"])) ?? "network";`
- Esc-default pair 2 (~line 115): `const how = (await ctx.ui.select("Torch", ["toggle", "on", "off"])) ?? "toggle";`
- Battery cmd (~170): `(await batteryLines()).forEach((l) => ctx.ui.notify(l, "info"));`
- Location cmd (~184): `fmtJson(JSON.parse(out)).forEach((l) => ctx.ui.notify(l, "info"));`
- Bare parses: `batteryLines` (`JSON.parse(out)`), Device Overview
  (`JSON.parse(o)`), Location submenu (`JSON.parse(out)`), System Info
  (`JSON.parse(out)`), WiFi (`JSON.parse(out)`), location cmd (`JSON.parse(out)`).
- Helpers present: `run`, `fmtJson(obj)`, `showLines(ctx, title, lines)`,
  `apiError(e)`, `batteryLines()`. Menu loop `for(;;)` with `if (!pick) return;`
  (main-menu Esc exits — KEEP).

## Scope

**In scope**: `termux-panel.ts` (three hunks below), `plans/README.md` row.

**Out of scope**: `package.json`/`tsconfig.json`/`pi-types.d.ts` (001's, working —
don't touch), SMS validation (dropped by grill), shortcut registration
(`ctrl+shift+t` belongs to rpiv-todo — never re-add), `ctx.ui.custom()` rewrite,
anything outside `~/workspace/termux-panel-live/`.

## Steps

### Step 1: Esc = back (finding 1)

Replace:
```ts
const prov = (await ctx.ui.select("Provider", ["network", "gps", "passive"])) ?? "network";
```
with:
```ts
const prov = await ctx.ui.select("Provider", ["network", "gps", "passive"]);
if (!prov) break;
```
Replace:
```ts
const how = (await ctx.ui.select("Torch", ["toggle", "on", "off"])) ?? "toggle";
```
with:
```ts
const how = await ctx.ui.select("Torch", ["toggle", "on", "off"]);
if (!how) break;
```
(`break` exits the `switch`, loop re-shows main menu = "back". Main-menu
`if (!pick) return;` stays — Esc there still exits. No other `??` defaults on
`select()` results may remain — check Notification Title/Content `?? "Pi"` /
`?? ""`: those are `input()` results, and empty-input-cancel is already guarded
by truthiness checks around them — LEAVE.)

**Verify**: `npm run build` → exit 0; `grep -n '?? "network"\|?? "toggle"' termux-panel.ts` → no output.

### Step 2: showLines for /battery + /location (finding 2)

Battery handler body →:
```ts
await showLines(ctx, "Battery", await batteryLines());
```
Location handler body →:
```ts
const out = await run("termux-location", ["-p", "network"]);
const data = safeParseJSON<Record<string, unknown>>(out);
await showLines(ctx, "Location", data ? fmtJson(data) : [out]);
```
(`safeParseJSON` lands in Step 3 — build stays red until then; that's expected,
finish Step 3 before judging.)

**Verify** (after Step 3): `grep -n "forEach((l) => ctx.ui.notify" termux-panel.ts` → no output.

### Step 3: Local safeParse guard (finding 3)

Add after `fmtJson`:
```ts
function safeParseJSON<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
```
Convert all 6 `JSON.parse` sites to `safeParseJSON` with raw-text fallback
`[out]`/`[o]` (same shape as Step 2's location example; overview's
`.slice(0, 12)` applies to the `fmtJson` branch). Keep it local — NO imports
from sibling folders (grilled: single-file install is the core virtue).

**Verify**: `npm run build` → exit 0; `grep -c "JSON.parse" termux-panel.ts` → `1`
(the one inside `safeParseJSON` itself).

### Step 4: Gates + index

Run all done criteria. Row 002 → DONE (or BLOCKED + reason).

## Test plan

No test infra (001 deliberately scoped to typecheck). Verification = build +
grep gates + operator smoke: copy file to `~/.pi/agent/extensions/` under a
TEMP name? NO — same-command collision. Operator smoke runs against a review
copy only after explicit cutover decision (out of this plan). Executor does NOT
touch the live extension dir.

## Done criteria

- [ ] `npm run build` exits 0, zero output
- [ ] `grep -n '?? "network"\|?? "toggle"' termux-panel.ts` → no output
- [ ] `grep -n "forEach((l) => ctx.ui.notify" termux-panel.ts` → no output
- [ ] `grep -c "JSON.parse" termux-panel.ts` → `1`
- [ ] `grep -c "registerCommand(\"" termux-panel.ts` → `3` (no commands added/removed)
- [ ] `grep -n "registerShortcut" termux-panel.ts` → no output (no shortcut re-added)
- [ ] `plans/README.md` row 002 = DONE
- [ ] No files created/modified outside `~/workspace/termux-panel-live/termux-panel.ts` + `plans/README.md`

## STOP conditions

- 001 not DONE or its build gate red.
- `termux-panel.ts` sha1 differs from 001's recorded baseline (someone edited it).
- Build fails twice after reasonable fix.
- Any step needs an out-of-scope file.

## Maintenance notes

- If Pi's `select()` Esc semantics ever change (returns sentinel instead of
  `undefined`), the `if (!prov) break` guards still hold for any falsy value.
- `showLines` caps at 50 lines — fine for all current actions; revisit if an
  action ever dumps more (sensor list).
- Still deferred: orphaned `services/` in sibling repo, `types/pi.ts` shim
  parity, SMS inbox/contacts (D2), `ctx.ui.custom()` panel (D3).
