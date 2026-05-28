# MA5 Rate Adequacy Analyzer

An interactive, browser-only rate adequacy analysis tool for extended-service-contract programs. Drop two data files; the app parses and analyzes everything client-side in seconds and renders a BI dashboard.

## What it does

Ingests a **Contracts file** and a **Claims file**, runs a full actuarial rate-adequacy analysis, and renders a four-tab interactive dashboard:

- **Tool** — File upload and ingest summary
- **Guide** — Plain-language methodology explanation
- **Analytics** — Live dashboard with KPI tiles, five exhibits, sensitivity controls, and a KPI table by policy year / SKU
- **Tech** — Architecture and math documentation with code snippets

Nothing leaves the browser. No backend, no upload.

## How to run locally

```bash
npm install
npm run dev
# open http://localhost:5173
```

## How to run tests

```bash
npm test
```

Tests validate the engine against the §6 targets at default parameters (requires `test/fixtures/Contracts.xlsx` and `test/fixtures/Claims.xlsx`). Isolation tests for exclusion logic, exposure math, tail decay, and on-leveling run without fixtures.

## How the analysis works

1. **Ingest** (in a Web Worker): parses XLSX with SheetJS, applies exclusion flags, computes per-contract exposure-years across 20 development quarters, builds 4×20 loss/exposure/count triangles.

2. **Analyze** (pure, synchronous): builds the emergence curve from the credible triangle cells, projects a geometric tail, computes ultimate pure premium, rolls up earned premium and loss ratios, and calculates rate indications by two methods.

3. **Render**: React dashboard. All sensitivity controls (credibility threshold, tail decay, on-level toggle, target LR) recompute the analysis instantly because they only touch the 80-cell triangles, never the raw rows.

See the **Tech** tab in the app or `src/engine/` for details.

## Deploy to Render

A `render.yaml` is included. Connect the repo in Render as a **Static Site** — the build command, publish directory, and SPA route rewrite are pre-configured.

## Methodology reference

Full methodology: see the **Guide** tab in the app.
