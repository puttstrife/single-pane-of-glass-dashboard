export type Scope = 'all' | 'votive' | 'individualogist' | 'astrolover' | 'sabrina'
export type Period = '7d' | '30d' | '90d'
export const properties: { id: Scope; name: string; m: number }[] = [{ id:'all',name:'All in-scope properties',m:1 },{ id:'votive',name:'Votive Society',m:.34 },{ id:'individualogist',name:'Individualogist',m:.27 },{ id:'astrolover',name:'Astrolover Sketch',m:.22 },{ id:'sabrina',name:'Ask Sabrina',m:.17 }]
export const periods: { id: Period; name: string; m: number }[] = [{id:'7d',name:'Last 7 dummy days',m:.26},{id:'30d',name:'Last 30 dummy days',m:1},{id:'90d',name:'Last 90 dummy days',m:2.72}]
const money=(n:number)=>`$${Math.round(n).toLocaleString('en-US')}`
export function dashboard(scope: Scope, period: Period) { const p=properties.find(x=>x.id===scope)!, d=periods.find(x=>x.id===period)!, n=p.m*d.m; const cpv={views:Math.round(412000*p.m),clicks:Math.round(18640*p.m),conversions:Math.round(922*p.m),value:`$${(3.78*p.m).toFixed(2)}`}; const email={sent:Math.round(128400*n),delivered:Math.round(124930*n),opened:Math.round(49510*n),clicked:Math.round(5380*n)}; const campaigns: [Scope, string, number, number][] = [['votive','Votive Society — autumn edit',39,4.7],['individualogist','Individualogist — profile series',44,5.1],['astrolover','Astrolover Sketch — new sketch',35,3.8],['sabrina','Ask Sabrina — weekly guidance',40,4.2]]; return {p,d,email,cpv,adsense:money(2840*n),trend:[480,525,460,570,510,610].map(x=>Math.round(x*n)),readiness:{mapped:78,eligible:64,consent:71,unmapped:22},campaigns:campaigns.filter(([campaignScope])=>scope==='all'||campaignScope===scope).map(([, name, open, click])=>[name, open, click] as [string, number, number])} }

// Future-ready, dummy-only fixture for two not-yet-connected cron jobs. Property names preserve their existing placeholder/website labels by user correction.
export const subscriberIntelligenceJobs: { name: string; status: string; lastRun: string }[] = [
  { name: 'maropost-read-only-subscriber-collection', status: 'Illustrative dummy cron status', lastRun: 'No live cron connection' },
  { name: 'maropost-subscriber-collection-progress', status: 'Illustrative dummy cron status', lastRun: 'No live cron connection' },
]
export const subscriberIntelligence = {
  uniqueSubscribers: 48210,
  eligibleSubscribers: 39875,
  consentReadySubscribers: 31240,
  needsMappingSubscribers: 4210,
  perList: [
    { name: 'Illustrative list A', count: 18320 },
    { name: 'Illustrative list B', count: 15640 },
    { name: 'Illustrative list C', count: 14250 },
  ],
  collectionProgressPct: 82,
  lastSuccessfulCollection: 'Illustrative dummy data — no live cron connection',
  collectionStatus: 'Illustrative dummy data — no live cron connection',
  activity: [
    { period: 'Cycle 1', value: 640 },
    { period: 'Cycle 2', value: 705 },
    { period: 'Cycle 3', value: 590 },
    { period: 'Cycle 4', value: 760 },
    { period: 'Cycle 5', value: 680 },
    { period: 'Cycle 6', value: 820 },
  ],
}
