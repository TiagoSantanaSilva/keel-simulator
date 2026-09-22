# Keel fund simulator

An interactive simulator for emerging seed-fund GPs, mirroring `Keel_Fund_Model.xlsx`. It compares two ways to deploy the same fund into the same companies:

- **SAFE only:** writes the full check as a single unprotected SAFE.
- **SAFE + Option:** splits the check into an unprotected SAFE plus a Keel Option, which converts in winners and redeems in failures. The SAFE and Option amounts are set independently of the SAFE-only check size.

Every assumption is a slider. The page shows net TVPI, net IRR, gross multiple, DPI and RVPI by year, a 2,000-fund Monte Carlo (with its own IRR distribution), an exit-size grid showing which strategy wins, a founder view, full cash-flow tables, and an XLSX export of everything.

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

Expected-value model with illustrative assumptions. Not a forecast or investment advice. Keel's protection covers company failure only; vault, venue and stablecoin risk on the reserve is not modelled.
