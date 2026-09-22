import { describe, it, expect } from "vitest";
import { DEF } from "../src/config.js";
import { run, monte, irr, YR } from "../src/engine.js";

// Baseline values from Keel_Fund_Model.xlsx (Fund Model tab), adapted for four deliberate
// deviations from the workbook:
// 1. Keel pricing is a single flat annual reserve fee (`keelFee`) instead of the workbook's
//    tiered licence + banded annual fee, at the user's request for a simpler pricing control.
//    That drops the one-off licence fee ($10,000 in the workbook's base case).
// 2. Recycling has no cap (the workbook's `recCap` has been removed), at the user's request.
//    The default recShare (50%) no longer gets capped at 15% of fund size, so recycled/
//    distFromRedK are higher than an uncapped-vs-capped comparison would otherwise show.
// 3. Follow-on and recycled capital no longer have their own blended `foMult`/`recMult`.
//    Both are split evenly per surviving company and each company's tranche earns *that
//    company's own* outcome multiple and exit year (from the Outcomes table), at the user's
//    request -- there was no basis for follow-on money to earn a flat return disconnected
//    from which company it actually went into. At the default outcome mix, this raises the
//    effective follow-on multiple from a flat 3x to a share-weighted ~8x, since a slice of
//    every follow-on dollar now rides the outlier multiple. TVPI/IRR are both substantially
//    higher than before as a result -- this is the expected effect of the change, not drift.
// 4. Keel fees now accrue starting the same year the check is written (year 1), not year 2.
//    The old `t>=1&&t<=dConv`/`t>=1&&t<=dRed` conditions charged the first fee a year late --
//    inconsistent with the management fee and the initial capital call, both of which start
//    at year 1, and with the fact that the conversion/redemption decision itself already
//    fires correctly at year `dConv`/`dRed`+1 elsewhere in the model. Fixed to `t<dConv`/
//    `t<dRed`. Total fee dollars are unchanged (still `dConv`/`dRed` years' worth); paying
//    them a year earlier costs LPs a bit more time value, so K.irr drops very slightly.
// If a change moves these numbers on purpose, update them here and say why in the commit.
describe("deterministic engine, default inputs", () => {
  const r = run(DEF);

  it("matches the expected net TVPI", () => {
    expect(r.T.TVPI).toBeCloseTo(2.4528, 3);
    expect(r.K.TVPI).toBeCloseTo(3.40384, 3);
  });

  it("matches the expected net IRR", () => {
    expect(r.T.irr).toBeCloseTo(0.1580622813, 3);
    expect(r.K.irr).toBeCloseTo(0.2293210558, 3);
  });

  it("matches the expected gross multiple", () => {
    expect(r.grossMultipleT).toBeCloseTo(2.816, 2);
    expect(r.grossMultipleK).toBeCloseTo(4.0048, 2);
  });

  it("matches the expected DPI at year 4 and year 6", () => {
    expect(r.K.dpi[3]).toBeCloseTo(0.1909090909, 3);
    expect(r.K.dpi[5]).toBeCloseTo(0.1826086957, 3);
  });

  it("matches the expected fees, recoveries and write-offs", () => {
    expect(r.feesK).toBeCloseTo(2020000, -1);
    expect(r.recoveredK).toBeCloseTo(16800000, -1);
    expect(r.recycledK).toBeCloseTo(8400000, -1);
    expect(r.distFromRedK).toBeCloseTo(8400000, -1);
    expect(r.writeOffT).toBeCloseTo(22400000, -1);
    expect(r.writeOffK).toBeCloseTo(7620000, -1);
  });

  it("calls exactly the fund size from LPs in every strategy", () => {
    for (const k of ["T", "K"]) expect(r[k].cpaid.at(-1)).toBeCloseTo(DEF.F, 0);
  });

  it("realises every position by the final year", () => {
    for (const k of ["T", "K"]) {
      expect(Math.abs(r[k].nav.at(-1))).toBeLessThan(1);
      expect(r[k].rvpi.at(-1)).toBeCloseTo(0, 6);
      expect(r[k].tvpi.at(-1)).toBeCloseTo(r[k].dpi.at(-1), 6);
    }
  });

  it("keeps TVPI = DPI + RVPI every year", () => {
    for (const k of ["T", "K"])
      r[k].tvpi.forEach((v, i) => expect(v).toBeCloseTo(r[k].dpi[i] + r[k].rvpi[i], 9));
  });

  it("has 12 years, labelled 1 to 12", () => {
    expect(YR).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  it("computes an IRR-to-date for every year, and the last point matches the final net IRR", () => {
    for (const k of ["T", "K"]) {
      expect(r[k].irrToDate.length).toBe(12);
      expect(r[k].irrToDate.at(-1)).toBeCloseTo(r[k].irr, 6);
    }
  });

  it("IRR-to-date marks unrealised NAV as an inflow, so it isn't NaN as soon as distributions start", () => {
    // The plain net-cash-flow IRR (no NAV) would still be NaN for several years after the
    // first distribution, since paid-in usually still exceeds distributions alone. Marking
    // the remaining NAV to cost gives a usable estimate much earlier.
    const k = r.K;
    const firstPositiveDistYear = k.lpd.findIndex(v => v > 0);
    expect(firstPositiveDistYear).toBeGreaterThan(-1);
    expect(Number.isNaN(k.irrToDate[firstPositiveDistYear])).toBe(false);
  });
});

describe("informational-only inputs", () => {
  it("round valuation and total convertible amount don't affect returns", () => {
    const base = run(DEF);
    const r = run({ ...DEF, roundVal: 25e6, totalOpt: 5e6 });
    expect(r.T.TVPI).toBeCloseTo(base.T.TVPI, 9);
    expect(r.K.TVPI).toBeCloseTo(base.K.TVPI, 9);
  });
});

describe("model invariants", () => {
  it("Keel equals SAFE only when the whole check is unprotected and there are no fees", () => {
    const p = { ...DEF, safeK: DEF.safeK + DEF.optK, optK: 0, checkT: DEF.safeK + DEF.optK, keelFee: 0 };
    const r = run(p);
    expect(r.K.TVPI).toBeCloseTo(r.T.TVPI, 6);
  });

  it("a valuation premium lowers the Option strategy's return, all else equal", () => {
    expect(run({ ...DEF, premium: 0.15 }).K.TVPI).toBeLessThan(run(DEF).K.TVPI);
  });

  it("recovers more capital when more failures are redeemed", () => {
    expect(run({ ...DEF, redRate: 0.9 }).recoveredK).toBeGreaterThan(run(DEF).recoveredK);
  });

  it("recycled capital is uncapped: recycled = recovered * recShare exactly", () => {
    const r = run({ ...DEF, redRate: 1, recShare: 0.8 });
    expect(r.recycledK).toBeCloseTo(r.recoveredK * 0.8, 0);
  });

  it("Keel fees never push the fund's total paid-in above what the fee formula implies", () => {
    const r = run(DEF);
    expect(r.feesK).toBeCloseTo(r.d.totalFees, -1);
  });
});

describe("irr", () => {
  it("solves a simple case", () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 6);
  });
  it("returns NaN when there is no root", () => {
    expect(Number.isNaN(irr([100, 100]))).toBe(true);
  });
});

