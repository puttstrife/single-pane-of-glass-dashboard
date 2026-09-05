/* Clearly labelled deterministic dummy fixtures. No connector, local-file, or storage connection exists. */
(() => {
  const properties = [
    { id: 'all', name: 'All in-scope properties', multiplier: 1, readiness: 0 },
    { id: 'votive', name: 'Votive Society', multiplier: 0.34, readiness: 4 },
    { id: 'individualogist', name: 'Individualogist', multiplier: 0.27, readiness: 7 },
    { id: 'astrolover', name: 'Astrolover Sketch', multiplier: 0.22, readiness: -3 },
    { id: 'sabrina', name: 'Ask Sabrina', multiplier: 0.17, readiness: -8 }
  ];
  const periods = [
    { id: '7d', name: 'Last 7 dummy days', multiplier: 0.26 },
    { id: '30d', name: 'Last 30 dummy days', multiplier: 1 },
    { id: '90d', name: 'Last 90 dummy days', multiplier: 2.72 }
  ];
  const base = {
    email: { sent: 128400, delivered: 124930, opened: 49510, clicked: 5380, campaigns: [
      ['Votive Society — autumn edit', 98, 39, 4.7], ['Individualogist — profile series', 96, 44, 5.1], ['Astrolover Sketch — new sketch', 93, 35, 3.8], ['Ask Sabrina — weekly guidance', 91, 40, 4.2]
    ] },
    cpv: { views: 412000, clicks: 18640, conversions: 922, value: 3.78 },
    adsense: { earnings: 2840, trend: [480, 525, 460, 570, 510, 610], domains: [['Votive Society', 980, 8], ['Individualogist', 610, 4], ['Astrolover Sketch', 770, 12], ['Ask Sabrina', 480, -3]] },
    readiness: { mapped: 78, eligible: 64, consent: 71, unassigned: 22 }
  };
  const round = (value) => Math.round(value);
  const money = (value, decimals = 0) => `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

  function scope(propertyId, periodId) {
    const property = properties.find((item) => item.id === propertyId) || properties[0];
    const period = periods.find((item) => item.id === periodId) || periods[1];
    const multiplier = property.multiplier * period.multiplier;
    const readiness = Object.fromEntries(Object.entries(base.readiness).map(([key, value]) => [key, Math.max(0, Math.min(100, value + property.readiness))]));
    const campaignRows = property.id === 'all'
      ? base.email.campaigns
      : base.email.campaigns.filter(([name]) => name.startsWith(property.name));
    const email = {
      sent: round(base.email.sent * multiplier), delivered: round(base.email.delivered * multiplier),
      opened: round(base.email.opened * multiplier), clicked: round(base.email.clicked * multiplier),
      campaigns: campaignRows.map(([name, sent, open, click]) => [name, (sent * period.multiplier).toFixed(1), (open + property.readiness / 5).toFixed(1), (click + property.readiness / 12).toFixed(1)])
    };
    const cpvMultiplier = property.multiplier;
    const cpv = { views: round(base.cpv.views * cpvMultiplier), clicks: round(base.cpv.clicks * cpvMultiplier), conversions: round(base.cpv.conversions * cpvMultiplier), value: money(base.cpv.value * cpvMultiplier, 2) };
    const adsense = {
      earnings: money(round(base.adsense.earnings * multiplier)),
      trend: base.adsense.trend.map((value) => round(value * multiplier)),
      domains: (property.id === 'all' ? base.adsense.domains : base.adsense.domains.filter(([name]) => name === property.name)).map(([name, value, change]) => [name, money(round(value * period.multiplier)), `${change + property.readiness / 4 >= 0 ? '+' : ''}${(change + property.readiness / 4).toFixed(1)}%`])
    };
    const propertyLabel = property.id === 'all' ? 'the in-scope property set' : property.name;
    return {
      property, period, email, cpv, adsense, readiness,
      decisions: [
        ['Opportunity', `${propertyLabel} has ${email.opened.toLocaleString('en-US')} illustrative email opens in this scope.`, `Use this ${period.name.toLowerCase()} dummy signal as a hypothesis; inspect the next authoritative artifact before scaling.`],
        ['Risk', `${propertyLabel} shows ${adsense.earnings} illustrative AdSense earnings in this scope.`, 'Review source-specific evidence before acting; do not infer CPV impact.'],
        ['Needs mapping', `${readiness.unassigned}% of this illustrative scope needs mapping.`, 'Define mapping rules before using this dummy property-level signal for a decision.']
      ]
    };
  }

  window.DASHBOARD_DATA = { meta: { title: 'Mettlence BI', freshness: 'Dummy snapshot · deterministic fixture' }, properties, periods, scope };
})();
