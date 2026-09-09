# Plan 003: Verify and fix GPS-timeout error mapping

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

GPS fixes routinely time out (no sky view). The code promises a friendly
"Timed out (location/GPS needs sky view + permission)" hint, but the
`ERR_TIMEOUT` regex (`/timed out|timeout/i`) was written against an assumed
error-message shape. Node's `execFile` timeout kill surfaces as
`killed: true` / `signal: 'SIGTERM'` with a "Command failed"-style message
that may not contain the word "timeout" at all — in which case users see a raw
kill dump instead of the hint. This plan proves the shape empirically (no
device needed) and fixes the matcher.

## Current state

- `termux-panel.ts:28-32` — the spawn helper:

```ts
async function run(cmd: string, args: string[] = [], timeout: number = CONFIG.timeoutMs): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { timeout });
  return stdout.trim();
}
```

- `termux-panel.ts:60-68` — the error mapper:

```ts
const ERR_MISSING = /not found|ENOENT/i;
const ERR_TIMEOUT = /timed out|timeout/i;
const ERR_PERMISSION = /permission|denied/i;

function apiError(e: any): string {
  const msg = e?.message ?? String(e);
  if (ERR_MISSING.test(msg)) return "termux-api missing. Run: pkg install termux-api + install Termux:API app";
  if (ERR_TIMEOUT.test(msg)) return "Timed out (location/GPS needs sky view + permission)";
  if (ERR_PERMISSION.test(msg)) return "Permission denied. Grant in Android settings / run termux-setup-storage";
  return msg;
}
```

- Convention: errors route through `withErrors` → `ctx.ui.notify(apiError(e), "error")`
  (`termux-panel.ts:80-88`). No behavior change allowed beyond the timeout branch.

## Commands you will need

| Purpose   | Command           | Expected on success  |
|-----------|-------------------|----------------------|
| Typecheck | `npm run build`   | exit 0, zero output  |
| Probe     | `node -e "..."` (Step 1) | prints error shape |

## Scope

**In scope** (the only files you should modify):

- `termux-panel.ts` (the `ERR_TIMEOUT` matcher and/or `apiError` only)

**Out of scope** (do NOT touch):

- Timeout durations (`CONFIG.timeoutMs`, `gpsTimeoutMs`) — polling/timeout-value changes were explicitly rejected in prior review.
- `ERR_MISSING`, `ERR_PERMISSION` branches — verified working, leave alone.
- Any UI text other than the timeout path.

## Git workflow

- Branch: `advisor/003-timeout-mapping` (or the operator's assigned branch).
- Commit message style: conventional commits, e.g. `fix: map execFile timeout kill to GPS hint` (see `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Capture the real timeout error shape (no device needed)

Force an `execFile` timeout with a self-contained Node child:

```bash
node -e "const {execFile}=require('node:child_process');execFile(process.execPath,['-e','setTimeout(()=>{},5000)'],{timeout:200},(e)=>{console.log('MESSAGE:',e&&e.message);console.log('KILLED:',e&&e.killed,'SIGNAL:',e&&e.signal,'CODE:',e&&e.code);});"
```

Record: does `MESSAGE` contain "timed out" or "timeout"? What are `killed`/`signal`/`code`?

**Verify**: command prints all four lines; you have the empirical shape written down.

### Step 2: Fix the matcher to cover the observed shape

Minimal change covering Step 1's evidence. Expected shape (confirm, don't assume):

- Keep the regex for message-based hits, AND treat `e?.killed === true` (with
  `signal === 'SIGTERM'`) or `code === 'ETIMEDOUT'` as timeout:

```ts
function isTimeout(e: any): boolean {
  return e?.killed === true || e?.code === "ETIMEDOUT" || ERR_TIMEOUT.test(e?.message ?? String(e));
}
```

and use `if (isTimeout(e))` in `apiError`. If Step 1 shows the message DOES
contain "timeout", the fix is a no-op guard for `killed`/`code` only. Do NOT
restructure `apiError` beyond this branch.

**Verify**: `npm run build` → exit 0, zero output.

### Step 3: Prove the mapping end-to-end (no device needed)

```bash
node -e "
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const ex=promisify(execFile);
(async()=>{try{await ex(process.execPath,['-e','setTimeout(()=>{},5000)'],{timeout:200});console.log('NO_TIMEOUT_BUG');}catch(e){console.log('killed='+e.killed,'code='+e.code);}})();"
```

Feed the observed fields through the same predicate logic as your `isTimeout`
(temporarily duplicate the 3-line check in the probe if needed) → must classify
as timeout.

**Verify**: probe classifies the forced timeout as a timeout.

## Test plan

No test framework in this repo (deliberate). Verification is the Step 3 probe
plus the build gate. If plan 009 (smoke harness) has already landed, add a
timeout-mapping case to it following its existing pattern instead of the
throwaway probe.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 with zero output
- [ ] Forced-timeout probe classifies as timeout under the new logic
- [ ] `ERR_MISSING` / `ERR_PERMISSION` branches byte-identical (`git diff` shows only the timeout path touched)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 1 probe cannot run in this environment (no Node child spawn) — the
  fix cannot be verified; report the raw output instead of guessing.
- Step 1 shows a shape the `isTimeout` sketch doesn't cover (e.g. timeouts
  surface as plain nonzero-exit with no marker) — report the shape, don't invent.
- The fix appears to require touching timeout durations, other branches, or any out-of-scope file.

## Maintenance notes

- Reviewer: scrutinize that the `killed === true` check can't misfire on
  user-killed processes (acceptable: a killed child IS effectively a timeout
  from the UI's perspective — that tradeoff is intentional).
- If Termux:API ever localizes CLI messages, the regex half rots — the
  structured half (`killed`/`code`) is the durable part.
