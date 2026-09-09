# AGENTS.md — termux-panel-live

Pi extension. Single-file Termux device dashboard. Keyboard-driven via Termux:API.

## Stack

- TS ES2022, `module` / `moduleResolution: node`, `strict: true`, `noEmit`
- Runtime deps: `node:child_process`, `node:util` only
- `ExtensionAPI` import type-only (erased at compile). Real pkg resolved by Pi jiti at `/reload`
- Offline toolchain: vendored `node_modules/` (tsc + @types/node). No network needed

## Structure

- `termux-panel.ts` — entire extension (~230 lines). Factory default-export, `ctx: any` throughout
- `pi-types.d.ts` — ambient shim for `@earendil-works/pi-coding-agent`. Global `.d.ts`, no `export {}` (else tsc treats as augmentation → fail)
- `package.json` — `build: tsc --noEmit` only
- `tsconfig.json` — `include: [termux-panel.ts, pi-types.d.ts]`, `types: [node]`
- `plans/` — 001/002/003 + README. Status source of truth. Read before work

## Commands

```bash
npm run build   # gate, exit 0, zero output
sha1sum termux-panel.ts  # drift check, no git in repo
```

## Conventions

- `ctx: any` intentional. Real ctx types live in Pi runtime. Extend shim only when tsc demands
- All `termux-*` calls via `run()` helper (`execFileAsync`, 15s timeout). Never `exec` with shell string
- JSON outputs via `safeParseJSON` + `fmtJson`. Fallback: raw string
- Errors via `apiError(e)`: ENOENT → install hint, timeout → GPS/permission hint, denied → settings hint
- UI: `ctx.ui.select` menu loop, Esc exits (`if (!pick) return`). Detail views cap 50 lines + `← Back`
- SMS send requires `ctx.ui.confirm`. No regex digit validation (false-rejects intl formats — grilled decision)
- `showLines` handles empty output → `(no output)`

## Termux:API reqs

- Requires Termux:API app (F-Droid) + `pkg install termux-api`
- Location needs sky view + permission. GPS timeouts expected
- Photo path: `/storage/emulated/0/Pictures/termux_<Date.now()>.jpg`, camera `-c 0`
- Needs interactive mode (`ctx.mode === tui` / `ctx.hasUI`). Else notify + return

## Deploy

- Operator-side only. Copy `termux-panel.ts` → `~/.pi/agent/extensions/`, then `/reload` in Pi
- Executors never touch `~/.pi/agent/extensions/`
- Registered cmds: `/termux` (panel), `/battery`, `/location` (network provider)

## Constraints

- No git repo. Drift via sha1 quoted in plans. Verify before edit
- No cross-folder coupling. Never borrow `~/workspace/pi-termux-panel/node_modules`
- Plans 001/002/003 DONE. 002 needs 001 build gate. Sequential only
- Rejected (don't re-spec without ask): `ctx.ui.custom()` panel, SMS inbox/contacts, config wiring
