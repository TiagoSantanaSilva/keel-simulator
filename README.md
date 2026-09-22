# Keel fund simulator

An interactive simulator for emerging seed-fund GPs. It compares three ways to deploy the same fund into the same companies:

- **Traditional:** writes the full check at seed, unprotected.
- **Keel:** writes part of the check upfront and puts the rest into a Keel protected position, which converts in winners and is redeemed in failures.
- **Waiting:** skips the seed and invests at the Series A, only in companies that raise one.

Every assumption is a slider. The page shows net TVPI, IRR, gross MOIC, DPI and RVPI by year, a 2,000-fund Monte Carlo, an exit-size grid showing which strategy wins, a founder view, full cash flow tables, and a CSV export of everything.

## Run it

```bash
npm install
npm run dev      # local dev server
npm test         # model tests
npm run build    # static site in dist/
```

## Project layout

| Path | What it holds |
|---|---|
| `src/engine.js` | The model. Pure functions, no DOM: `derive`, `run`, `metrics`, `irr`, `monte`, `grid`. |
| `src/config.js` | Input schema (sliders), defaults and presets. |
| `src/format.js` | Number formatting. |
| `src/main.js` | UI: controls, charts, tables, export. |
| `src/styles.css` | Styles, light and dark themes. |
| `tests/engine.test.js` | Baseline values from the Excel model plus model invariants. |
| `docs/model-spec.md` | Every assumption and formula, in plain language. |

## Deploy

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and publishes to GitHub Pages on every push to `main`. Enable it under **Settings → Pages → Source: GitHub Actions**.

## Caveats

Expected-value model with illustrative assumptions. Not a forecast or investment advice. Keel's protection covers company failure only; vault, venue and stablecoin risk on the reserve is not modelled. The waiting fund assumes full Series A allocation and a much larger pipeline, which flatters it.
