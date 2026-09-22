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

See `docs/model-spec.md` for detail.

- Year 0 = seed. Series A in year 3, when winners and failures are revealed.
- Per company: $500K upfront SAFE + $250K of a $1M protected deposit, all converting at a $10M post-money cap (0% premium by default).
- Outcomes: 80% fail ($0 at year 3), 18% "ok" (Series A $30M, exit $50M in year 6), 2% outliers (Series A $100M, exit $250M across years 5–8). 20% dilution per round, two rounds after the Series A.
- Keel decisions: in year 2 the fund converts or redeems part of the protected position with a partial signal; in year 3 winners convert the rest and failures redeem the rest.
- Keel fee: 2.5% a year on the fund's protected balance, paid by the fund. Deposit yield (6%) goes to the company.
- Recovered capital is recycled into winners' Series A (capped at 20% of the fund); any excess is distributed.
- Waterfall: European, no hurdle. Reserves sized to cover expected pro-rata exactly.

## Ideas backlog

- Scenario comparison: save two input sets and show them side by side.
- Per-company Monte Carlo drill-down (show one simulated portfolio).
- Shareable URLs that encode the inputs.
- Syndication view: a lead writing unprotected with protected co-investors.
- Token-round mode (currently equity only).
