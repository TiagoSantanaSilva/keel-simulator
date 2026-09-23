# Model specification

Mirrors `Keel_Fund_Model.xlsx` (Inputs + Fund Model tabs). All amounts are expected values
across the portfolio, so position counts can be fractional. The Monte Carlo section is the
exception: it draws whole positions at random.

Two strategies are compared, both funded from the same fund and the same outcome distribution.
The failure bucket is fixed (`sh0`, `failLabel` — no exit value, follow-on valuation or exit
year, since it never returns anything); every other outcome lives in `outcomes`, a freely
editable array of `{label, share, exitVal, foPct, exit}`. Rows can be added, removed or renamed
— the engine iterates the array, so its length isn't fixed anywhere. `exitVal` is the company's
absolute value at exit; each bucket's *multiple* is never stored, it's derived as
`exitVal / roundVal` (`outcomeMultiples` in engine.js) and used everywhere internally exactly
like the old raw multiple was — see `withMult`. `roundVal` (entry valuation, post-money) is
therefore **not informational any more**: it's the denominator of every outcome's multiple, so
changing it moves returns on purpose. It's also still shown in the founder view for dilution
context. `foPct` is that same bucket's follow-on round valuation, as a fraction of its own
`exitVal` — see the Timeline section below.

- **SAFE only:** every position is a single unprotected SAFE (`checkT`), independent of the
  SAFE + Keel check size below. Each outcome's multiple for T is `exitVal / roundVal`.
- **SAFE + Keel:** every position splits into an unprotected SAFE (`safeK`) plus a Keel
  convertible (`optK`). It redeems if the company fails (subject to the redemption rate) and
  converts, at a possible valuation premium, if it succeeds — i.e. K's entry valuation is
  `roundVal × (1 + premium)`, applied as `/(1+premium)` on K's exit value rather than as a
  separate multiple, so the same derived `mult` serves both strategies. `totalOpt` (total
  convertible amount across every protected investor in the round) is still informational
  only — shown in the founder view, and doesn't feed into either strategy's returns, since the
  model has no cap-table/dilution mechanics.

## Timeline

Years are 0-indexed and mean "years after the initial check" directly: an input like `foYear`
or an outcome's `exit` names the array index at which it fires. The UI labels them 1 to 12,
matching the workbook's own year numbering (its "year 1" is the year of the initial checks).

**Single vintage, like the workbook.** All initial checks are treated as written in year 1.
Modelling a staggered vintage properly would mean moving the whole engine to monthly
resolution (every formula here is keyed off a single check date) — a possible future change,
not attempted as a partial fix.

**Follow-ons and recycled capital are attributed per company, riding that company's own
outcome — at a discount for entering later, and with some of it genuinely lost.** The reserve
is split across every position still *eligible* at `foYear` by `allocate()`, which blends two
allocation styles via `foSkill` (0–1): an *even* split, where each bucket's slice is
proportional to its share of `eligibleAtFoYear` (`foSkill = 0`), and a *hindsight* split, where
each bucket's slice is proportional to its share of eventual portfolio value (`share × mult`,
`foSkill = 1`, survivors only) — as if the fund could already tell which companies would be the
big winners and concentrated its follow-on dollars there, never wasting money on a company it
already knows will fail. `eligibleAtFoYear = survivorShare + sh0 × failFrac(foYear)`: the
failure bucket isn't excluded outright, because a company that hasn't been *recognised* as a
failure yet (see Marks below) can still receive follow-on money and then die anyway — whatever
lands there is simply never paid out, i.e. lost, same as it would be in reality. This is why
`reserve` no longer makes returns monotonically better the higher it goes: push it up and more
of it lands on companies that turn out to be duds. Recycled capital gets the same step-up/exit
treatment but always allocates across *survivors only* (no eligibility dilution) — by the time
it's deployed (`dRed`), a redeemed failure has already been recognised as dead, so there's no
"not yet known" case for it. If recycled capital has nowhere to go at all (no survivors),
`allocate()` returns zero for every bucket; the undistributed amount is paid straight to LPs
(`distFromRed`) instead of silently vanishing.

