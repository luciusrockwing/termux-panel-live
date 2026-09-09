# Implementation Plans

Grill session 2026-09-09: 5 decisions, all (a) — baseline-first, Esc-back,
showLines, local guard, SMS-validation dropped. Execute in order; 002 needs
001's build gate. No git in repo — drift via sha1 quoted in each plan.
Baseline hash: `740850cd77bc9be1c495d542f62d4d550a8d8e1f` (current verified sha1 of termux-panel.ts; supersedes c3fdb182 — apply to any future plan)

| Plan | Title | Priority | Effort | Depends on | Status |
| ------ | ------- | ---------- | -------- | ------------ | -------- |
| 001 | Standalone verification baseline | P1 | S | — | DONE |
| 002 | Esc-back, showLines output, safeParse | P1 | S | 001 | DONE |
| 003 | Vendor offline toolchain (tsc + @types/node via local copy) | P1 | S | 001 | DONE |

Baseline hash: `7c19b7583e90550b37a38574d1ca7434d3567c2f` (current verified sha1 of `termux-panel.ts`; supersedes `740850cd77bc9be1c495d542f62d4d550a8d8e1f`)
