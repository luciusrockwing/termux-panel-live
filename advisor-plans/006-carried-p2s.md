# Plan 006: Clear the carried P2s (array formatting, photo guard, single dispatch Map)

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

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: advisor-plans/001-commit-packaging.md (clean tree only)
- **Category**: tech-debt
- **Planned at**: commit `001d326`, 2026-09-09

## Why this matters

Three small warts survived every prior review as deferred P2s: JSON arrays
render as `0: val` index-prefixed lines, the photo action never confirms the
capture landed (missing storage permission looks like success), and two Maps
(`labelToId` + `actionById`) encode one lookup with a sync hazard. Each is
minutes to fix; together they remove the last known-deferred items from the
audit trail. Functionality stays identical for every happy path.

## Current state

- `termux-panel.ts:37-44` — `fmtJson` stringifies nested values but arrays fall
  through to indexed entries:

```ts
function fmtJson(obj: unknown): string[] {
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
    );
  }
  return [String(obj)];
}
```

  (`Object.entries` on an array yields `0: val`, `1: val` lines.)

- `termux-panel.ts:196-203` — photo action, no post-capture check:

```ts
    run: async (ctx) => {
      const p = `${CONFIG.photoDir}/termux_${Date.now()}.jpg`;
      await run("termux-camera-photo", ["-c", CONFIG.cameraId, p]);
      ctx.ui.notify(`Saved: ${p}`, "info");
    },
```

- `termux-panel.ts:234-235` — double Map:

```ts
const labelToId = new Map(ACTIONS.map((a) => [a.label, a.id]));
const actionById = new Map(ACTIONS.map((a) => [a.id, a]));
```

  consumed in `openPanel` (`termux-panel.ts:253-260`): label → id → action.

- Conventions: menu-line format `key: value` (`AGENTS.md`); photo path fixed
  (no traversal — `Date.now()` only); dispatch stays O(1) Map-based (prior
  review locked this in — do NOT regress to `ACTIONS.find`).

## Commands you will need

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npm run build`   | exit 0, zero output |

## Scope

**In scope** (the only files you should modify):

- `termux-panel.ts` (the three sites above only)

**Out of scope** (do NOT touch):

- `termux_read` envelope, SMS flow, error mapping, timeouts, guards (plans 003/004).
- Menu labels, emojis, command set — display text unchanged except array lines.
- New runtime dependencies (use `node:fs` builtin only, if needed at all).

## Git workflow

- Branch: `advisor/006-carried-p2s` (or the operator's assigned branch).
- Commit message style: conventional commits, e.g. `fix: array lines, photo verify, single dispatch map` (see `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Render arrays as plain element lines

In `fmtJson`, handle arrays before the object branch:

```ts
if (Array.isArray(obj)) return obj.map((el) => (el && typeof el === "object" ? JSON.stringify(el) : String(el)));
```

Objects keep today's `key: value` shape (nested → `JSON.stringify`, unchanged).
Scalars keep `[String(obj)]`.

**Verify**: `npm run build` → exit 0, zero output.

### Step 2: Verify the photo landed before claiming success

After the `termux-camera-photo` call, check existence with the `node:fs`
builtin (`existsSync`) and notify accordingly:

- exists → today's `Saved: ${p}` info notify (unchanged text);
- missing → `ctx.ui.notify("Capture failed (storage permission? run termux-setup-storage)", "error")` instead.
Add `import { existsSync } from "node:fs";` at the top with the other imports.
Do NOT add dependencies; do NOT change the path scheme.

**Verify**: `npm run build` → exit 0, zero output.

### Step 3: Collapse the double Map into one

Replace the two Maps with:

```ts
const actionByLabel = new Map(ACTIONS.map((a) => [a.label, a]));
```

and in `openPanel` replace the label→id→action chain with a single
`actionByLabel.get(pick)` lookup (`if (!act) continue;` preserved — the loop
must not exit on an unknown pick).

**Verify**: `npm run build` → exit 0, zero output; `grep -n "labelToId\|actionById" termux-panel.ts` → no matches; menu loop still `continue`s (no `return`) on unknown pick.

## Test plan

No test framework in this repo (deliberate). Verification per step is the
build gate plus:

- `grep -n "0: \|labelToId\|actionById" termux-panel.ts` → only legitimate hits (none expected).
- If plan 009 (smoke harness) has landed, add an array-format case following its pattern.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 with zero output
- [ ] `grep -n "labelToId\|actionById" termux-panel.ts` → no matches
- [ ] Object-line format unchanged (`key: value`, nested JSON) — diff review
- [ ] Photo success text unchanged; failure path notifies error
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `node:fs` import breaks the Pi jiti load model (verify build only covers tsc;
  if there is evidence jiti restricts imports, stop and report it).
- Any happy-path output changes beyond array lines (menu text, key format).
- The single-Map refactor alters dispatch order or duplicates labels (labels must stay unique — assert by inspection of `ACTIONS`).

## Maintenance notes

- Reviewer: the array-line change alters `termux_read` output for array payloads
  too (shared `fmtJson`) — confirm that's desired (it is: same wart, same fix).
- `existsSync` is a TOCTOU-tolerant existence check, not a guarantee — good
  enough for a camera-save hint; don't upgrade to stat/watchers.