Each bucket's follow-on tranche earns *that bucket's own* `mult`, divided by *that bucket's own*
`foStepUp = mult × foPct`, and pays out in *that bucket's own* `exit` year. There's no single
follow-on valuation shared across every company — each bucket sets its own follow-on round's
post-money valuation as `foPct` of *that company's own* eventual exit value (`exitVal × foPct`),
so `mult × foPct` is that valuation divided by `roundVal`, matching how every other multiple in
this model is derived. The division models a real dynamic a flat multiple couldn't: a follow-on
dollar buys in at a higher price than the initial check (the step-up), so it only captures a
fraction of the same exit. The fraction it captures, `mult / foStepUp`, simplifies to `1/foPct`
— independent of the bucket's own multiple, since `mult` cancels out. In other words: a
follow-on round priced at 50% of the eventual exit value returns 2x by exit, whether that exit
is a modest one or an outlier; a bigger `foPct` means the follow-on money bought in closer to
the top, so it captures less of the remaining upside. There's no separate follow-on exit-year
input — the money simply rides along with whichever company it went into, using the Outcomes
table that's already there.

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
  check plus `1 ÷ foPct` on whatever follow-on/recycled dollars were allocated to it.

## Derived values (`derive`)

| Symbol | Meaning | Formula |
|---|---|---|
| I | Investable capital | F × (1 − MF × MFY) |
| checkPool | Capital for initial checks (T, and K before the fee floor below) | I × (1 − reserve) |
| foReserve | Follow-on reserve | I × reserve |
| checkK | SAFE + Keel check size | safeK + optK |
| eligibleAtFoYear | Share of positions still eligible for the reserve at `foYear` | survivorShare + sh0 × failFrac(p, foYear) |
| checkPoolK | K's actual check pool, after the fee floor | see "Fees never exceed the fund" below |
| NT, NK | Positions backed | checkPool / checkT, checkPoolK / checkK |
| feePerPos | Keel's annual fee per position | `keelFee` × `optK` (a single flat annual rate on the protected balance) |
| totalFees | Total Keel fees | convertedK × feePerPos × dConv + redeemedK × feePerPos × dRed |
| recovered | Capital recovered via redemption | redeemedK × optK (100% of reserve yield goes to the company, so no yield boost on the fund's recovery) |
| recycled | Recycled into winners' next round | recovered × recShare (uncapped), minus whatever `allocate()` can't place (paid to LPs instead) |
| foAllocT/K[i], recAllocK[i] | Dollars of the reserve/recycled pool allocated to outcome bucket i | `allocate()` — see the Timeline section above |

**Fees never exceed the fund.** `totalFees` scales linearly with `NK` (and so with the check
pool), so `totalFees = feeRate × checkPoolK` for a constant `feeRate` derived from `keelFee`,
`dConv`, `dRed` and `redRate`. If the *unshrunk* fee (`feeRate × checkPool`) would exceed
`foReserve`, the model solves the break-even point in closed form —
`checkPoolK = (checkPool + foReserve) / (1 + feeRate)` — instead of calling the shortfall as
extra capital on top of the fund size. In other words, fees beyond the reserve shrink the
number of companies K backs; they never conjure capital the fund doesn't have. At default
inputs the unshrunk fee fits inside the reserve, so `checkPoolK == checkPool` and this never
triggers — it only matters at higher `keelFee`/lower `reserve` combinations.

`convertedK` is every position that is *not* redeemed (successes plus unredeemed failures) —
it keeps accruing the Keel fee until the conversion decision at year `dConv`.

## Strategies

- **SAFE only:** NT checks of `checkT`. Failures return nothing. The follow-on reserve is
  allocated per bucket and exits at each bucket's own `1 ÷ foPct`.
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

- A position destined to succeed is held at cost from year 1, marked up to that bucket's own
  `foStepUp`× cost from `foYear` (`markFactor`), then realised at its full outcome multiple at
  its exit year (removed from NAV, added to distributions). The markup models the fact that a
  follow-on round reprices *existing* investors, not just the new money going in — before this,
  a surviving position sat flat at cost for years, understating RVPI/TVPI in exactly the years
  the chart is supposed to be telling a marks-vs-cash story.
- A position destined to fail is held at cost (`checkT` for SAFE only; `safeK` plus any
  unredeemed `optK` for SAFE + Keel) through `failYearStart` (fixed at 2, not a user input),
  then marked down *linearly* to zero over a fixed `FAIL_RAMP_YEARS`-year window (3 years,
  also not user-editable) — a ramp (`failFrac`), not a single-year cliff, matching how a real
  portfolio recognises losses gradually rather than all at once. A redeemed failure is a
  separate case: its `optK` is held at cost until the redemption year (`dRed`, independent of
  `failYearStart`), since that capital is genuinely recovered as cash then.
- The follow-on reserve and recycled capital are held at cost (the dollar amount allocated to
  each bucket, before that bucket's own `1 ÷ foPct` multiple is applied) from their deployment
  year to their exit year.

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
