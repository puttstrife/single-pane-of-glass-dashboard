# Mettlence BI — dummy-data frontend prototype

This repository contains a **static, dummy-data-only business-intelligence frontend** for these in-scope properties: **Votive Society**, **Individualogist**, **Astrolover Sketch**, and **Ask Sabrina**. `Unassigned / needs mapping` is an extensibility and mapping-status category, not a property.

## Prototype boundaries

- **No production deployment.** This is not a production dashboard.
- **No APIs, connectors, backend code, credentials, local-data reads outside this worktree, or storage.** It makes no live requests and does not use browser storage.
- Every number, trend, funnel, provenance badge, freshness label, and decision card is **clearly labelled dummy/illustrative data**.
- The intended eventual model is a **read-only display of authoritative cron-produced artifacts**. This prototype neither creates nor claims to consume those artifacts.

## What it demonstrates

- Business navigation: Overview, Email performance, Paid & monetization, Audience readiness, Insights & decisions, and a Data status drawer.
- Property controls deterministically recompute compatible illustrative fixtures; the dummy period scopes Maropost email and AdSense only. CPV remains a property-scoped latest snapshot/lifetime-style fixture, not period revenue; no controls query, persist, or represent live data.
- Source-separated Maropost engagement (Sent → Delivered → Opened → Clicked), CPV (Views → Clicks → Conversions), AdSense domain trend, campaign comparison, readiness coverage, and decision hypotheses.
- Explicit analytical boundaries: no combined AdSense+CPV revenue total; CPV is snapshot/lifetime-style dummy economics; Maropost engagement is not attributed revenue; and no subscriber identity data is shown.

## Run locally

No dependency installation or build is required:

```bash
python3 -m http.server 4321
```

Open `http://localhost:4321` in a browser.

## Local checks

```bash
node scripts/check-dashboard.mjs
node --check assets/app.js
node --check assets/data.js
python3 -m json.tool data/metrics.json >/dev/null
```

The focused acceptance guard verifies required navigation/disclosure and core business sections, rejects excluded property names and legacy concepts, checks that scope controls invoke the renderer, enforces programmatic main-content focus, checks a structural mobile grid rule, and rejects network mechanisms/external URLs plus browser storage usage across active UI files.
