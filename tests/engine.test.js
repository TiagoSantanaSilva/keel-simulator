import { describe, it, expect } from "vitest";
import { DEF, OUTCOMES } from "../src/config.js";
import { run, monte, irr, grid, YR } from "../src/engine.js";

// Baseline values from Keel_Fund_Model.xlsx (Fund Model tab), adapted for one deliberate
// deviation from the workbook: Keel pricing is a single flat annual reserve fee (`keelFee`)
// instead of the workbook's tiered licence + banded annual fee, at the user's request for a
// simpler pricing control. That drops the one-off licence fee ($10,000 in the workbook's base
// case), so `feesK`/`writeOffK` are $10,000 lower than the workbook's own cached values, and
// TVPI/IRR are fractionally higher. Everything else (cash-flow timing, waterfall, recycling)
// still matches the workbook exactly. If a change moves these numbers on purpose, update them
// here and say why in the commit.
describe("deterministic engine, default inputs", () => {
  const r = run(DEF);

  it("matches the expected net TVPI", () => {
    expect(r.T.TVPI).toBeCloseTo(1.8128, 3);
    expect(r.K.TVPI).toBeCloseTo(2.22464, 3);
  });

  it("matches the expected net IRR", () => {
    expect(r.T.irr).toBeCloseTo(0.1036283447, 3);
    expect(r.K.irr).toBeCloseTo(0.1477961151, 3);
  });

  it("matches the expected gross multiple", () => {
    expect(r.grossMultipleT).toBeCloseTo(2.016, 2);
    expect(r.grossMultipleK).toBeCloseTo(2.5308, 2);
  });

  it("matches the expected DPI at year 4 and year 6", () => {
    expect(r.K.dpi[3]).toBeCloseTo(0.2113636364, 3);
    expect(r.K.dpi[5]).toBeCloseTo(0.202173913, 3);
  });

  it("matches the expected fees, recoveries and write-offs", () => {
    expect(r.feesK).toBeCloseTo(2020000, -1);
    expect(r.recoveredK).toBeCloseTo(16800000, -1);
    expect(r.recycledK).toBeCloseTo(7500000, -1);
    expect(r.distFromRedK).toBeCloseTo(9300000, -1);
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

  it("computes an IRR-to-date for every year, converging to the final IRR", () => {
    for (const k of ["T", "K"]) {
      expect(r[k].irrToDate.length).toBe(12);
      expect(r[k].irrToDate.at(-1)).toBeCloseTo(r[k].irr, 6);
    }
  });
});

describe("informational-only inputs", () => {
  it("round valuation and total Option amount don't affect returns", () => {
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

  it("recycled capital is capped at the recycling cap (% of fund size)", () => {
    const r = run({ ...DEF, redRate: 1, recShare: 1, recCap: 0.01 });
    expect(r.recycledK).toBeCloseTo(DEF.F * 0.01, -1);
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

describe("premium vs redemption-rate grid", () => {
  it("has 5 rows and 6 columns", () => {
    const g = grid(DEF);
    expect(g.length).toBe(5);
    g.forEach(row => expect(row.length).toBe(6));
  });

  it("actually flips the winner somewhere in the grid", () => {
    // Regression guard: an earlier version of this grid varied the outcome multiples, which
    // scale both strategies' success case equally and so never change who wins -- every cell
    // showed Keel, which is not useful as a "which strategy wins" chart. Premium and
    // redemption rate are what actually drive the failure-side economics that decide it.
    const g = grid(DEF);
    const results = g.flat().map(c => c.K >= c.T);
    expect(results.some(v => v)).toBe(true);
    expect(results.some(v => !v)).toBe(true);
  });
});

describe("outcome buckets", () => {
  it("has no 'returns capital' bucket, and the remaining shares still sum to 100%", () => {
    expect(OUTCOMES.some(([shK]) => shK === "sh1")).toBe(false);
    const sum = OUTCOMES.reduce((a, [shK]) => a + DEF[shK], 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("maps each Monte Carlo bucket to the right multiple and exit year (regression guard for the SUCCESS-array refactor)", () => {
    // Certainty scenarios: every non-failed position lands in exactly one bucket, so the
    // random run should match the deterministic run almost exactly (no averaging noise).
    for (const [shK, mulK, exK] of OUTCOMES.filter(([, mulK]) => mulK)) {
      const p = { ...DEF, sh0: 0, sh2: 0, sh3: 0, sh4: 0, [shK]: 1 };
      const det = run(p), mc = monte(p, 400);
      expect(mc.K.mean).toBeCloseTo(det.K.TVPI, 6);
      expect(mc.T.mean).toBeCloseTo(det.T.TVPI, 6);
    }
  });
});
