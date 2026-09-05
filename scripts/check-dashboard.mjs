#!/usr/bin/env node
/** Focused static acceptance guard for the dummy BI dashboard. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const files = ['index.html', 'assets/app.js', 'assets/data.js', 'assets/styles.css'];
const sources = Object.fromEntries(files.map((file) => [file, read(file)]));
const ui = Object.values(sources).join('\n').toLowerCase().replaceAll('&amp;', '&');
const html = sources['index.html'].toLowerCase().replaceAll('&amp;', '&');
const app = sources['assets/app.js'];
const data = sources['assets/data.js'];

const required = [
  'overview', 'email performance', 'paid & monetization', 'audience readiness',
  'insights & decisions', 'data status', 'dummy data', 'no live connection',
  'maropost', 'sent', 'delivered', 'opened', 'clicked', 'cpv', 'views',
  'conversions', 'adsense', 'campaign comparison', 'audience readiness coverage',
  'decision hypotheses', 'no combined adsense+cpv revenue total',
  'maropost engagement is not attributed revenue', 'no subscriber identity data'
];
for (const text of required) assert.ok(ui.includes(text), `Required dashboard content missing: ${text}`);

for (const excluded of ['tarovaya', 'sabai after hours']) {
  assert.ok(!ui.includes(excluded), `Excluded property leaked into dashboard: ${excluded}`);
}
for (const forbidden of ['top buyers', 'uptime', 'page load', 'traffic mix', 'chat & retention', 'generic orders']) {
  assert.ok(!html.includes(forbidden), `Legacy dashboard concept remains in active UI: ${forbidden}`);
}
for (const mechanism of [/\bfetch\s*\(/i, /\bxmlhttprequest\b/i, /\bwebsocket\b/i, /\beventsource\b/i, /navigator\s*\.\s*sendbeacon\b/i, /https?:\/\//i]) {
  assert.ok(!mechanism.test(ui), `The prototype must not contain network mechanism: ${mechanism}`);
}
assert.ok(!/localstorage|sessionstorage|indexeddb|\bcaches?\s*\./i.test(ui), 'The prototype must not store state.');

assert.match(html, /<main\s+id=["']main["'][^>]*\btabindex=["']-1["']/i, 'main must be programmatically focusable but excluded from normal tab order.');
assert.match(data, /\bscope\s*\(/, 'Dummy fixtures must provide a deterministic scope function.');
assert.match(app, /function\s+renderDashboard\s*\(/, 'Controls must invoke a dashboard renderer, not only change subtitle text.');
assert.match(app, /renderDashboard\s*\(\s*\)/, 'Initial scoped values must be rendered.');
for (const control of ['property', 'period']) {
  assert.match(app, new RegExp(`#${control}'\\)\\.addEventListener\\('change',[\\s\\S]{0,200}renderDashboard\\s*\\(`), `${control} control must rerender scoped values.`);
}

for (const text of [
  'latest dummy snapshot — period filter does not apply',
  'selected period scopes maropost email and adsense only'
]) assert.ok(ui.includes(text), `Source-granularity boundary missing: ${text}`);

const fixtureWindow = {};
vm.runInNewContext(data, { window: fixtureWindow });
const selectorProperties = fixtureWindow.DASHBOARD_DATA.properties;
assert.deepEqual(
  Array.from(selectorProperties, ({ id, name }) => `${id}:${name}`),
  [
    'all:All in-scope properties',
    'votive:Votive Society',
    'individualogist:Individualogist',
    'astrolover:Astrolover Sketch',
    'sabrina:Ask Sabrina'
  ],
  'Property selector fixtures must contain All in-scope properties plus exactly the four in-scope properties.'
);
assert.ok(
  !selectorProperties.some(({ id, name }) => id === 'unassigned' || name === 'Unassigned / needs mapping'),
  'Unassigned / needs mapping must not be a selectable property fixture.'
);
const scoped = fixtureWindow.DASHBOARD_DATA.scope;
const scope7d = scoped('all', '7d');
const scope90d = scoped('all', '90d');
const propertySnapshot = scoped('votive', '30d');
assert.equal(scope7d.readiness.unassigned, 22, 'Unassigned / needs mapping must remain an aggregate readiness metric.');
assert.notEqual(scope7d.email.sent, scope90d.email.sent, 'Selected period must scope Maropost email fixtures.');
assert.notEqual(scope7d.adsense.earnings, scope90d.adsense.earnings, 'Selected period must scope AdSense fixtures.');
assert.deepEqual(scope7d.cpv, scope90d.cpv, 'CPV must remain a latest dummy snapshot when the selected period changes.');
assert.notDeepEqual(scope7d.cpv, propertySnapshot.cpv, 'CPV snapshots may remain property-scoped.');

const css = sources['assets/styles.css'];
const mobileRule = /@media\s*\(\s*max-width\s*:\s*680px\s*\)\s*\{[\s\S]*?\.kpi-grid\s*\{[\s\S]*?grid-template-columns\s*:\s*repeat\(\s*2\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/;
assert.match(css, mobileRule, 'Mobile KPI columns must use zero-minimum tracks so card content cannot widen the viewport.');
console.log(`PASS: dummy BI dashboard acceptance guard (${files.length} active UI files checked)`);
