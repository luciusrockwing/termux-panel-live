# Plan 003: Vendor offline toolchain (tsc + @types/node via local copy)

> **Executor instructions**: Follow step by step. Run every verification.
> STOP conditions apply — report, don't improvise. Update `plans/README.md`
> rows 003 (and 001 per Done criteria) when done.
>
> **Drift check (run first)**: `sha1sum termux-panel.ts` =
> `c3fdb1826fc5119894497b6aab66e45a27e635eb` AND `npm run build` currently
> fails with `tsc: not found`. If build already passes, STOP (already fixed).

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (adds vendored dirs only; no source edits)
- **Depends on**: none (unblocks 001/002)
- **Category**: dx
- **Planned at**: no git repo, 2026-09-09

## Why this matters

001's scaffold is correct but its core gate is red: no network for `npm i`,
so no local `tsc` and `npm run build` fails in-folder. The previous executor
borrowed the sibling folder's binary — explicitly forbidden as a permanent
path. This plan vendors the two needed packages by filesystem copy (no network,
no registry), making the folder self-contained and the gate reproducible in
any shell.

## Current state

- `~/workspace/termux-panel-live/`: `termux-panel.ts` (sha1 `c3fdb182…`),
  `package.json` (`build: tsc --noEmit`), `tsconfig.json` (`types: ["node"]`,
  `noEmit`), `pi-types.d.ts`. No `node_modules/`.
- Donor (READ-ONLY — copy FROM, never modify):
  `~/workspace/pi-termux-panel/node_modules/typescript/` (TS 5.x) and
  `~/workspace/pi-termux-panel/node_modules/@types/node/` (v20+). Confirm both
  exist before copying.
- `npm run build` resolves `./node_modules/.bin/tsc` automatically — no script
  changes needed once vendored.

## Scope

**In scope**: `cp` of the two donor dirs into
`~/workspace/termux-panel-live/node_modules/`, `plans/README.md` rows.

**Out of scope**: `termux-panel.ts` (must stay byte-identical), `package.json`
/ `tsconfig.json` / `pi-types.d.ts` (working — don't touch), donor folder
(read-only), `npm install`/`npm i` (no network — do NOT run), anything outside
the live folder.

## Steps

### Step 1: Vendor the toolchain

```bash
cd ~/workspace/termux-panel-live
mkdir -p node_modules/@types
cp -r /data/data/com.termux/files/home/workspace/pi-termux-panel/node_modules/typescript node_modules/typescript
cp -r /data/data/com.termux/files/home/workspace/pi-termux-panel/node_modules/@types/node node_modules/@types/node
ls node_modules/typescript/bin/tsc node_modules/@types/node/package.json
```

**Verify**: both listed paths exist. → Step 2.

### Step 2: Reproducible gate

```bash
cd ~/workspace/termux-panel-live
npm run build; echo EXIT:$?
```

**Verify**: exit 0, zero output. (npm's `run` puts
`node_modules/.bin` on PATH — no global tsc needed. If the shell lacks
`/usr/bin/env` for the `.bin/tsc` shim and npm still fails, STOP and report —
do not fall back to cross-folder binaries.)

### Step 3: Index

Flip row 003 → DONE and row 001 → DONE (its gate now holds; append
`+ vendored toolchain (003)` to 001's status cell... status cells must stay
machine-simple: set 001 Status to `DONE`, rationale lives here).

## Done criteria

- [ ] `npm run build` exits 0, zero output, in-folder, twice in a row
- [ ] `sha1sum termux-panel.ts` = `c3fdb1826fc5119894497b6aab66e45a27e635eb`
- [ ] `grep -rn "pi-termux-panel" package.json tsconfig.json pi-types.d.ts` → no output (no cross-folder coupling)
- [ ] Rows 001 + 003 = DONE
- [ ] 002 row still TODO (dispatch next)

## STOP conditions

- Donor dirs missing (report versions found instead).
- `npm run build` fails twice (report full output).
- Any step needs an out-of-scope file.

## Maintenance notes

- Vendored `typescript`/`@types/node` are frozen copies — note versions in the
  completion report; refresh deliberately (delete + re-copy), never `npm update`
  (no network assumed).
- `node_modules/` is intentionally committed-adjacent here (no git); if the
  folder ever gets versioned, ignore it and re-vendor from lockfile instead.
