/**
 * Builds the dataset the dashboard runs on.
 *
 * The shape and the anchor numbers come from the source design canvas
 * (design/Website Performance Dashboard (standalone).html), whose figures are
 * 7-day totals. That file stores everything as pre-formatted strings and fakes
 * longer ranges by multiplying them, so there is no real history to plot. Here
 * those anchors are expanded into 90 days of daily rows — weekday seasonality,
 * a per-site trend, seeded noise, and a few deliberate incidents — so period
 * comparisons and time series are computed rather than invented at render time.
 *
 * Deterministic (seeded LCG): re-running produces no diff.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

let seed = 20260823;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const jitter = (amp) => 1 + (rand() - 0.5) * amp;

const DAYS = 90;
const LAST_DAY = '2026-08-23';

function dateSeries(days, last) {
  const end = new Date(last + 'T00:00:00Z');
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
const dates = dateSeries(DAYS, LAST_DAY);

// Weekend traffic dips; Tue-Thu peak. Indexed by UTC day of week.
const WEEKDAY = [0.82, 1.04, 1.10, 1.09, 1.03, 0.94, 0.84];

const SITES = [
  {
    id: 'votive', name: 'Votive Society', domain: 'votivesociety.com', slot: 1,
    week: { sessions: 24600, users: 18400, newUsers: 14100, returningUsers: 4300, orders: 698, revenue: 40200, adSpend: 6400 },
    aov: 57.60, trend: 0.0016,
    funnel: [['Landing', 0], ['Start', 20], ['Lead', 38], ['Checkout', 50], ['Purchase', 61]],
    sources: [['Organic search', 44], ['Direct', 24], ['Paid social', 18], ['Referral', 14]],
    ux: { loadMs: 1600, bounce: 0.41, errorRate: 0.014, rageClicks: 210, jsErrors: 38, failedApi: 0.006, uptime: 0.9995 },
    email: { sent: 38000, open: 0.27, click: 0.031, unsub: 0.004,
      campaigns: [['New arrivals', 0.30], ['Restock alert', 0.24]],
      topBuyers: [['Marta Lindqvist', 1240], ['Devon Achebe', 980], ['Priya Nair', 860], ['Sam Okafor', 790], ['Iris Bergman', 705]] },
    retention: 0.29, hasChat: false,
    // No variants in the source for this site — one surface, so no A/B card.
    pages: [
      { id: 'main', name: 'Main web', kind: 'main', share: 1, conv: 1, bounce: 0, load: 1 },
    ],
    incidents: [],
  },
  {
    id: 'sabrina', name: 'Ask Sabrina', domain: 'asksabrina.com', slot: 2,
    week: { sessions: 17200, users: 12600, newUsers: 9400, returningUsers: 3200, orders: 906, revenue: 28100, adSpend: 5100 },
    aov: 31.02, trend: 0.0026,
    funnel: [['Landing', 0], ['Start', 25], ['Lead', 45], ['Checkout', 60], ['Purchase', 71]],
    chatFunnel: [['Open chat', 0], ['Engaged', 40], ['Lead', 60], ['Checkout', 75], ['Purchase', 83]],
    sources: [['Paid social', 38], ['Organic search', 30], ['Direct', 20], ['Referral', 12]],
    ux: { loadMs: 1800, bounce: 0.46, errorRate: 0.021, rageClicks: 340, jsErrors: 61, failedApi: 0.011, uptime: 0.9988 },
    email: { sent: 42000, open: 0.31, click: 0.042, unsub: 0.006,
      campaigns: [['Weekly reading digest', 0.38], ['Re-engagement', 0.19]],
      topBuyers: [['Yuki Tanaka', 610], ['Carla Mendes', 540], ['Theo Nilsen', 495], ['Zara Hassan', 460], ['Léa Dupont', 410]] },
    retention: 0.22, hasChat: true, chatLabel: 'Chat',
    chat: { sessionsShare: 0.395, msgsPerSession: 7.4, avgSeconds: 260 },
    // Five landing versions in rotation, plus the main site and two chat entries.
    pages: [
      { id: 'landing-v1', name: 'Landing v1', kind: 'landing', share: 0.110, conv: 1.00, bounce: 0.00, load: 1.00 },
      { id: 'landing-v2', name: 'Landing v2', kind: 'landing', share: 0.100, conv: 1.22, bounce: -0.05, load: 0.95 },
      { id: 'landing-v3', name: 'Landing v3', kind: 'landing', share: 0.090, conv: 0.78, bounce: 0.07, load: 1.15 },
      { id: 'landing-v4', name: 'Landing v4', kind: 'landing', share: 0.070, conv: 0.91, bounce: 0.02, load: 1.05 },
      { id: 'landing-v5', name: 'Landing v5', kind: 'landing', share: 0.050, conv: 1.09, bounce: -0.02, load: 0.98 },
      { id: 'main', name: 'Main web', kind: 'main', share: 0.185, conv: 1.05, bounce: -0.03, load: 1.00 },
      { id: 'chat-1', name: 'Chat 1', kind: 'chat', share: 0.220, conv: 1.15, bounce: -0.06, load: 1.25 },
      { id: 'chat-2', name: 'Chat 2', kind: 'chat', share: 0.175, conv: 0.95, bounce: 0.01, load: 1.30 },
    ],
    // Chat bundle regression: slow loads and failed calls for four days, on the
    // chat entries only — which is why it is worth having page-level rows.
    incidents: [{ from: 62, to: 66, pages: ['chat-1', 'chat-2'], loadMult: 1.9, failedApiMult: 3.4, uptimeDrop: 0.004, label: 'Chat bundle regression' }],
  },
  {
    id: 'astro', name: 'Astrolover Sketch', domain: 'astroloversketch.com', slot: 3,
    week: { sessions: 25800, users: 18100, newUsers: 15000, returningUsers: 3100, orders: 812, revenue: 23000, adSpend: 4200 },
    aov: 28.32, trend: 0.0009,
    funnel: [['Landing', 0], ['Start', 22], ['Lead', 42], ['Checkout', 55], ['Purchase', 66]],
    chatFunnel: [['Open Sketch Chat', 0], ['Engaged', 35], ['Lead', 55], ['Checkout', 68], ['Purchase', 77]],
    sources: [['Organic search', 40], ['Paid social', 26], ['Direct', 22], ['Referral', 12]],
    ux: { loadMs: 2000, bounce: 0.50, errorRate: 0.018, rageClicks: 275, jsErrors: 52, failedApi: 0.009, uptime: 0.9991 },
    email: { sent: 21000, open: 0.24, click: 0.028, unsub: 0.005,
      campaigns: [['New moon reading', 0.29], ['Sketch tips', 0.18]],
      topBuyers: [['Noah Kessler', 385], ['Amara Diallo', 340], ['Felix Storm', 298], ['Ingrid Solberg', 275], ['Ravi Deshmukh', 240]] },
    retention: 0.26, hasChat: true, chatLabel: 'Sketch Chat',
    chat: { sessionsShare: 0.353, msgsPerSession: 5.2, avgSeconds: 185 },
    pages: [
      { id: 'landing-1', name: 'Landing 1', kind: 'landing', share: 0.210, conv: 0.94, bounce: 0.03, load: 1.05 },
      { id: 'landing-2', name: 'Landing 2', kind: 'landing', share: 0.170, conv: 1.12, bounce: -0.04, load: 0.97 },
      { id: 'main', name: 'Main web', kind: 'main', share: 0.267, conv: 1.02, bounce: 0.00, load: 1.00 },
      { id: 'chat-1', name: 'Sketch Chat 1', kind: 'chat', share: 0.200, conv: 1.08, bounce: -0.02, load: 1.40 },
      { id: 'chat-2', name: 'Sketch Chat 2', kind: 'chat', share: 0.153, conv: 0.86, bounce: 0.05, load: 1.45 },
    ],
    // Sketch canvas ships a heavier asset; load steps up on the chat surfaces and
    // never recovers.
    incidents: [{ from: 48, to: 89, pages: ['chat-1', 'chat-2'], loadMult: 1.35, failedApiMult: 1.4, uptimeDrop: 0.0006, label: 'Sketch canvas asset regression' }],
  },
];

/* Rows are generated per PAGE, then summed to the site. Doing it the other way
   round lets the two disagree; this way the scorecard and the page-versions card
   are always the same numbers read at two grains. Uptime stays site-level — it is
   an infrastructure fact, not a per-page one. */