describe("Monte Carlo", () => {
  it("is reproducible (seeded)", () => {
    const a = monte(DEF, 500), b = monte(DEF, 500);
    expect(a.K.mean).toBe(b.K.mean);
  });
  it("averages close to the deterministic result", () => {
    const mc = monte(DEF, 3000), r = run(DEF);
    expect(mc.T.mean).toBeCloseTo(r.T.TVPI, 1);
    expect(mc.K.mean).toBeCloseTo(r.K.TVPI, 1);
    expect(mc.T.irrMean).toBeCloseTo(r.T.irr, 1);
    expect(mc.K.irrMean).toBeCloseTo(r.K.irr, 1);
  });
  it("runs fast enough to stay interactive", () => {
    const t0 = Date.now();
    monte(DEF, 2000);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});


describe("outcome buckets", () => {
  it("is a plain array of {label, share, mult, exit}, and the shares (plus failure) sum to 100%", () => {
    expect(Array.isArray(DEF.outcomes)).toBe(true);
    expect(DEF.outcomes.length).toBeGreaterThan(0);
    DEF.outcomes.forEach(o => {
      expect(typeof o.label).toBe("string");
      expect(typeof o.share).toBe("number");
      expect(typeof o.mult).toBe("number");
      expect(typeof o.exit).toBe("number");
    });
    const sum = DEF.sh0 + DEF.outcomes.reduce((a, o) => a + o.share, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("supports adding and removing rows freely", () => {
    const extra = { ...DEF, outcomes: [...DEF.outcomes, { label: "Mega outlier", share: 0, mult: 500, exit: 9 }] };
    expect(() => run(extra)).not.toThrow();
    const fewer = { ...DEF, sh0: DEF.sh0 + DEF.outcomes[DEF.outcomes.length - 1].share, outcomes: DEF.outcomes.slice(0, -1) };
    expect(() => run(fewer)).not.toThrow();
  });

  it("maps each Monte Carlo bucket to the right multiple and exit year (regression guard for the array-index refactor)", () => {
    // Certainty scenarios: every non-failed position lands in exactly one bucket, so the
    // random run should match the deterministic run almost exactly (no averaging noise).
    DEF.outcomes.forEach((_, idx) => {
      const p = { ...DEF, sh0: 0, outcomes: DEF.outcomes.map((o, i) => ({ ...o, share: i === idx ? 1 : 0 })) };
      const det = run(p), mc = monte(p, 400);
      expect(mc.K.mean).toBeCloseTo(det.K.TVPI, 6);
      expect(mc.T.mean).toBeCloseTo(det.T.TVPI, 6);
    });
  });
});
