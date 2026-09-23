# Model specification

Mirrors `Keel_Fund_Model.xlsx` (Inputs + Fund Model tabs). All amounts are expected values
across the portfolio, so position counts can be fractional. The Monte Carlo section is the
exception: it draws whole positions at random.

Two strategies are compared, both funded from the same fund and the same outcome distribution.
The failure bucket is fixed (`sh0`, `failLabel` — no multiple or exit, since it never returns
anything); every other outcome lives in `outcomes`, a freely editable array of
`{label, share, mult, exit}`. Rows can be added, removed or renamed — the engine iterates the
array, so its length isn't fixed anywhere.

- **SAFE only:** every position is a single unprotected SAFE (`checkT`), independent of the
  SAFE + Keel check size below.
- **SAFE + Keel:** every position splits into an unprotected SAFE (`safeK`) plus a Keel
  convertible (`optK`). It redeems if the company fails (subject to the redemption rate) and
  converts, at a possible valuation premium, if it succeeds. `roundVal` (round valuation) and
  `totalOpt` (total convertible amount across every protected investor in the round) are
  informational only — shown in the founder view, and don't feed into either strategy's
  returns, since the model has no cap-table/dilution mechanics.

## Timeline

Years are 0-indexed and mean "years after the initial check" directly: an input like `foYear`
or an outcome's `exit` names the array index at which it fires. The UI labels them 1 to 12,
matching the workbook's own year numbering (its "year 1" is the year of the initial checks).

**Single vintage, like the workbook.** All initial checks are treated as written in year 1.
Modelling a staggered vintage properly would mean moving the whole engine to monthly
resolution (every formula here is keyed off a single check date) — a possible future change,
not attempted as a partial fix.

**Follow-ons and recycled capital are attributed per surviving company, riding that company's
own outcome — at a discount for entering later.** The reserve (and, for SAFE + Keel, recycled
capital) is split across every surviving company by `allocate()`, which blends two allocation
styles via `foSkill` (0–1): an *even* split, where each bucket's slice is proportional to its
share of survivors (`foSkill = 0`, the old default behaviour), and a *hindsight* split, where
each bucket's slice is proportional to its share of eventual portfolio value (`share × mult`,
`foSkill = 1`) — as if the fund could already tell which companies would be the big winners and
concentrated its follow-on dollars there. Each bucket's follow-on tranche then earns *that
bucket's own* `mult`, divided by `foStepUp` (default 3x), and pays out in *that bucket's own*
`exit` year. The division models a real dynamic the flat-multiple design couldn't: a follow-on
dollar buys in at a higher price than the initial check (the step-up), so it only captures a
fraction of the same exit. There's no separate follow-on exit-year input — the money simply
rides along with whichever company it went into, using the Outcomes table that's already there.
This replaced an earlier design with a single blended `foMult`/`foExit` (and, before that, a
separate `recMult`/`recExit`) applied to the whole pool with no per-company attribution at all.

- **Year 1:** initial checks. Management fees are charged for `MFY` years starting here.
- **Years 1 to `dConv`:** Keel charges its annual fee on positions still protected and
  awaiting a conversion decision, the same way management fees and the initial capital call
  both start in year 1.
- **Years 1 to `dRed`:** Keel charges its annual fee on positions still protected and
  awaiting a redemption decision. At year `dRed`+1, failed positions are redeemed (a share
  `redRate` of them) or written off (the rest).
- **Year `foYear`+1:** the follow-on reserve is deployed (net of Keel fees, for SAFE + Keel).
  This reserve is sized identically for both strategies (see Strategies below) — it's the
  most common source of "why did the SAFE-only number move?" confusion.
- Each outcome bucket exits, at its own `exit`+1 year, paying out its multiple on the initial
  check plus `mult ÷ foStepUp` on whatever follow-on/recycled dollars were allocated to it.

## Derived values (`derive`)