const daily = [];
const siteDaily = [];

SITES.forEach((s) => {
  // Conversion multipliers are relative, so normalise them by session share:
  // the blended site conversion has to stay on the source's anchor.
  const convNorm = s.pages.reduce((a, p) => a + p.share * p.conv, 0);

  dates.forEach((date, i) => {
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    const shape = WEEKDAY[dow] * Math.pow(1 + s.trend, i - DAYS + 1);
    const incident = s.incidents.find((inc) => i >= inc.from && i <= inc.to);

    const siteSessions = (s.week.sessions / 7) * shape * jitter(0.10);
    const siteUsers = (s.week.users / 7) * shape * jitter(0.09);
    const siteNewUsers = (s.week.newUsers / 7) * shape * jitter(0.11);
    const siteOrders = (s.week.orders / 7) * shape * jitter(0.14);
    const siteAdSpend = Math.round((s.week.adSpend / 7) * shape * jitter(0.08));

    s.pages.forEach((p, pi) => {
      const hit = incident && incident.pages && incident.pages.indexOf(p.id) >= 0;

      const sessions = Math.round(siteSessions * p.share * jitter(0.08));
      const users = Math.round(siteUsers * p.share * jitter(0.08));
      const newUsers = Math.min(users, Math.round(siteNewUsers * p.share * jitter(0.10)));
      const returningUsers = Math.max(0, users - newUsers);

      // A slow, erroring page converts worse — the reason to watch it per page.
      const drag = hit ? 0.86 : 1;
      const orders = Math.max(0, Math.round(siteOrders * p.share * (p.conv / convNorm) * drag * jitter(0.12)));
      const revenue = Math.round(orders * s.aov * jitter(0.05));

      const loadMs = Math.round(s.ux.loadMs * p.load * (hit ? incident.loadMult : 1) * jitter(0.12));
      const bounce = +Math.min(0.95, Math.max(0.05,
        (s.ux.bounce + p.bounce) * (hit ? 1.09 : 1) * jitter(0.07))).toFixed(4);
      const errorRate = +(s.ux.errorRate * (hit ? 1.8 : 1) * jitter(0.22)).toFixed(5);
      const failedApi = +(s.ux.failedApi * (hit ? incident.failedApiMult : 1) * jitter(0.25)).toFixed(5);
      const jsErrors = Math.round((s.ux.jsErrors / 7) * p.share * (hit ? 2.2 : 1) * jitter(0.30));
      const rageClicks = Math.round((s.ux.rageClicks / 7) * p.share * (hit ? 1.7 : 1) * jitter(0.25));

      daily.push({
        date, site: s.id, page: p.id,
        sessions, users, newUsers, returningUsers, orders, revenue,
        // Ad spend is bought per site, so it is attributed by session share.
        adSpend: Math.round(siteAdSpend * p.share),
        bounce, loadMs, errorRate, failedApi, jsErrors, rageClicks,
        incident: hit ? incident.label : null,
      });
    });

    siteDaily.push({
      date, site: s.id,
      uptime: +Math.min(1, s.ux.uptime - (incident ? incident.uptimeDrop : 0) + (rand() - 0.5) * 0.0006).toFixed(5),
    });
  });
});

