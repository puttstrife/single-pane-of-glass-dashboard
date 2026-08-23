# Vantage — Single Pane of Glass Dashboard

An admin dashboard that monitors three websites — **Votive Society**, **Ask Sabrina** (asksabrina.com) and
**Astrolover Sketch** (astroloversketch.com) — on one screen: uptime, load time,
errors, funnel, revenue and engagement.

Static HTML, CSS and vanilla JS. No build step, no dependencies. Open `index.html`
and it runs. The only external request is DM Sans from Google Fonts; the page falls
back to the system sans if it is blocked.

## Run it

```bash
python3 -m http.server 4321
```

Then open http://localhost:4321.

## What's on the pane

| Block | Question it answers |
|---|---|
| Incident banner | Is something broken right now, on which site, since when? |
| Revenue hero | How much money, and which way is it moving? |
| Traffic & conversion tiles | Sessions, conversion, bounce, returning users — vs. the prior equal period |
| Site health | Uptime, median load, error rate, failed API calls, JS errors, rage clicks, per site |
| Needs attention | Every metric outside its threshold, worst first, computed not hand-written |
| Revenue by day | Daily revenue per site over the range |
| Page load by day | Daily median load per site against the target line |
| Funnel | Where users drop out — whole site, or the chat surface for sites that have one |
| Page versions | Every landing / main / chat version side by side: sessions, conversion, revenue per session, bounce, load |
| Traffic mix | Which sources bring the sessions |
| Scoreboard | Every site, every headline metric — including the source's biggest-drop column and a revenue trend line |
| Email | Sent, open, click, unsub and click-to-open per site, plus campaigns ranked by open rate and top buyers by revenue |
| Chat & retention | Chat surface, sessions, messages per session, average length, drop before purchase, retention |

The sidebar carries the product mark, the site list, the density switch and the
account block; only the site list scrolls, so the controls stay put. It picks the
site — and expands into that site's pages, so you can scope
the whole pane to a single landing version or chat entry. The pill picks the range
(7 / 30 / 90 days). Both scope every block at once — no per-card filters.

Ask Sabrina runs five landing versions plus its main site and two chat entries;
Astrolover Sketch runs two landing versions, its main site and two Sketch Chat
entries; Votive Society is a single surface, so it gets no comparison card.

## Fitting on a screen

A pane you scroll for six screens is not a single pane. Three things keep it short,
and none of them hide a number behind a tab:

- **Every grid row is paired**, so no half-row is left empty — health beside
  alerts, the two charts together, scoreboard beside chat.
- **Long lists scroll inside their card** instead of stretching it: page versions,
  site health, the alert list, campaigns and top buyers each get a fixed window
  with a sticky header.
- **Cards fold.** The chevron in any card header collapses it, and the choice is
  remembered per card. The three reference blocks — traffic mix, email, chat and
  retention — start folded, because they are looked up rather than watched.
- **Sidebar sites fold too**, from their own chevron, independently of which site
  is selected: open one site's page list without leaving the site you are reading,
  or collapse an eight-version list to reach the site under it. Remembered per site.
- **A density switch** in the header trades whitespace for rows; it is remembered
  too, and it shrinks chart heights and row pitch, not just padding.

At a 900px viewport: 6.1 screens before, 3.5 comfortable, **2.6 compact**, and 1.0
with everything folded — which makes an all-folded pane a usable status overview in
its own right.

## Relationship to the source design

This is a restructure of the **Website Performance Dashboard** design canvas
(`design/Website Performance Dashboard (standalone).html`). Its visual system is
adopted as-is; its information architecture is not.

**Kept verbatim:** DM Sans at `letter-spacing: -0.3px`, brand `#422AFB` /
`#3311DB`, ink `#1B2559`, muted `#A3AED0`, border `#E9EDF7`, plane `#F4F7FE`,
white cards at 20px radius under `14px 17px 40px 4px rgba(112,144,176,0.08)`, the
240px sticky sidebar, the segmented range pill, and the uppercase table head. Its
sites, funnel losses, traffic mixes, UX figures, email stats and chat metrics are
all preserved as the anchor values for the data.

