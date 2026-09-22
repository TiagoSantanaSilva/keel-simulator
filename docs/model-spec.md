# Model specification

Mirrors `Keel_Fund_Model.xlsx` (Inputs + Fund Model tabs). All amounts are expected values
across the portfolio, so position counts can be fractional. The Monte Carlo section is the
exception: it draws whole positions at random.

Two strategies are compared, both funded from the same fund and the same outcome distribution:

- **SAFE only:** every position is a single unprotected SAFE (`checkT`).
- **SAFE + Option:** every position splits into an unprotected SAFE (`safeK`) plus a Keel
  Option (`optK`). The Option redeems if the company fails (subject to the redemption rate)
  and converts, at a possible valuation premium, if it succeeds.

## Timeline

Years are 0-indexed and mean "years after the initial check" directly: an input like `foYear`
or `ex1` names the array index at which it fires. The UI labels them 1 to 12, matching the
workbook's own year numbering (its "year 1" is the year of the initial checks).

- **Year 1:** initial checks. Management fees are charged for `MFY` years starting here.
- **Years 2 to `dConv`+1:** Keel charges its annual fee on positions still protected and
  awaiting a conversion decision.
- **Years 2 to `dRed`+1:** Keel charges its annual fee on positions still protected and
  awaiting a redemption decision. At year `dRed`+1, failed positions are redeemed (a share
  `redRate` of them) or written off (the rest).
- **Year `foYear`+1:** the follow-on reserve is deployed (net of Keel fees, for SAFE + Option).
- **Years `ex1`+1 to `ex4`+1:** each outcome bucket (returns capital, solid, strong, outlier)
  exits in its own year and pays out its multiple on the whole check.
- **Year `foExit`+1:** the follow-on reserve exits at `foMult`.
- **Year `recExit`+1:** capital recycled from redemptions into winners' next Series A exits at
  `recMult`.

## Derived values (`derive`)

| Symbol | Meaning | Formula |
|---|---|---|
| I | Investable capital | F × (1 − MF × MFY) |
| checkPool | Capital for initial checks | I × (1 − reserve) |
| foReserve | Follow-on reserve | I × reserve |
| checkK | SAFE + Option check size | safeK + optK |
| NT, NK | Positions backed | checkPool / checkT, checkPool / checkK |
| feePerPos | Keel's annual fee per position | tiered rate on `optK` (the protected balance), floored at `minFee` |
| licence | Keel's one-off licence fee | tiered on `checkK` (first-commitment tiers) |
| totalFees | Total Keel fees | licence + convertedK × feePerPos × dConv + redeemedK × feePerPos × dRed |
| recovered | Capital recovered via redemption | redeemedK × optK × (1 + yld × yldInv × dRed) |
| recycled | Recycled into winners' next Series A | min(recovered × recShare, F × recCap) |

`convertedK` is every position that is *not* redeemed (successes plus unredeemed failures) —
it keeps accruing the Keel fee until the conversion decision at year `dConv`.

## Strategies

- **SAFE only:** NT checks of `checkT`. Failures return nothing. The follow-on reserve exits
  at `foMult`.
- **SAFE + Option:** NK checks split `safeK` / `optK`. A failure loses `safeK` outright; the
  `optK` share is redeemed (`redRate`) or lost. A success converts the *whole* check
  (`safeK` + `optK`) at the round's terms, discounted by `premium`. Capital recovered from
  redemptions is split between recycling into winners' next Series A (up to `recCap` of the
  fund) and a direct distribution to LPs. Keel fees come out of the follow-on reserve before
  it's deployed.

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
  solver returns the root closest to zero.
- **Waterfall:** European, no hurdle. LPs receive all commitments first, then (1 − carry) of
  the rest.

## Monte Carlo (`monte`)

Each run draws every position's outcome independently from the same shares (`sh0`..`sh4`).
Redemption, fees and recycling are applied to the random failure count using the same
formulas as the deterministic model. Cash-flow timing is unchanged across runs (only the
dollar amounts vary), so each run gets its own net IRR, not just a TVPI. Seeded RNG, so
results are reproducible.
