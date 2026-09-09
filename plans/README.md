# Implementation Plans

Grill session 2026-09-09: 5 decisions, all (a) — baseline-first, Esc-back,
showLines, local guard, SMS-validation dropped. Execute in order; 002 needs
001's build gate. No git in repo — drift via sha1 quoted in each plan.
Baseline hash: `c3fdb1826fc5119894497b6aab66e45a27e635eb` (if 001 records a new
hash after its scaffold-only work, that hash governs 002).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Standalone verification baseline | P1 | S | — | DONE |
| 002 | Esc-back, showLines output, safeParse | P1 | S | 001 | DONE |
| 003 | Vendor offline toolchain (tsc + @types/node via local copy) | P1 | S | 001 | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

## Dependency notes

- 002 requires 001 DONE (build gate). Sequential dispatch.
- Cutover to the live extension dir is operator-side after review — executors
  never touch `~/.pi/agent/extensions/`.

## Findings considered and rejected

- SMS input validation: dropped in grill (confirm dialog is the control;
  digit checks risk false-rejecting international formats).
- Full `ctx.ui.custom()` panel (D3), SMS inbox/contacts (D2), config wiring
  (D1): direction, not planned. Say word to spec any.
