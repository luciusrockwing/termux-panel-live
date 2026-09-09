# Project Context

## Stack

- **Language/Runtime:** TypeScript ES2022 (`target ES2022`, `moduleResolution node`, `module ES2022`, `strict true`, `noEmit`); Node `child_process` + `util` only (no other runtime deps).
- **Build/Check:** `tsc --noEmit` (sole gate; exit 0 = pass). No test runner, no lint, no network at build time — vendored `node_modules` (tsc + `@types/node`) only.
- **Host runtime:** "Pi" coding agent. Extension is single-file TS consumed via `jiti` at `/reload`; `@earendil-works/pi-coding-agent` types come from an ambient `declare module` shim (`pi-types.d.ts`), never resolved on disk.
- **System integration:** All device ops via `termux-api` CLI tools (`termux-battery-status`, `termux-location`, `termux-camera-photo`, etc.) spawned with `execFileAsync` + 15s default timeout (30s for GPS).
- **UI surface:** Pi-provided `ctx.ui.select/input/confirm/notify` (keyboard-driven TUI/menu loop). Single-file Pi extension (`termux-panel.ts`) + `pi-types.d.ts` + `package.json` + `tsconfig.json`.

## Architecture

- **Entry points:** Three registered commands (`pi.registerCommand`): `/termux` → `openPanel` (interactive menu loop), `/battery`, `/location` (network provider only).
- **Data flow:** Command handler → `ctx: any` → typed `Ctx` cast → `run(termux-*)` → `safeParseJSON`/`fmtJson` → `showLines(ctx, title, lines)` → `ctx.ui.select` menu (≤50 lines + `← Back`). Errors funneled through `withErrors` → `apiError` → `ctx.ui.notify(msg, "error")`.
- **Pattern:** Single exported factory `default function (pi: ExtensionAPI)`. Internal helpers (`run`, `termuxJson`, `fmtJson`, `safeParseJSON`, `showLines`, `apiError`, `withErrors`) are module-private. Menu built from `ACTIONS: Action[]` array (id + label + `run(ctx)`); dispatch is `Map(label → Action)`.
- **Business logic vs I/O:** Logic is minimal/edge (timeout selection, provider selection, `Promise.all` for device overview); all real work is I/O to `termux-*` CLIs. No service/repo layering — flat functional module.

## Conventions (Observed)

- **Error handling:** All-or-nothing per action. `withErrors` wraps action `run` and catches; `apiError` regex-maps known codes (ENOENT → install hint, timeout → GPS hint, permission → settings hint), else echoes raw message to `notify`. No structured errors, no recovery beyond user-facing hint.
- **API shapes:** N/A external APIs. Internal contract = `execFileAsync(cmd, args, {timeout})`; JSON responses handled via `safeParseJSON<T>` + `fmtJson` (object → `key: value` lines, array elements stringified via JSON). Empty output → `["(no output)"]`.
- **Type safety:** Mixed. `strict true` on tsc, but public command handlers take `ctx: any` (Pi runtime types intentionally not on disk). Internal interfaces `Ui`, `Ctx`, `Action` are sound; casts (`ctx as Ctx`, `ctx as any`) bridge boundaries. `ExtensionAPI` shim is `import type` (erased; real pkg resolved by jiti).
- **Observability:** None beyond `ctx.ui.notify` (info/error/warning) surfaced to the user at runtime. No logging, no health checks, no metrics. Offline builds leave no audit trail.
- **Testing:** tsc type-checking only. No unit tests; no test framework. Plans (`001-verify-baseline.md`, `002-esc-output-parse-fixes.md`, `003-vendor-toolchain.md`) treat `npm run build` + sha1 drift as the verification gate.
- **Docs/Process:** AGENTS.md chain is the binding contract (DOX framework). `plans/` is the status source of truth. `node_modules/` and `.pi/tasks/` are gitignored scratch. Install = copy `termux-panel.ts` → `~/.pi/agent/extensions/` + `/reload`; executors never touch that path.

## Signals / Active Considerations

- **Consistency gap:** Public handlers use `ctx: any`; internals use `Ctx`/`Ui`. Casts (`ctx as Ctx`) are the seam — tighten only if Pi runtime types are vendored (blocked T7; tsc fails with `export {}` shim or real import).
- **Debt hotspot:** `termuxJson`/parse/format path (`fmtJson`/`safeParseJSON`) is the parsing hot zone — arrays print as `0: val`; plan `002-esc-output-parse-fixes` targets this. `apiError` relies on regex over free-text messages (locale/version fragile).
- **Integration point:** All features are thin over `termux-api` CLIs — adding a feature means a new `Action` + `registerCommand`. No wrapper library; each `Action.run` calls `run`/`termuxJson` directly. Photo path hardcodes `/storage/emulated/0/Pictures` (no `termux-setup-storage` guard, no existence check post-capture).
- **Convention:** Action dispatch keyed by `label` (emoji-prefixed) is coupling-prone; after T3 refactor, `ACTIONS.find` by label is eliminated (Map pre-built, lookup O(1)).
- **Scope guard (no cross-folder):** Project is one Pi extension in `termux-panel-live`; no shared `node_modules` borrowing from sibling dirs. Single-file deploy is the binding constraint — splitting modules is explicitly rejected.
- **Testing strategy debt:** No runtime/unit tests. Validation = `tsc --noEmit` (exit 0) + sha1 drift against `plans/` baseline. Any refactor must keep build green and behavior identical.
