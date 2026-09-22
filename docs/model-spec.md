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

**Follow-ons and recycled capital are lump sums, not attributed to individual companies.**
Each outcome bucket carries its own exit year, but `foExit` is a single year for the *entire*
pool — matching the workbook's own "blended return on follow-on capital, same for both funds"
framing. Modelling per-company follow-on timing would mean tracking which specific companies
received follow-on and recycled capital and when each one individually exits, which this
expected-value model doesn't do.

**Recycled capital shares the follow-on reserve's multiple and exit year** (`foMult`,
`foExit`) rather than having its own. There used to be a separate `recMult`/`recExit`, but
since recycled capital is deployed the same way as the primary follow-on reserve — into
winners, at the next round — there was no basis for it to earn a different return on a
different timeline, so the two were merged.

- **Year 1:** initial checks. Management fees are charged for `MFY` years starting here.
- **Years 2 to `dConv`+1:** Keel charges its annual fee on positions still protected and
  awaiting a conversion decision.
- **Years 2 to `dRed`+1:** Keel charges its annual fee on positions still protected and
  awaiting a redemption decision. At year `dRed`+1, failed positions are redeemed (a share
  `redRate` of them) or written off (the rest).
- **Year `foYear`+1:** the follow-on reserve is deployed (net of Keel fees, for SAFE + Keel).
  This reserve is sized identically for both strategies (see Strategies below) — it's the
  most common source of "why did the SAFE-only number move?" confusion.
- Each outcome bucket exits, at its own `exit`+1 year, paying out its multiple on the whole
  check.
- **Year `foExit`+1:** the follow-on reserve *and* any recycled capital exit together, both
  at `foMult`.

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

`convertedK` is every position that is *not* redeemed (successes plus unredeemed failures) —
it keeps accruing the Keel fee until the conversion decision at year `dConv`.

## Strategies

- **SAFE only:** NT checks of `checkT`. Failures return nothing. The follow-on reserve exits
  at `foMult`.
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

- A position destined to succeed is held at cost from year 1 until its exit year, then it's
  realised (removed from NAV, added to distributions).
- A position destined to fail is written off immediately — no interim value, since the
  outcome distribution is known upfront in this expected-value model. A redeemed failure is
  the exception: it's held at cost (`optK`) until the redemption year, since that capital is
  genuinely recovered as cash then.
- The follow-on reserve and recycled capital are held at cost from their deployment year to
  their exit year.

This choice only feeds the RVPI/TVPI-over-time chart. It never affects DPI or IRR, which come
purely from the cash-flow rows below, matching the workbook exactly.

## Metrics

- **DPI** = cumulative LP distributions (after carry) / cumulative paid-in.
- **RVPI** = (LP total value at cost − LP distributions) / paid-in, from the NAV convention above.
- **TVPI** = DPI + RVPI, net of carry. Equals DPI once every position has exited.
- **Gross multiple** = total proceeds (before fees and carry) / fund size.
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
