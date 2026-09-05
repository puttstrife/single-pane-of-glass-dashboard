#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const sourceRoot = path.join(root, 'src')
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]) : []
const files = walk(sourceRoot).filter((file) => /\.(tsx|ts|css)$/.test(file))
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n').toLowerCase()

assert.ok(files.some((file) => file.endsWith('src/App.tsx')), 'React dashboard entry must exist')
for (const primitive of ['@/components/ui/card', '@/components/ui/button', '@/components/ui/badge', '@/components/ui/select', '@/components/ui/sheet', '@/components/ui/table', '@/components/ui/tabs', '@/components/ui/tooltip']) {
  assert.ok(source.includes(primitive), `Actual owned shadcn primitive missing: ${primitive}`)
}
assert.match(source, /from ['"]recharts['"]/, 'Recharts must power dashboard visualizations')
for (const label of ['overview', 'email performance', 'paid & monetization', 'audience readiness', 'insights & decisions', 'data status', 'all in-scope properties', 'votive society', 'individualogist', 'astrolover sketch', 'ask sabrina', 'dummy data', 'no live connection', 'selected period scopes maropost email and adsense only', 'latest dummy snapshot', 'period filter does not apply', 'no combined adsense+cpv revenue total', 'no subscriber identity data']) {
  assert.ok(source.includes(label), `Required business/source-boundary text missing: ${label}`)
}
for (const excluded of ['tarovaya', 'sabai after hours', 'unassigned / needs mapping']) assert.ok(!source.includes(excluded), `Excluded UI content leaked: ${excluded}`)
assert.match(source, /--background:\s*222\.2 84% 4\.9%/, 'Dark-first background token missing')
for (const marker of ['funnelchart', 'linechart', 'barchart', 'areachart', 'piechart']) assert.ok(source.includes(marker), `Expected chart type missing: ${marker}`)
for (const forbidden of [/\bfetch\s*\(/i, /\bxmlhttprequest\b/i, /\bwebsocket\b/i, /\beventsource\b/i, /navigator\s*\.\s*sendbeacon\b/i, /https?:\/\//i, /localstorage/i, /sessionstorage/i, /indexeddb/i, /\bcaches?\s*\./i]) assert.ok(!forbidden.test(source), `Forbidden active runtime mechanism: ${forbidden}`)

const { dashboard, properties, periods } = await import(path.join(sourceRoot, 'data', 'fixtures.ts'))

const propertyEntries = properties.map((p) => ({ id: p.id, name: p.name }))
assert.deepEqual(propertyEntries, [
  { id: 'all', name: 'All in-scope properties' },
  { id: 'votive', name: 'Votive Society' },
  { id: 'individualogist', name: 'Individualogist' },
  { id: 'astrolover', name: 'Astrolover Sketch' },
  { id: 'sabrina', name: 'Ask Sabrina' },
], 'Property selector fixture must expose the exact ordered id:name entries for the five in-scope properties')
const propertyNames = properties.map((p) => p.name.toLowerCase())
for (const excluded of ['tarovaya', 'sabai after hours', 'unassigned / needs mapping']) assert.ok(!propertyNames.some((name) => name.includes(excluded)), `Excluded property leaked into selector fixture: ${excluded}`)
assert.deepEqual(periods.map((p) => p.id), ['7d', '30d', '90d'], 'Period selector identities must match the three supported periods, in order')

const allEmail30 = dashboard('all', '30d').email
const votiveEmail30 = dashboard('votive', '30d').email
assert.notDeepEqual(votiveEmail30, allEmail30, 'Changing property scope must change email figures')
assert.deepEqual(dashboard('all', '30d').campaigns.length, 4, 'All-property scope must include every campaign')
const votiveCampaigns = dashboard('votive', '30d').campaigns
assert.ok(votiveCampaigns.length > 0 && votiveCampaigns.every((r) => r[0].startsWith('Votive Society')), 'Valid property scope must filter campaigns to that property only')

const allEmail7 = dashboard('all', '7d').email
const allAdsense7 = dashboard('all', '7d').adsense
const allAdsense30 = dashboard('all', '30d').adsense
assert.notDeepEqual(allEmail7, allEmail30, 'Changing period must change email figures')
assert.notEqual(allAdsense7, allAdsense30, 'Changing period must change AdSense earnings')

const allCpv30 = dashboard('all', '30d').cpv
const allCpv90 = dashboard('all', '90d').cpv
assert.deepEqual(allCpv90, allCpv30, 'CPV must stay identical across periods for the same property scope')
const votiveCpv30 = dashboard('votive', '30d').cpv
assert.notDeepEqual(votiveCpv30, allCpv30, 'CPV must differ across property scopes')

const appSourceRaw = fs.readFileSync(path.join(sourceRoot, 'App.tsx'), 'utf8')
const selectBlocks = [...appSourceRaw.matchAll(/<Select\b([\s\S]*?)<SelectTrigger/g)].map((m) => m[1])
const scopeSelect = selectBlocks.find((block) => block.includes('value={scope}'))
assert.ok(scopeSelect, 'A Select must bind value={scope}')
assert.match(scopeSelect, /onValueChange=\{[^}]*setScope[^}]*\}/, 'The Select with value={scope} must call setScope from its onValueChange handler, not just display a label')
const periodSelect = selectBlocks.find((block) => block.includes('value={period}'))
assert.ok(periodSelect, 'A Select must bind value={period}')
assert.match(periodSelect, /onValueChange=\{[^}]*setPeriod[^}]*\}/, 'The Select with value={period} must call setPeriod from its onValueChange handler, not just display a label')
assert.match(appSourceRaw, /dashboard\(\s*scope\s*,\s*period\s*\)/, 'Dashboard data must be derived by calling dashboard(scope, period) from component state')

console.log(`PASS: React/shadcn/Recharts dashboard contract (${files.length} source files checked)`)