**Restructured, and why:**

| Source | Here |
|---|---|
| 9 tabs per site (Overview, Traffic, Funnel, Revenue, Marketing, Chat, Retention, UX, Email) | One pane. Health, funnel, revenue and engagement are visible together, because that is how you tell a slow site from a badly converting one. |
| Pre-formatted strings (`'18.4k'`, `'-61%'`), with longer ranges faked by multiplying the 7-day number by 4.1 or 12.6 | 90 days of daily rows per site. Ranges, deltas, averages and trends are computed from them, so 30d is really 30 days. |
| Seven CSS `div` bars with no axis, scale, or values | SVG line charts with axes, a target rule, crosshair tooltips, direct end-labels and a table twin. |
| A hardcoded "Insights" list | Alerts computed from thresholds and period deltas, sorted worst-first and capped at six. |
| Trend shown as a red or green arrow | Status as icon + label + colour, so it survives colourblindness and greyscale. |
| Hover-only tooltips on `div`s | Buttons with `aria-label`s, keyboard focus showing the same as hover, and a table view behind every chart. |
| Five sub-pages per site listed in the sidebar, with no data behind them | Pages are the grain the data is generated at. Every metric exists per page, the sidebar expands into them, and selecting one scopes the entire pane — including its own funnel for chat entries. |
| No way to compare landing versions | A Page versions card ranks every version on conversion, with revenue-per-session, bounce and load beside it, and states the gap in money. Comparisons are like-for-like: landing against landing, chat against chat. |
| Email tab per site, three clicks from the overview | An Email card on the pane: the same figures, plus click-to-open, benchmark colouring, and campaigns ranked by open rate across all sites at once. |
| Top-buyer names with email addresses | Kept as a ranked top-buyers list, without the contact details. A dashboard that gets shared around does not need customer email addresses on screen — say the word and the column comes back. |
| `biggestDrop` computed but shown only as text in one table | Kept as a scoreboard column, naming the step and the loss, and it feeds the alert list. |

**One inconsistency in the source, carried nowhere:** its `conv` figures only
reconcile for Votive Society (3.8% × 18.4k users ≈ 698 orders). For Ask Sabrina and
Astrolover Sketch the stated conversion does not produce the stated order count.
Conversion here is computed as orders ÷ sessions throughout rather than copying a
number that does not add up.

## Swap in your own data

`assets/data.js` assigns one object to `window.DASHBOARD_DATA`:

```js
window.DASHBOARD_DATA = {
  meta:       { title, generated, days, note, currency },
  thresholds: { uptime, loadMs, errorRate, failedApi, bounce },  // { good, warning }
  ranges:     [{ id, label, days }],
  dates:      ['2026-05-26', …],                                  // ascending
  sites:      [{ id, name, domain, slot, aov, retention, hasChat, chatLabel, chat,
                 pages: [{ id, name, kind, share }],   // kind: landing | main | chat
                 funnel, chatFunnel, sources, email }],
  daily:      [{ date, site, page, sessions, users, newUsers, returningUsers,
                 orders, revenue, adSpend, bounce, loadMs, errorRate, failedApi,
                 jsErrors, rageClicks, incident }],
  siteDaily:  [{ date, site, uptime }],
};
```

`daily` is **per page per day**; site figures are summed from it, so the scorecard
and the Page versions card can never disagree. Rates (load, bounce, error, failed
API) roll up session-weighted, not as a flat average, so a low-traffic version
cannot drag the site number. Uptime lives in `siteDaily` because it is an
infrastructure fact about the host, not about one page.

```text
```

