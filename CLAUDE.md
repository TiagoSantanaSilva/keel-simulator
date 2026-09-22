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

- Two strategies: SAFE only (one unprotected check, `checkT`) vs SAFE + Option (`safeK` unprotected + `optK` protected, sized independently of `checkT`). No "waiting" strategy.
- Years are 0-indexed and mean "years after the initial check" directly; the UI labels them 1–12 to match the workbook.
- Five outcome buckets (failure, returns capital, solid, strong, outlier), each with its own share, multiple and exit year — not the old three-bucket ok/outlier/fail split.
- Keel fee: tiered annual rate on the protected balance (`optK`) plus a one-off licence tiered on the whole SAFE + Option check, both from `src/config.js`'s pricing inputs.
- Redeemed capital is split between recycling into winners' next Series A (capped at `recCap` of the fund) and a direct LP distribution; the rest is written off along with unredeemed failures' `optK`.
- Waterfall: European, no hurdle.
- No dilution/ownership/valuation-cap mechanics — outcomes pay a flat multiple on the check, matching the workbook.

## Ideas backlog

- Scenario comparison: save two input sets and show them side by side.
- Per-company Monte Carlo drill-down (show one simulated portfolio).
- Shareable URLs that encode the inputs.
- Syndication view: a lead writing unprotected with protected co-investors (see the workbook's Syndication tab).
- Token-round mode (currently equity only).
