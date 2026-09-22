# Model specification

All amounts are expected values across the portfolio, so company counts can be fractional. The Monte Carlo section is the exception: it draws whole companies at random.

## Timeline

- **Year 0:** seed checks. Management fees are charged in years 0–9.
- **Year 2:** first Keel decision, before anyone knows which companies will win.
- **Year 3:** Series A. Winners raise; failures are written off. Remaining Keel positions convert (winners) or are redeemed (failures). Pro-rata and recycled capital are invested.
- **Years 5–8:** exits.

## Derived values (`derive`)

| Symbol | Meaning | Formula |
|---|---|---|
| I | Investable capital | F × (1 − fee × fee years) |
| Chk | Fund's seed check per company | U + P |
| own | Ownership after seed | Chk / V |
| mS | Seed multiple after dilution | Exit / V × (1 − dil)^(1 + later rounds) |
| mA | Series A multiple after dilution | Exit / Series A price × (1 − dil)^(later rounds) |
| mk | Seed stake marked at the Series A | (1 − dil) × Series A price / V |
| PR | Pro-rata per winner | own × dil × Series A price |
| Rpc | Expected pro-rata per company | pOk × PRok + pOut × PRout |
| bal3 | Share of P still protected in year 3 | pF(1 − c2f − r2f) + pW(1 − c2w − r2w) |
| Fpc | Keel fees per company | kfee × P × (2 + bal3) |
| NT, NK | Companies backed | I / (Chk + Rpc) and I / (Chk + Rpc + Fpc) |
| R | Capital recovered | redemptions in years 2 and 3 |
| Rec | Recycled into winners | min(R × recycle share, cap × F) |

A valuation premium divides Keel's ownership, seed multiples, marks and pro-rata by (1 + premium).

## Strategies

- **Traditional:** NT seed checks of Chk, pro-rata in winners at year 3.
- **Keel:** NK seed checks (same Chk, part protected). Winners keep U + P(1 − r2w) of stake. Failures lose U + P × c2f. Recovered capital recycled into winners' Series A, split between outliers and "ok" companies by `recOut`.
- **Waiting:** invests I × allocation at the Series A in the same mix of winners (by count); unplaced capital is returned at year 3.

## Marks (NAV)

Positions are held at cost until year 3, then marked at the Series A price and moved in a straight line to exit value. Failures are zero from year 3.

## Metrics

- **DPI** = cumulative LP distributions / cumulative paid-in.
- **RVPI** = (LP total value − LP distributions) / paid-in.
- **TVPI** = DPI + RVPI, net of carry.
- **Gross MOIC** = (distributions + NAV) / capital invested in companies (before fees and carry).
- **Net IRR** on yearly LP cash flows; the solver returns the root closest to zero.
- **Waterfall:** LPs receive all commitments first, then (1 − carry) of the rest.

## Monte Carlo (`monte`)

Each run draws every company's outcome independently. Pro-rata is capped by the reserve actually available (unused reserve is returned). Recycled capital goes to winners that exist in that run. The waiting fund makes Series A investments of size Chk, each an outlier with probability pOut / pW. Seeded RNG, so results are reproducible.
