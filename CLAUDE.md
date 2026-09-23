# CLAUDE.md

Context for Claude Code working in this repo.

## What this is

A simulator for Keel (keel.sale), which licenses principal-protected financing infrastructure to VC funds. The audience is emerging seed-fund GPs (Fund I/II, around $50M). The simulator must survive scrutiny from a CFA-level investor, so correctness and transparent assumptions matter more than features.

## Rules

- `src/engine.js` stays pure: no DOM, no randomness except the seeded RNG. All model logic lives there; `main.js` only renders.
- Run `npm test` after any engine change. The baseline values in `tests/engine.test.js` come from the Excel model. If a change moves them on purpose, update the test and explain why in the commit message.
- Add a test for every new mechanic, ideally an invariant (for example: with nothing protected and no fees, Keel must equal traditional).
- Update `docs/model-spec.md` whenever a formula or assumption changes.
- Inputs are plain numbers (0.2 means 20%). New inputs go in `src/config.js` with a default in `DEF`.
- Plain, sentence-case UI copy. No jargon a GP wouldn't use.

## Model summary

See `docs/model-spec.md` for detail. Mirrors `Keel_Fund_Model.xlsx` (Inputs + Fund Model tabs).

- Two strategies: SAFE only (one unprotected check, `checkT`) vs SAFE + Keel (`safeK` unprotected + `optK` protected, sized independently of `checkT`). No "waiting" strategy.
- `src/config.js`'s `G` groups each carry a `section` (`shared`, `T`, `K`) that `main.js` renders as a colour-coded header. Keep new inputs in the right section — shared inputs move both strategies' numbers, which is intentional (the follow-on reserve is the recurring point of confusion; it's explicitly shared so the comparison is fair, per the workbook's own Read Me tab).
- Years are 0-indexed and mean "years after the initial check" directly; the UI labels them 1–12 to match the workbook.
- Outcomes are a fixed failure bucket (`sh0`/`failLabel`) plus a freely editable array, `S.outcomes` (`{label, share, mult, exit}`), rendered as a table with add/remove/rename controls in main.js — not a fixed set of named fields. `engine.js` iterates the array, so its length is never hardcoded anywhere; a new bucket needs no engine change.
- Keel fee is one flat annual rate (`keelFee`) on the protected balance (`optK`) — a deliberate simplification of the workbook's tiered licence + banded annual fee, requested for a legible pricing control. See docs/model-spec.md for what that changes.
- Redeemed capital is split between recycling into winners' next round (uncapped) and a direct LP distribution; the rest is written off along with unredeemed failures' `optK`.
- Follow-on and recycled capital earn each outcome bucket's own multiple divided by `foStepUp` (a step-up discount for entering later than the initial check), allocated across buckets by `allocate()` in engine.js — a blend of an even split and a hindsight/winner-weighted split, controlled by `foSkill` (0–1).
- NAV marks (RVPI/TVPI-over-time chart only; never DPI or IRR): a surviving position marks up to `foStepUp`× cost from `foYear` (`markFactor` in engine.js) instead of sitting flat at cost until exit. A failing position writes down linearly from full cost to zero across `failYearStart`→`failYear` (`failFrac`), not a single-year cliff.
- Waterfall: European, no hurdle.
- No dilution/ownership/valuation-cap mechanics — outcomes pay a flat multiple on the check, matching the workbook. `roundVal` and `totalOpt` are informational only (founder view), not engine inputs.

## Ideas backlog

- Scenario comparison: save two input sets and show them side by side.
- Per-company Monte Carlo drill-down (show one simulated portfolio).
- Shareable URLs that encode the inputs.
- Syndication view: a lead writing unprotected with protected co-investors (see the workbook's Syndication tab).
- Token-round mode (currently equity only).