| Symbol | Meaning | Formula |
|---|---|---|
| I | Investable capital | F × (1 − MF × MFY) |
| checkPool | Capital for initial checks | I × (1 − reserve) |
| foReserve | Follow-on reserve | I × reserve |
| checkK | SAFE + Keel check size | safeK + optK |
| NT, NK | Positions backed | checkPool / checkT, checkPool / checkK |
| feePerPos | Keel's annual fee per position | `keelFee` × `optK` (a single flat annual rate on the protected balance) |
| totalFees | Total Keel fees | convertedK × feePerPos × dConv + redeemedK × feePerPos × dRed |
| recovered | Capital recovered via redemption | redeemedK × optK (100% of reserve yield goes to the company, so no yield boost on the fund's recovery) |
| recycled | Recycled into winners' next round | recovered × recShare (uncapped) |
| foAllocT/K[i], recAllocK[i] | Dollars of the reserve/recycled pool allocated to outcome bucket i | `allocate()` — see the Timeline section above |

`convertedK` is every position that is *not* redeemed (successes plus unredeemed failures) —
it keeps accruing the Keel fee until the conversion decision at year `dConv`.

## Strategies

- **SAFE only:** NT checks of `checkT`. Failures return nothing. The follow-on reserve is
  allocated per bucket and exits at each bucket's own `mult ÷ foStepUp`.
- **SAFE + Keel:** NK checks split `safeK` / `optK`. A failure loses `safeK` outright; the
  `optK` share is redeemed (`redRate`) or lost. A success converts the *whole* check
  (`safeK` + `optK`) at the round's terms, discounted by `premium`. Capital recovered from
  redemptions is split between recycling into winners' next round (uncapped) and a direct
  distribution to LPs. Keel fees come out of the follow-on reserve before it's deployed.

Both strategies draw the follow-on reserve as the *same dollar amount* (a share of investable
capital, not of either strategy's own check pool) — this is deliberate, matching the
workbook's own rationale ("both funds hold the same follow-on reserve ... so the comparison is
fair"), and it's why moving the `reserve` slider visibly changes the SAFE-only side too.
"Same" describes only this base pool, though — it's `foReserve` for SAFE only vs.
`foReserveK = foReserve − totalFees` for SAFE + Keel (fees come out first). Recycled capital
is a second, separate pool that only SAFE + Keel has: on top of its (fee-reduced) share of the
base reserve, SAFE + Keel *also* deploys `recycled` into winners at their next round. So
Keel strategy's total capital reaching winners is the base reserve's pro-rata share minus fees,
plus this additional recycled amount — strictly more machinery than SAFE only has, even though
the base pool itself is sized identically.

**Pricing deviates from the workbook by design.** `Keel_Fund_Model.xlsx` prices Keel with a
tiered one-off licence fee plus a banded annual rate. This app instead exposes one flat annual
rate, `keelFee`, applied to `optK` — a deliberate simplification requested to make the pricing
control legible, at the cost of the workbook's one-off licence fee ($10,000 in its base case).

## Marks (NAV)

The workbook itself tracks only realised cash (DPI over time; TVPI is the final DPI once
everything has exited). This app additionally marks unrealised positions for the RVPI/TVPI
chart, using the simplest defensible convention given the workbook has no interim marks:

- A position destined to succeed is held at cost from year 1, marked up to `foStepUp`× cost
  from `foYear` (`markFactor`), then realised at its full outcome multiple at its exit year
  (removed from NAV, added to distributions). The markup models the fact that a follow-on
  round reprices *existing* investors, not just the new money going in — before this, a
  surviving position sat flat at cost for years, understating RVPI/TVPI in exactly the years
  the chart is supposed to be telling a marks-vs-cash story.
- A position destined to fail is held at cost (`checkT` for SAFE only; `safeK` plus any
  unredeemed `optK` for SAFE + Keel) through `failYearStart` (default 2), then marked down
  *linearly* to zero over a fixed `FAIL_RAMP_YEARS`-year window (3 years, not user-editable)
  — a ramp (`failFrac`), not a single-year cliff, matching how a real portfolio recognises
  losses gradually rather than all at once. A redeemed failure is a separate case: its `optK`
  is held at cost until the redemption year (`dRed`, independent of `failYearStart`), since
  that capital is genuinely recovered as cash then.
- The follow-on reserve and recycled capital are held at cost (the dollar amount allocated to
  each bucket, before the `foStepUp` multiple is applied) from their deployment year to their
  exit year.

This choice only feeds the RVPI/TVPI-over-time chart. It never affects DPI or IRR, which come
purely from the cash-flow rows below, matching the workbook exactly.

## Metrics

- **DPI** = cumulative LP distributions (after carry) / cumulative paid-in.
- **RVPI** = (LP total value at cost − LP distributions) / paid-in, from the NAV convention above.
- **TVPI** = DPI + RVPI, net of carry. Equals DPI once every position has exited.
- **Gross TVPI** (labelled "Gross multiple" in older copy) = total proceeds (before fees and
  carry) / fund size — a gross TVPI on *committed* capital, not a MOIC on capital actually
  invested (those differ here since the reserve isn't called until `foYear`).
- **Net IRR** on yearly LP cash flows (contributions negative, distributions positive); the
  solver returns the root closest to zero. **IRR to date** (`irrToDate[i]`) restricts the cash
  flows to years 0..i, but adds that year's unrealised LP NAV (`lptv[i] − lpc[i]`) as an extra
  inflow in year i — as if the position were marked to cost and liquidated then. It's `NaN`
  only when that adjusted series has no sign change to find a root from (typically just the
  very first year or two, before any capital has moved). At the final year NAV is 0, so
  `irrToDate` converges exactly to `irr` without a special case.
- **Waterfall:** European, no hurdle. LPs receive all commitments first, then (1 − carry) of
  the rest.

## Monte Carlo (`monte`)

Each run draws every position's outcome independently from the same shares (`sh0` plus each
`outcomes[i].share`).
Redemption, fees and recycling are applied to the random failure count using the same
formulas as the deterministic model. Cash-flow timing is unchanged across runs (only the
dollar amounts vary), so each run gets its own net IRR, not just a TVPI. Seeded RNG, so
results are reproducible.

The TVPI summary stat (`mean`) is a plain average — TVPI is a ratio of two dollar totals, so
averaging it across runs is well-defined. IRR is not: it's a rate computed from each run's own
cash-flow timing, and the mean of several runs' rates doesn't correspond to any actual
portfolio's return. `irrMedian` reports the median run's IRR instead, which is well-defined
regardless (it's just "the middle run," picked by sorting).
