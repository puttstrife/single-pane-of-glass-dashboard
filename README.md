# Mettlence BI — dummy-data React dashboard

A dark-first **React + TypeScript + Vite + Tailwind + shadcn/ui + Recharts** business-intelligence frontend prototype. It visualizes deterministic fixtures only for **Votive Society**, **Individualogist**, **Astrolover Sketch**, and **Ask Sabrina**.

## Safety and analytical boundaries

- **Dummy data; no live connection.** The active `src/` app makes no provider/API requests, reads no local artifacts outside this worktree, uses no credentials, and stores no browser state.
- Figures and freshness/provenance labels are illustrative deterministic fixtures.
- The period selector scopes **Maropost email** and **AdSense** only. CPV is a property-scoped latest/lifetime-style dummy snapshot; its period filter does not apply.
- No combined AdSense + CPV revenue total is shown. Maropost engagement is not attributed revenue, and no subscriber identity data is shown.
- This is not a deployment or live-data integration.

The old vanilla files remain only as inactive historical/reference material. `index.html` loads the Vite React entry point, not legacy assets.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test       # focused dashboard acceptance contract
npm run check  # TypeScript no-emit check
npm run build  # test + type check + Vite production build
```