const data = {
  meta: {
    title: 'Website performance',
    generated: LAST_DAY,
    days: DAYS,
    note: 'Sample data, expanded from the anchor figures in the source design canvas. '
        + 'Replace assets/data.js with a feed from your own analytics stack.',
    currency: 'USD',
  },
  // Thresholds turn raw numbers into a status. Tune per site if yours differ.
  thresholds: {
    uptime: { good: 0.999, warning: 0.995 },
    loadMs: { good: 1800, warning: 2500 },
    errorRate: { good: 0.02, warning: 0.035 },
    failedApi: { good: 0.01, warning: 0.02 },
    bounce: { good: 0.45, warning: 0.55 },
  },
  ranges: [
    { id: '7d', label: '7 days', days: 7 },
    { id: '30d', label: '30 days', days: 30 },
    { id: '90d', label: '90 days', days: 90 },
  ],
  dates,
  sites: SITES.map((s) => ({
    id: s.id, name: s.name, domain: s.domain, slot: s.slot,
    aov: s.aov, retention: s.retention,
    hasChat: s.hasChat, chatLabel: s.chatLabel || null, chat: s.chat || null,
    pages: s.pages.map(({ id, name, kind, share }) => ({ id, name, kind, share })),
    funnel: s.funnel.map(([label, loss]) => ({ label, cumulativeLoss: loss / 100 })),
    chatFunnel: (s.chatFunnel || []).map(([label, loss]) => ({ label, cumulativeLoss: loss / 100 })),
    sources: s.sources.map(([label, share]) => ({ label, share: share / 100 })),
    email: {
      sent: s.email.sent, open: s.email.open, click: s.email.click, unsub: s.email.unsub,
      campaigns: s.email.campaigns.map(([name, open]) => ({ name, open })),
      topBuyers: s.email.topBuyers.map(([name, revenue]) => ({ name, revenue })),
    },
  })),
  daily,
  siteDaily,
};

mkdirSync('data', { recursive: true });
mkdirSync('assets', { recursive: true });
writeFileSync('data/metrics.json', JSON.stringify(data, null, 2) + '\n');
writeFileSync('assets/data.js',
  '// Generated by scripts/generate-data.mjs — do not edit by hand.\n'
  + 'window.DASHBOARD_DATA = ' + JSON.stringify(data) + ';\n');

const pageCount = SITES.reduce((a, s) => a + s.pages.length, 0);
console.log(`wrote ${daily.length} page-day rows (${pageCount} pages, ${SITES.length} sites, ${DAYS} days)`);
