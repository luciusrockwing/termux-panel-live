# Plan 001: Standalone verification baseline for termux-panel-live

> **Executor instructions**: Follow step by step. Run every verification.
> STOP conditions apply — report, don't improvise. Update `plans/README.md`
> row 001 when done.
>
> **Drift check (run first, no git in repo)**: `sha1sum termux-panel.ts`
> must equal `7c19b7583e90550b37a38574d1ca7434d3567c2f` (current baseline supersedes c3fdb182). Else STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (adds files only; never edits `termux-panel.ts` in this plan)
- **Depends on**: none
- **Category**: tests/dx
- **Planned at**: no git repo, 2026-09-09

## Why this matters

`~/workspace/termux-panel-live/` holds one file with zero verification: type
errors surface only at Pi `/reload`. Every later fix plan needs a machine gate.
This plan adds the minimal scaffold so `npm run build` typechecks the file.
Grilled decision (Q1): baseline lands BEFORE fixes.

## Current state

- Folder contains only `termux-panel.ts` (~277 lines, verified 2026-09-09):
  `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"`,
  `node:child_process` + `node:util` runtime imports, default-export factory,
  `ctx: any` throughout (accepted tradeoff — real ctx types live in Pi runtime).
- `@earendil-works/pi-coding-agent` is NOT on npm under that exact name for
  standalone install (Pi resolves it at runtime via jiti). Do NOT depend on
  installing it — the fallback below is the expected path.
- `node`, `npm`, network: assumed present (Termux). `typescript`/`@types/node`
  are NOT in this folder (no node_modules here).
- Sibling folder `~/workspace/pi-termux-panel/` has `node_modules/typescript`
  but you must NOT couple to it (no cross-folder imports, no cross-folder
  tooling paths — the live folder stays self-contained).

## Commands you will need

| Purpose | Command (run in `~/workspace/termux-panel-live`) | Expected |
| --- | --- | --- |
| Typecheck | `npm run build` | exit 0, no output |
| Direct fallback | `node /data/data/com.termux/files/home/workspace/pi-termux-panel/node_modules/typescript/bin/tsc --noEmit` | exit 0 — FORBIDDEN as permanent solution (cross-folder coupling); use only to diagnose, never wire into scripts |

## Scope

**In scope** (create only): `package.json`, `tsconfig.json`, plus AT MOST one
`node-shim.d.ts` (only if the npm fallback fails — see Step 2).

**Out of scope** (do NOT touch): `termux-panel.ts` (byte-identical before/after
— verify sha1 at end), anything outside `~/workspace/termux-panel-live/`,
`npm install` of `@earendil-works/pi-coding-agent` (not installable; don't try).

## Steps

### Step 1: package.json + tsconfig.json

Create `package.json`:

```json
{
  "name": "termux-panel-live",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "build": "tsc --noEmit" }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["termux-panel.ts"]
}
```

**Verify**: files exist. → Step 2.

### Step 2: Types, npm-first with local fallback

Preferred: `npm i -D typescript @types/node` (needs network). Then `npm run build`.

- If exit 0 → done, skip fallback. (The `@earendil-works/pi-coding-agent`
  type import will still fail — that is EXPECTED here, not success. If the ONLY
  errors are `Cannot find module '@earendil-works/pi-coding-agent'`, proceed to
  the shim below regardless of npm success.)
- Add `src`-less local shim `pi-types.d.ts`:

```ts
declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    registerCommand(name: string, options: {
      description?: string;
      handler: (args: string, ctx: any) => void | Promise<void);
    }): void;
  }
}
```

Rationale (grilled Q4-adjacent): type-only import is erased at compile; jiti
resolves the real package at Pi runtime. The shim exists solely so `tsc`
is self-contained offline.

**Verify**: `npm run build` → exit 0, no output. If npm has no network AND no
local `tsc` binary exists, STOP (report; do not borrow sibling folders).

### Step 3: Gates + index

Run all done criteria. Row 001 → DONE (or BLOCKED + reason).

## Done criteria

- [ ] `npm run build` exits 0 with zero output in `~/workspace/termux-panel-live`
- [ ] `sha1sum termux-panel.ts` = `7c19b7583e90550b37a38574d1ca7434d3567c2f` (supersedes c3fdb182)
- [ ] `ls` folder = `termux-panel.ts package.json tsconfig.json pi-types.d.ts plans/` (+ node_modules if npm worked — acceptable)
- [ ] `plans/README.md` row 001 = DONE

## STOP conditions

- Drift-check sha1 mismatch (source moved under us).
- `npm run build` fails twice (incl. shim path); network dead AND no tsc.
- Any step needs a file outside `~/workspace/termux-panel-live/` (sibling-folder
  coupling is forbidden).

## Maintenance notes

- `ctx: any` is intentional (real ctx types unavailable offline). Do not
  "fix" by expanding the shim speculatively — extend only when tsc demands it.
- jiti (Pi's loader) is the real compiler; tsc here is an approximation gate.
