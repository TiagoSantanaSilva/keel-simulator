import { describe, it, expect } from "vitest";
import { DEF } from "../src/config.js";
import { run, monte, irr, grid } from "../src/engine.js";

// Baseline values from the Excel model (Keel_Seed_Fund_Model.xlsx) for the default inputs.
// If a change moves these numbers on purpose, update them here and say why in the commit.
describe("deterministic engine, default inputs", () => {
  const r = run(DEF);

  it("matches the spreadsheet's net TVPI", () => {
    expect(r.T.TVPI).toBeCloseTo(0.624, 3);
    expect(r.K.TVPI).toBeCloseTo(0.811, 3);
    expect(r.W.TVPI).toBeCloseTo(0.896, 3);
  });

  it("matches the spreadsheet's net IRR", () => {
    expect(r.T.irr).toBeCloseTo(-0.0955, 3);
    expect(r.K.irr).toBeCloseTo(-0.0423, 3);
    expect(r.W.irr).toBeCloseTo(-0.0394, 3);
  });

  it("matches the spreadsheet's gross MOIC", () => {
    expect(r.T.MOIC).toBeCloseTo(0.78, 2);
    expect(r.K.MOIC).toBeCloseTo(0.855, 2);
    expect(r.W.MOIC).toBeCloseTo(1.12, 2);
  });

  it("calls exactly the fund size from LPs in every strategy", () => {
    for (const k of ["T", "K", "W"]) expect(r[k].cpaid.at(-1)).toBeCloseTo(DEF.F, 0);
  });

  it("realises every position by the final year", () => {
    for (const k of ["T", "K", "W"]) {
      expect(Math.abs(r[k].nav.at(-1))).toBeLessThan(1);
      expect(r[k].rvpi.at(-1)).toBeCloseTo(0, 6);
    }
  });

  it("keeps TVPI = DPI + RVPI every year", () => {
    for (const k of ["T", "K", "W"])
      r[k].tvpi.forEach((v, i) => expect(v).toBeCloseTo(r[k].dpi[i] + r[k].rvpi[i], 9));
  });

  it("recovers the protected capital from failures", () => {
    expect(r.recK).toBeCloseTo(8_206_297, -1);
  });
});

describe("model invariants", () => {
  it("Keel equals traditional when nothing is protected and there are no fees", () => {
    const p = { ...DEF, U: DEF.U + DEF.P, P: 0, kfee: 0 };
    const r = run(p);
    expect(r.K.TVPI).toBeCloseTo(r.T.TVPI, 9);
  });

  it("a valuation premium lowers Keel's return, all else equal", () => {
    expect(run({ ...DEF, prem: 0.15 }).K.TVPI).toBeLessThan(run(DEF).K.TVPI);
  });

  it("recovers more when more failures are redeemed early", () => {
    expect(run({ ...DEF, c2f: 0 }).recK).toBeGreaterThan(run(DEF).recK);
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
  });
});

describe("exit-size grid", () => {
  it("has 6 rows and 5 columns", () => {
    const g = grid(DEF);
    expect(g.length).toBe(6);
    g.forEach(row => expect(row.length).toBe(5));
  });
});
