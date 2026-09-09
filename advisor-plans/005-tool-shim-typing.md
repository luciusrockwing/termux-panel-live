# Plan 005: Type the agent-tool registration in the ExtensionAPI shim

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 001d326..HEAD -- termux-panel.ts pi-types.d.ts`
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

The `termux_read` tool registers through `(pi as any).registerTool(...)`
because the ambient `ExtensionAPI` shim only declares `registerCommand`. That
cast blinds `tsc` to the entire tool shape — a typo in `parameters`,
`execute`, or the return envelope ships silently. Typing the seam restores the
repo's sole verification gate (typecheck) over the tool registration.

## Current state

- `pi-types.d.ts` (whole file, 14 lines) — ambient global shim, NO top-level
  `export {}` (adding one breaks resolution — documented in the file header):

```ts
// Ambient module declaration for the Pi runtime package.
// Loaded as a GLOBAL .d.ts (no top-level `export {}`): a bare
// `declare module "x"` at top level tells tsc that module `x` provides
// these types when it cannot be resolved on disk (jiti supplies it live).
// If `export {}` is added, tsc treats this as module-augmentation of an
// EXISTING module and falls back to "cannot find module".
declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    registerCommand(name: string, options: {
      description?: string;
      handler: (args: string, ctx: any) => void | Promise<void>;
    }): void;
  }
}
```

- `termux-panel.ts:281` — the cast site (inside the default-exported factory):

```ts
  // Agent-callable read tool: headless-safe (no ctx.ui), reads only.
  // Cast: type-lens ExtensionAPI shim lacks registerTool (see pi-types.d.ts).
  (pi as any).registerTool({
```

  followed by the tool object (`name: "termux_read"`, `description`,
  `parameters` with `field` + `provider`, `execute(_id, params)` returning
  `{ content: [{ type: "text", text }], details, terminate: false }`).

- Convention (`AGENTS.md`): "Extend shim only when tsc demands". This plan IS
  that demand. Prior T7 block was about `export {}`/real imports — extending
  the existing interface body is the allowed path.

## Commands you will need

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npm run build`   | exit 0, zero output |

## Scope

**In scope** (the only files you should modify):

- `pi-types.d.ts` (add `registerTool` to the `ExtensionAPI` interface body)
- `termux-panel.ts` (replace `(pi as any).registerTool` with `pi.registerTool`; update the stale cast comment)

**Out of scope** (do NOT touch):

- Tool behavior, parameters, return envelope, description text — signature typing only.
- `registerCommand`, handlers, dispatch, error mapping.
- Any `export {}` or import-style change to the shim (known to break tsc).

## Git workflow

- Branch: `advisor/005-tool-shim-typing` (or the operator's assigned branch).
- Commit message style: conventional commits, e.g. `refactor: type registerTool in ExtensionAPI shim` (see `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend the shim interface

Inside the existing `ExtensionAPI` interface body in `pi-types.d.ts`, add:

```ts
    registerTool(tool: {
      name: string;
      description?: string;
      parameters?: unknown;
      execute: (id: string, params: any) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown; terminate: boolean }>;
    }): void;
```

Keep `parameters` loose (`unknown`) — the tool's JSON-schema object is not
worth modeling exactly. Keep everything else in the file byte-identical.

**Verify**: `npm run build` → exit 0, zero output (shim-only change must not break the gate).

### Step 2: Drop the cast at the call site

In `termux-panel.ts`, replace `(pi as any).registerTool({` with
`pi.registerTool({` and update the comment above it to note the shim now
declares the method (delete the "shim lacks registerTool" line, keep the
headless-safe/reads-only note).

**Verify**: `npm run build` → exit 0, zero output. Then negative check:
temporarily rename `name:` to `naame:` → build must FAIL → revert. (Proves
the gate now sees the tool shape.)

### Step 3: Confirm scope discipline

**Verify**: `git status --short` → only `M pi-types.d.ts` and `M termux-panel.ts`;
`git diff --stat` → a few lines each; `sha1sum termux-panel.ts` recorded for
the plans baseline.

## Test plan

No test framework in this repo (deliberate). Verification is the build gate
plus the Step 2 negative check (gate must catch a deliberate typo, then the
typo is reverted).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 with zero output
- [ ] Negative check failed-then-passed (typo caught, reverted)
- [ ] `grep -n "as any" termux-panel.ts` returns no matches
- [ ] No `export {}` or import added to `pi-types.d.ts`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run build` fails after the shim edit with "cannot find module" or
  augmentation errors (the T7 block is real for this edit too — revert both
  files and report the exact tsc output).
- The real Pi runtime `registerTool` signature differs (extra required fields)
  — do not guess; report what jiti/docs say.
- The change requires touching tool behavior or any out-of-scope file.

## Maintenance notes

- Reviewer: confirm the `execute` return type matches the actual object
  (content/details/terminate) — looseness here reintroduces the blind spot.
- If Pi ever ships real `@earendil-works/pi-coding-agent` types, this whole
  shim (and plan) retires — delete `pi-types.d.ts` and the `main` field note.