`slot` picks the site's chart colour (1–3). Thresholds drive every status pill and
alert, so tune them per your SLOs before trusting the colours. `uptime`,
`emailOpen` and `emailClick` are graded higher-is-better; everything else is a
fault, where lower is better. The email benchmarks are industry rules of thumb
rather than anything from the source — replace them with your own list history.

The bundled data comes from `node scripts/generate-data.mjs` — seeded, so
regenerating produces no diff. It is fabricated: the site-level anchors are the
source canvas's own figures, but the split across page versions, the per-version
conversion differences, and the two incidents are invented to give the pane
something to detect. Replace it before showing anyone numbers meant to be real.

Two seeded incidents drive the banner and the load chart: a four-day chat-bundle
regression on Ask Sabrina's chat entries (resolved), and a Sketch canvas asset
regression on Astrolover Sketch's chat entries that starts on day 48 and never
recovers. Delete them from `scripts/generate-data.mjs` for a clean baseline.

## Admin shell

The account block at the foot of the sidebar is a **placeholder**: it opens, closes
on outside click or Escape, and returns focus, but its three items do nothing. Wire
them to your admin's auth before shipping, and replace the "Admin User /
admin@example.com" identity with the signed-in one.

## Icons

[Lucide](https://lucide.dev) (ISC), **inlined** in `assets/icons.js` rather than
loaded from a CDN — the published page runs under a Content-Security-Policy that
blocks external scripts, and inlining keeps the file openable straight from disk.
Only the 20 icons actually used are bundled, at about 3KB.

Every icon sits beside text that carries the same meaning, so all of them are
`aria-hidden` — status is still icon **plus** label, never icon alone. Refresh them
with `scripts/fetch-icons.sh`.

## Design notes

- **The series palette is validated, not eyeballed.** The three site hues —
  `#422AFB` (brand), `#0F9B9B`, `#E8730C` — clear the lightness-band, chroma,
  contrast and colourblind gates against the white card surface on *all* pairs, not
  just adjacent ones, which is the bar line charts need (worst pair CVD ΔE 14.9,
  normal-vision 26.9). The funnel uses a brand-hue ordinal ramp
  (`#A99CFD → #3311DB`) whose light end clears 2:1.
- **Status colours are separate from series colours.** Good `#01B574` and critical
  `#E31A1A` come from the source system; warning `#FFB547` is an addition, as the
  source had no at-risk state. Status never appears without its icon and label.
- **Light-only**, as the source system is. Tokens live in one `:root` block, so a
  dark set is a single addition.
- **No dual axes anywhere.** Revenue and load time get their own charts.
- **Funnel bars are scaled to the step rate**, not to the top of the funnel — the
  first stage dwarfs the last, and a shared scale leaves the tail invisible.
- **Colour follows the site, not its rank.** Filtering dims the others rather than
  recolouring the survivors.
- **Eight pages are never eight lines.** Only the all-sites view is multi-series,
  because three hues are what passed validation. Page comparison is bars in a
  sorted table, which is the right form for many nominal categories anyway.
- **One scrollbar treatment everywhere.** The document, the sidebar, the capped
  card lists and the wide tables share a single rule, so none of them falls back to
  the browser default beside a styled one. `color-scheme` is pinned with it: a
  scrollbar otherwise takes its colour from the host page's scheme, which paints a
  dark bar across a white card in a dark-themed host.
- Thin marks, hairline gridlines, and direct labels used sparingly — line ends and
  the funnel bar ends — rather than a number on every point.

## Layout

```
index.html                 markup, sidebar shell and card grid
assets/styles.css          design-system tokens + components
assets/app.js              state, filters, SVG charts, tables, alerts
assets/icons.js            inlined Lucide icon set (window.LUCIDE)
assets/data.js             generated dataset (window.DASHBOARD_DATA)
data/metrics.json          same dataset as JSON
scripts/generate-data.mjs  seeded generator, anchored to the source figures
scripts/fetch-icons.sh     refetches the Lucide icons used here
design/                    the source design canvas this is built from
```
