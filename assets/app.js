/* Website performance — single pane of glass.
   Monitors the three sites from the source design canvas. Vanilla JS, hand-built
   SVG charts, so the page opens straight from the filesystem. */
(function () {
  'use strict';

  var D = window.DASHBOARD_DATA;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ── chart colours come from the CSS tokens, never hard-coded here ── */
  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function siteColor(slot) { return token('--series-' + slot); }

  /* ── formatting ───────────────────────────────────────────── */
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function dayShort(iso) {
    var p = iso.split('-');
    return MONTHS[+p[1] - 1] + ' ' + (+p[2]);
  }
  function dayLong(iso) {
    var p = iso.split('-');
    return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
  }
  function compact(n) {
    var abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e4) return Math.round(n / 1e3) + 'k';
    if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }
  function money(n) { return '$' + compact(n); }
  function moneyExact(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function money2(n) { return '$' + n.toFixed(2); }
  function count(n) { return Math.round(n).toLocaleString('en-US'); }
  function pct(n, dp) { return (n * 100).toFixed(dp === undefined ? 1 : dp) + '%'; }
  function uptimePct(n) { return (n * 100).toFixed(2) + '%'; }
  function ms(n) { return (n / 1000).toFixed(2) + 's'; }
  function duration(sec) {
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
  }

  /* ── state ────────────────────────────────────────────────── */
  var state = {
    range: '30d',
    site: 'all',
    surface: 'site',   // 'site' | 'chat' — which funnel is shown
    emphasis: null
  };

  function rangeDef() {
    return D.ranges.find(function (r) { return r.id === state.range; }) || D.ranges[1];
  }
  function datesInScope() { return D.dates.slice(-rangeDef().days); }
  function priorDates() {
    var n = rangeDef().days, end = D.dates.length - n;
    return D.dates.slice(Math.max(0, end - n), end);
  }
  function site(id) { return D.sites.find(function (s) { return s.id === id; }); }
  function siteName(id) { var s = site(id); return s ? s.name : id; }
  function activeSites() {
    return state.site === 'all' ? D.sites : D.sites.filter(function (s) { return s.id === state.site; });
  }
  function rows(dates, siteId) {
    var set = {}; dates.forEach(function (d) { set[d] = 1; });
    return D.daily.filter(function (r) {
      return set[r.date] && (!siteId || siteId === 'all' || r.site === siteId);
    });
  }
  function sum(list, key) { return list.reduce(function (a, r) { return a + r[key]; }, 0); }
  function mean(list, key) { return list.length ? sum(list, key) / list.length : 0; }

  function kpis(list) {
    var sessions = sum(list, 'sessions'), users = sum(list, 'users');
    var orders = sum(list, 'orders'), revenue = sum(list, 'revenue');
    return {
      sessions: sessions, users: users, newUsers: sum(list, 'newUsers'),
      returningUsers: sum(list, 'returningUsers'),
      orders: orders, revenue: revenue, adSpend: sum(list, 'adSpend'),
      conversion: sessions ? orders / sessions : 0,
      aov: orders ? revenue / orders : 0,
      revPerUser: users ? revenue / users : 0,
      roas: sum(list, 'adSpend') ? revenue / sum(list, 'adSpend') : 0,
      cac: orders ? sum(list, 'adSpend') / orders : 0,
      // Rates and timings are averaged, never summed.
      loadMs: mean(list, 'loadMs'), bounce: mean(list, 'bounce'),
      errorRate: mean(list, 'errorRate'), failedApi: mean(list, 'failedApi'),
      uptime: mean(list, 'uptime'),
      jsErrors: sum(list, 'jsErrors'), rageClicks: sum(list, 'rageClicks')
    };
  }

  /* Thresholds → a named state. Higher is better only for uptime. */
  function statusOf(metric, value) {
    var t = D.thresholds[metric];
    if (!t) return null;
    if (metric === 'uptime') {
      if (value >= t.good) return 'good';
      return value >= t.warning ? 'warning' : 'critical';
    }
    if (value <= t.good) return 'good';
    return value <= t.warning ? 'warning' : 'critical';
  }
  var STATUS_META = {
    good:     { glyph: '●', label: 'Healthy' },
    warning:  { glyph: '▲', label: 'Watch' },
    critical: { glyph: '■', label: 'Degraded' }
  };
  var STATUS_RANK = { good: 0, warning: 1, critical: 2 };

  function siteStatus(list) {
    var k = kpis(list);
    var worst = 'good';
    ['uptime', 'loadMs', 'errorRate', 'failedApi'].forEach(function (m) {
      var s = statusOf(m, k[m]);
      if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
    });
    return worst;
  }

  /* ── DOM helpers ──────────────────────────────────────────── */
  function el(tag, attrs, kids) { return apply(document.createElement(tag), attrs, kids); }
  function svg(tag, attrs, kids) { return apply(document.createElementNS(SVG_NS, tag), attrs, kids); }
  function apply(n, attrs, kids) {
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function swatch(color, cls) {
    var s = el('span', { class: cls || 'swatch' }); s.style.background = color; return s;
  }
  function statusPill(status) {
    var m = STATUS_META[status];
    return el('span', { class: 'pill', 'data-status': status }, [
      el('span', { class: 'glyph', 'aria-hidden': 'true', text: m.glyph }),
      el('span', { text: m.label })
    ]);
  }
  function siteKey(s) {
    return el('span', { class: 'series-key' }, [swatch(siteColor(s.slot)), el('span', { text: s.name })]);
  }
  function tableOf(caption, head, body, foot) {
    var kids = [];
    if (caption) kids.push(el('caption', { text: caption }));
    kids.push(el('thead', {}, [el('tr', {}, head)]));
    kids.push(body);
    if (foot) kids.push(foot);
    return el('table', {}, kids);
  }
  function th(text) { return el('th', { scope: 'col', text: text }); }

  function niceTicks(min, max, target) {
    var span = max - min;
    if (span <= 0) return [min];
    var raw = span / (target || 4);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; })
      .find(function (s) { return s >= raw; }) || 10 * mag;
    var start = Math.floor(min / step) * step;
    var out = [];
    for (var v = start; v <= max + step * 0.001; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function endRoundedPathH(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, h / 2, w));
    return 'M' + x + ',' + y + 'h' + (w - r) +
           'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
           'v' + (h - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + -r + ',' + r +
           'H' + x + 'Z';
  }

  /* ── tooltip ──────────────────────────────────────────────── */
  function makeTooltip(host) {
    var tip = el('div', { class: 'tooltip', role: 'status' });
    host.appendChild(tip);
    return {
      show: function (node, x, y) {
        clear(tip); tip.appendChild(node); tip.setAttribute('data-open', 'true');
        var hb = host.getBoundingClientRect(), tb = tip.getBoundingClientRect();
        var left = Math.min(Math.max(4, x - tb.width / 2), hb.width - tb.width - 4);
        var top = y - tb.height - 14;
        if (top < 0) top = y + 18;
        tip.style.left = left + 'px'; tip.style.top = top + 'px';
      },
      hide: function () { tip.removeAttribute('data-open'); }
    };
  }
  function tipBody(title, lines, total) {
    var dl = el('dl');
    lines.forEach(function (r) {
      dl.appendChild(r.color ? swatch(r.color) : el('span'));
      dl.appendChild(el('dt', { text: r.label }));
      dl.appendChild(el('dd', { text: r.value }));
    });
    var kids = [el('h3', { text: title }), dl];
    if (total) kids.push(el('div', { class: 'total' }, [
      el('span', { text: total.label }), el('strong', { text: total.value })
    ]));
    return el('div', {}, kids);
  }

  /* ── delta chip ───────────────────────────────────────────── */
  function deltaChip(curr, prev, opts) {
    opts = opts || {};
    var span = el('span', { class: 'delta' });
    if (!prev) { span.setAttribute('data-dir', 'flat'); span.textContent = 'no prior period'; return span; }
    var change = (curr - prev) / Math.abs(prev);
    var flat = Math.abs(change) < 0.005;
    var up = change > 0;
    var dir = flat ? 'flat' : ((up && !opts.lowerIsBetter) || (!up && opts.lowerIsBetter)) ? 'good' : 'bad';
    span.setAttribute('data-dir', dir);
    span.appendChild(el('span', { class: 'arrow', 'aria-hidden': 'true', text: flat ? '→' : up ? '↑' : '↓' }));
    span.appendChild(el('span', { text: (up ? '+' : '') + (change * 100).toFixed(1) + '%' }));
    span.appendChild(el('span', { class: 'vs', text: opts.vs || 'vs. prior' }));
    return span;
  }

  function sparkline(values, width, height) {
    var w = width || 120, h = height || 30, pad = 3;
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var span = (max - min) || 1;
    var x = function (i) { return pad + i * ((w - pad * 2) / Math.max(1, values.length - 1)); };
    var y = function (v) { return h - pad - ((v - min) / span) * (h - pad * 2); };
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('');
    return svg('svg', { class: 'spark', width: w, height: h, 'aria-hidden': 'true', focusable: 'false' }, [
      svg('path', { d: d, fill: 'none', stroke: token('--muted'), 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.6 }),
      svg('circle', { cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 4,
        fill: token('--brand'), stroke: token('--card'), 'stroke-width': 2 })
    ]);
  }

  /* ── sidebar ──────────────────────────────────────────────── */
  function renderNav() {
    var host = document.getElementById('nav');
    var dates = datesInScope();
    clear(host);

    var allBtn = el('button', {
      type: 'button', 'aria-current': String(state.site === 'all'),
      onclick: function () { select('all'); }
    }, [
      el('span', { class: 'nav-name', text: 'All websites' }),
      el('span', { class: 'nav-meta', text: D.sites.length + ' sites' })
    ]);
    host.appendChild(allBtn);

    D.sites.forEach(function (s) {
      var status = siteStatus(rows(dates, s.id));
      var btn = el('button', {
        type: 'button', 'aria-current': String(state.site === s.id),
        onclick: function () { select(s.id); }
      }, [
        el('span', { class: 'status-dot', 'data-status': status, 'aria-hidden': 'true' }),
        el('span', { class: 'nav-name' }, [
          el('span', { text: s.name }),
          el('span', { class: 'nav-domain', text: s.domain })
        ]),
        el('span', { class: 'nav-meta', text: STATUS_META[status].label })
      ]);
      host.appendChild(btn);
    });

    document.getElementById('sidebar-foot').textContent =
      'Monitoring ' + D.sites.length + ' sites · ' + D.meta.days + ' days of history';
  }
  function select(id) {
    if (state.site === id) return;
    state.site = id;
    state.emphasis = null;
    var s = site(id);
    if (!s || !s.hasChat) state.surface = 'site';
    renderAll();
  }

  /* ── range control ────────────────────────────────────────── */
  function renderRanges() {
    var host = document.getElementById('ranges');
    clear(host);
    D.ranges.forEach(function (r) {
      host.appendChild(el('button', {
        type: 'button', 'aria-pressed': String(state.range === r.id),
        text: r.label,
        onclick: function () { if (state.range !== r.id) { state.range = r.id; renderAll(); } }
      }));
    });
  }

  /* ── incident banner ──────────────────────────────────────── */
  function renderBanner() {
    var host = document.getElementById('banner');
    clear(host);
    var dates = datesInScope();
    var open = {};
    rows(dates, state.site).forEach(function (r) {
      if (r.incident) {
        if (!open[r.site + '|' + r.incident]) open[r.site + '|' + r.incident] = { site: r.site, label: r.incident, days: [] };
        open[r.site + '|' + r.incident].days.push(r.date);
      }
    });
    var list = Object.keys(open).map(function (k) { return open[k]; });
    if (!list.length) return;
    var latest = D.dates[D.dates.length - 1];
    list.forEach(function (inc) {
      var ongoing = inc.days.indexOf(latest) >= 0;
      host.appendChild(el('div', { class: 'banner', 'data-status': ongoing ? 'critical' : 'warning' }, [
        el('span', { class: 'glyph', 'aria-hidden': 'true', text: ongoing ? '■' : '▲' }),
        el('span', {}, [
          el('strong', { text: siteName(inc.site) + ' · ' + inc.label }),
          el('span', { text: ' — ' + inc.days.length + ' affected days, '
            + dayLong(inc.days[0]) + ' to ' + dayLong(inc.days[inc.days.length - 1])
            + (ongoing ? '. Still open.' : '. Resolved.') })
        ])
      ]));
    });
  }

  /* ── hero + tiles ─────────────────────────────────────────── */
  function renderHero() {
    var dates = datesInScope();
    var curr = kpis(rows(dates, state.site));
    var past = kpis(rows(priorDates(), state.site));

    document.getElementById('hero-scope').textContent =
      'Last ' + rangeDef().days + ' days' +
      (state.site === 'all' ? ' · all websites' : ' · ' + siteName(state.site));
    document.getElementById('hero-value').textContent = money(curr.revenue);

    var foot = document.getElementById('hero-delta');
    clear(foot);
    foot.appendChild(deltaChip(curr.revenue, past.revenue, { vs: 'vs. prior ' + rangeDef().days + ' days' }));

    document.getElementById('hero-note').textContent =
      moneyExact(curr.revenue) + ' from ' + count(curr.orders) + ' orders · '
      + money2(curr.aov) + ' average order · ' + money2(curr.revPerUser) + ' per user.';

    var spark = document.getElementById('hero-spark');
    clear(spark);
    spark.appendChild(sparkline(dates.map(function (d) {
      return sum(rows([d], state.site), 'revenue');
    }), 320, 56));
  }

  function renderTiles() {
    var host = document.getElementById('tiles');
    clear(host);
    var dates = datesInScope();
    var curr = kpis(rows(dates, state.site));
    var past = kpis(rows(priorDates(), state.site));
    var trend = function (fn) { return dates.map(function (d) { return fn(kpis(rows([d], state.site))); }); };

    [
      { label: 'Sessions', value: count(curr.sessions), curr: curr.sessions, prev: past.sessions,
        series: trend(function (k) { return k.sessions; }) },
      { label: 'Conversion', value: pct(curr.conversion, 2), curr: curr.conversion, prev: past.conversion,
        series: trend(function (k) { return k.conversion; }),
        foot: count(curr.orders) + ' orders' },
      { label: 'Bounce rate', value: pct(curr.bounce), curr: curr.bounce, prev: past.bounce, lowerIsBetter: true,
        series: trend(function (k) { return k.bounce; }),
        foot: 'target under ' + pct(D.thresholds.bounce.good, 0) },
      { label: 'Returning users', value: pct(curr.users ? curr.returningUsers / curr.users : 0),
        curr: curr.users ? curr.returningUsers / curr.users : 0,
        prev: past.users ? past.returningUsers / past.users : 0,
        series: trend(function (k) { return k.users ? k.returningUsers / k.users : 0; }),
        foot: count(curr.returningUsers) + ' of ' + count(curr.users) }
    ].forEach(function (d) {
      var tile = el('div', { class: 'tile' }, [
        el('span', { class: 'label', text: d.label }),
        el('span', { class: 'value', text: d.value }),
        deltaChip(d.curr, d.prev, { lowerIsBetter: d.lowerIsBetter })
      ]);
      tile.appendChild(sparkline(d.series));
      if (d.foot) tile.appendChild(el('span', { class: 'target', text: d.foot }));
      host.appendChild(tile);
    });
  }

  /* ── site health table ────────────────────────────────────── */
  function renderHealth() {
    var host = document.getElementById('table-health');
    clear(host);
    var dates = datesInScope();

    var body = el('tbody');
    D.sites.forEach(function (s) {
      var list = rows(dates, s.id);
      var k = kpis(list);
      var status = siteStatus(list);
      var tr = el('tr', { 'data-selected': String(state.site === 'all' || state.site === s.id) });
      var head = el('th', { scope: 'row' });
      head.appendChild(siteKey(s));
      head.appendChild(el('span', { class: 'row-sub', text: s.domain }));
      tr.appendChild(head);

      [['uptime', uptimePct(k.uptime)], ['loadMs', ms(k.loadMs)],
       ['errorRate', pct(k.errorRate, 2)], ['failedApi', pct(k.failedApi, 2)]
      ].forEach(function (pair) {
        var cell = el('td');
        cell.appendChild(el('span', { class: 'metric', 'data-status': statusOf(pair[0], k[pair[0]]), text: pair[1] }));
        tr.appendChild(cell);
      });

      tr.appendChild(el('td', { text: count(k.jsErrors) }));
      tr.appendChild(el('td', { text: count(k.rageClicks) }));
      tr.appendChild(el('td', {}, [statusPill(status)]));
      body.appendChild(tr);
    });

    host.appendChild(tableOf(null,
      [th('Website'), th('Uptime'), th('Median load'), th('Error rate'),
       th('Failed API'), th('JS errors'), th('Rage clicks'), th('Status')],
      body));

    document.getElementById('health-hint').textContent =
      'Thresholds: uptime ' + uptimePct(D.thresholds.uptime.good) + ', load '
      + ms(D.thresholds.loadMs.good) + ', errors ' + pct(D.thresholds.errorRate.good, 0);
  }

  /* ── computed alerts (replaces a hand-written insight list) ─ */
  function renderAlerts() {
    var host = document.getElementById('alerts');
    clear(host);
    var dates = datesInScope();
    var found = [];

    D.sites.forEach(function (s) {
      if (state.site !== 'all' && state.site !== s.id) return;
      var list = rows(dates, s.id);
      var k = kpis(list);
      var past = kpis(rows(priorDates(), s.id));

      [['uptime', 'Uptime ' + uptimePct(k.uptime), 'warning'],
       ['loadMs', 'Median load ' + ms(k.loadMs), 'warning'],
       ['errorRate', 'Error rate ' + pct(k.errorRate, 2), 'warning'],
       ['failedApi', 'Failed API calls ' + pct(k.failedApi, 2), 'warning'],
       // Bounce drifts over its target constantly; only a critical read is news.
       ['bounce', 'Bounce rate ' + pct(k.bounce), 'critical']
      ].forEach(function (row) {
        var st = statusOf(row[0], k[row[0]]);
        if (st === 'good') return;
        if (row[2] === 'critical' && st !== 'critical') return;
        found.push({ status: st, site: s, text: row[1] + ' is outside the healthy band.' });
      });

      if (past.revenue && (k.revenue - past.revenue) / past.revenue < -0.1) {
        found.push({ status: 'critical', site: s,
          text: 'Revenue down ' + pct(Math.abs((k.revenue - past.revenue) / past.revenue))
                + ' against the prior ' + rangeDef().days + ' days.' });
      }

      var steps = funnelSteps(s, 'site');
      var worst = steps.slice(1).reduce(function (a, b) { return b.stepLoss > a.stepLoss ? b : a; }, steps[1]);
      if (worst && worst.stepLoss >= 0.35) {
        found.push({ status: 'warning', site: s,
          text: 'Funnel loses ' + pct(worst.stepLoss, 0) + ' of users at ' + worst.label + '.' });
      }
    });

    found.sort(function (a, b) { return STATUS_RANK[b.status] - STATUS_RANK[a.status]; });

    if (!found.length) {
      host.appendChild(el('li', { class: 'alert', 'data-status': 'good' }, [
        el('span', { class: 'glyph', 'aria-hidden': 'true', text: '●' }),
        el('span', { text: 'Everything in range for this period.' })
      ]));
      return;
    }
    // Cap the list — an alert panel nobody can scan is an alert panel nobody reads.
    var CAP = 6;
    found.slice(0, CAP).forEach(function (a) {
      host.appendChild(el('li', { class: 'alert', 'data-status': a.status }, [
        el('span', { class: 'glyph', 'aria-hidden': 'true', text: STATUS_META[a.status].glyph }),
        el('span', {}, [
          el('strong', { text: a.site.name }),
          el('span', { text: ' — ' + a.text })
        ])
      ]));
    });
    if (found.length > CAP) {
      host.appendChild(el('li', { class: 'alert alert--more' }, [
        el('span', { text: (found.length - CAP) + ' more below threshold — the full picture is in Site health.' })
      ]));
    }
  }

  /* ── multi-series line chart ──────────────────────────────── */
  function lineChart(opts) {
    var host = document.getElementById(opts.host);
    clear(host);
    var tip = makeTooltip(host);

    var dates = datesInScope();
    var sites = activeSites();
    var width = Math.max(300, host.clientWidth || 520);
    var m = { top: 16, right: 58, bottom: 28, left: 52 };
    var height = 260;
    var plotW = width - m.left - m.right;
    var plotH = height - m.top - m.bottom;

    var series = sites.map(function (s) {
      return {
        site: s,
        values: dates.map(function (d) { return opts.value(rows([d], s.id)); })
      };
    });

    var all = series.reduce(function (a, s) { return a.concat(s.values); }, []);
    var max = Math.max.apply(null, all);
    var min = opts.zeroBased ? 0 : Math.min.apply(null, all);
    var ticks = niceTicks(min, max, 4);
    var lo = ticks[0], hi = ticks[ticks.length - 1];

    var x = function (i) { return m.left + (dates.length === 1 ? plotW / 2 : i * (plotW / (dates.length - 1))); };
    var y = function (v) { return m.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH; };

    var root = svg('svg', { width: width, height: height, role: 'img', 'aria-label': opts.ariaLabel });

    ticks.forEach(function (t) {
      root.appendChild(svg('line', { class: 'gridline', x1: m.left, x2: m.left + plotW, y1: y(t), y2: y(t) }));
      root.appendChild(svg('text', { class: 'tick', x: m.left - 8, y: y(t) + 4, 'text-anchor': 'end',
        text: opts.tickFormat(t) }));
    });

    // Optional threshold rule — the line the metric is judged against.
    if (opts.threshold !== undefined && opts.threshold >= lo && opts.threshold <= hi) {
      root.appendChild(svg('line', { class: 'threshold', x1: m.left, x2: m.left + plotW,
        y1: y(opts.threshold), y2: y(opts.threshold) }));
      root.appendChild(svg('text', { class: 'tick threshold-label', x: m.left + plotW, y: y(opts.threshold) - 6,
        'text-anchor': 'end', text: opts.thresholdLabel }));
    }

    // x labels: first, middle, last only — 90 dates never fit.
    [0, Math.floor(dates.length / 2), dates.length - 1].forEach(function (i, n) {
      root.appendChild(svg('text', { class: 'tick', x: x(i), y: m.top + plotH + 18,
        'text-anchor': n === 0 ? 'start' : n === 2 ? 'end' : 'middle', text: dayShort(dates[i]) }));
    });

    series.forEach(function (s) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('');
      var path = svg('path', { d: d, fill: 'none', stroke: siteColor(s.site.slot), 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      var dot = svg('circle', { cx: x(s.values.length - 1), cy: y(s.values[s.values.length - 1]), r: 4.5,
        fill: siteColor(s.site.slot), stroke: token('--card'), 'stroke-width': 2 });
      if (state.emphasis && state.emphasis !== s.site.id) {
        path.setAttribute('data-dim', 'true'); dot.setAttribute('data-dim', 'true');
      }
      root.appendChild(path);
      root.appendChild(dot);
      // Direct-label the line end so identity never depends on colour alone.
      root.appendChild(svg('text', { class: 'mark-label', x: x(s.values.length - 1) + 8,
        y: y(s.values[s.values.length - 1]) + 4, text: opts.endFormat(s.values[s.values.length - 1]) }));
    });

    var crosshair = svg('line', { class: 'crosshair', x1: 0, x2: 0, y1: m.top, y2: m.top + plotH, opacity: 0 });
    root.appendChild(crosshair);

    var band = plotW / Math.max(1, dates.length - 1);
    dates.forEach(function (date, i) {
      var hit = svg('rect', { class: 'hit', x: x(i) - band / 2, y: m.top, width: Math.max(band, 6), height: plotH,
        tabindex: i % Math.ceil(dates.length / 12) === 0 ? '0' : '-1', role: 'button',
        'aria-label': dayLong(date) + ': ' + series.map(function (s) {
          return s.site.name + ' ' + opts.endFormat(s.values[i]);
        }).join(', ') });
      function show(ev) {
        crosshair.setAttribute('x1', x(i)); crosshair.setAttribute('x2', x(i));
        crosshair.setAttribute('opacity', 1);
        var box = host.getBoundingClientRect();
        var px = ev && ev.clientX ? ev.clientX - box.left : x(i);
        var lines = series.map(function (s) {
          return { color: siteColor(s.site.slot), label: s.site.name, value: opts.endFormat(s.values[i]) };
        });
        var total = opts.totalLabel
          ? { label: opts.totalLabel, value: opts.endFormat(series.reduce(function (a, s) { return a + s.values[i]; }, 0)) }
          : null;
        tip.show(tipBody(dayLong(date), lines, total), px, Math.min.apply(null, series.map(function (s) { return y(s.values[i]); })));
      }
      function hide() { crosshair.setAttribute('opacity', 0); tip.hide(); }
      hit.addEventListener('mousemove', show);
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', hide);
      hit.addEventListener('blur', hide);
      root.appendChild(hit);
    });

    host.appendChild(root);
    renderLegend(opts.legend, sites, function () { lineChart(opts); });
    renderSeriesTable(opts.table, dates, series, opts.caption, opts.endFormat);
  }

  function renderLegend(id, sites, rerender) {
    var host = document.getElementById(id);
    clear(host);
    if (sites.length < 2) { host.hidden = true; return; }
    host.hidden = false;
    sites.forEach(function (s) {
      host.appendChild(el('button', {
        class: 'legend-item', type: 'button',
        'aria-pressed': String(!state.emphasis || state.emphasis === s.id),
        onclick: function () { state.emphasis = state.emphasis === s.id ? null : s.id; renderAll(); },
        onmouseenter: function () { state.emphasis = s.id; rerender(); },
        onmouseleave: function () { state.emphasis = null; rerender(); }
      }, [swatch(siteColor(s.slot)), el('span', { text: s.name })]));
    });
  }

  function renderSeriesTable(id, dates, series, caption, format) {
    var host = document.getElementById(id);
    clear(host);
    var head = [th('Date')].concat(series.map(function (s) {
      var cell = el('th', { scope: 'col' });
      cell.appendChild(siteKey(s.site));
      return cell;
    }));
    var body = el('tbody');
    // Newest first: the recent end is what anyone reads a table view for.
    dates.slice().reverse().forEach(function (date, n) {
      var i = dates.length - 1 - n;
      var tr = el('tr', {}, [el('th', { scope: 'row', text: dayLong(date) })]);
      series.forEach(function (s) { tr.appendChild(el('td', { text: format(s.values[i]) })); });
      body.appendChild(tr);
    });
    host.appendChild(tableOf(caption, head, body));
  }

  /* ── funnel ───────────────────────────────────────────────── */
  function funnelSteps(s, surface) {
    var defs = surface === 'chat' && s.chatFunnel.length ? s.chatFunnel : s.funnel;
    var list = rows(datesInScope(), s.id);
    var base = sum(list, 'sessions') * (surface === 'chat' && s.chat ? s.chat.sessionsShare : 1);
    return defs.map(function (d, i) {
      var value = base * (1 - d.cumulativeLoss);
      var prev = i ? base * (1 - defs[i - 1].cumulativeLoss) : null;
      return {
        label: d.label, value: value,
        rate: prev ? value / prev : 1,
        stepLoss: prev ? 1 - value / prev : 0,
        ofTop: value / base
      };
    });
  }

  function renderFunnelSurface() {
    var host = document.getElementById('funnel-surface');
    clear(host);
    var s = state.site === 'all' ? null : site(state.site);
    if (!s || !s.hasChat) { host.hidden = true; return; }
    host.hidden = false;
    [['site', 'Whole site'], ['chat', s.chatLabel]].forEach(function (pair) {
      host.appendChild(el('button', {
        type: 'button', 'aria-pressed': String(state.surface === pair[0]), text: pair[1],
        onclick: function () { if (state.surface !== pair[0]) { state.surface = pair[0]; renderAll(); } }
      }));
    });
  }

  function renderFunnel() {
    var host = document.getElementById('chart-funnel');
    clear(host);
    var tip = makeTooltip(host);

    // Across all sites, the funnel is the session-weighted blend.
    var sites = activeSites();
    var perSite = sites.map(function (s) { return funnelSteps(s, state.surface); });
    var steps = perSite[0].map(function (_, i) {
      var value = perSite.reduce(function (a, f) { return a + f[i].value; }, 0);
      return { label: perSite[0][i].label, value: value };
    });
    steps.forEach(function (st, i) {
      st.rate = i ? st.value / steps[i - 1].value : 1;
      st.stepLoss = 1 - st.rate;
      st.ofTop = st.value / steps[0].value;
      st.ramp = 'var(--ord-' + (i + 1) + ')';
    });

    // Bars are scaled to the step rate, not to the top of the funnel: the first
    // stage dwarfs the last, and a shared scale leaves the tail invisible.
    var endLabels = steps.map(function (s, i) { return count(s.value) + (i ? '  ' + pct(s.rate) : '  baseline'); });
    var longest = endLabels.reduce(function (a, b) { return b.length > a.length ? b : a; }, '');

    var width = Math.max(300, host.clientWidth || 520);
    var m = { top: 24, right: Math.min(124, Math.max(58, longest.length * 6.6 + 12)), bottom: 26,
              left: Math.min(120, Math.max(56, width * 0.24)) };
    var rowH = 46, barH = 24;
    var height = m.top + m.bottom + steps.length * rowH;
    var plotW = width - m.left - m.right;

    var root = svg('svg', { width: width, height: height, role: 'img',
      'aria-label': 'Funnel. Bar length is the share of the previous stage; counts are labelled at each bar end.' });

    [0, 0.5, 1].forEach(function (t) {
      var gx = m.left + t * plotW;
      root.appendChild(svg('line', { class: t === 0 ? 'baseline' : 'gridline',
        x1: gx, x2: gx, y1: m.top - 6, y2: m.top + steps.length * rowH }));
      root.appendChild(svg('text', { class: 'tick', x: gx, y: m.top + steps.length * rowH + 16,
        'text-anchor': t === 1 ? 'end' : t === 0 ? 'start' : 'middle', text: (t * 100) + '%' }));
    });
    root.appendChild(svg('text', { class: 'tick', x: m.left, y: m.top - 12, text: 'share of previous stage' }));

    steps.forEach(function (s, i) {
      var y = m.top + i * rowH + (rowH - barH) / 2;
      var w = Math.max(3, s.rate * plotW);
      root.appendChild(svg('text', { class: 'mark-label', x: m.left - 10, y: y + barH / 2 + 4,
        'text-anchor': 'end', text: s.label }));
      root.appendChild(svg('path', { d: endRoundedPathH(m.left, y, w, barH, 4), fill: s.ramp }));
      root.appendChild(svg('text', { class: 'mark-label', x: m.left + w + 8, y: y + barH / 2 + 4, text: endLabels[i] }));

      var prev = i ? steps[i - 1] : null;
      var hit = svg('rect', { class: 'hit', x: m.left, y: m.top + i * rowH, width: plotW + m.right - 8, height: rowH,
        tabindex: '0', role: 'button',
        'aria-label': s.label + ': ' + count(s.value) + (prev ? ', ' + pct(s.rate) + ' of ' + prev.label : '') });
      function show(ev) {
        var box = host.getBoundingClientRect();
        var px = ev && ev.clientX ? ev.clientX - box.left : m.left + w / 2;
        var lines = [{ label: 'Users', value: count(s.value) }];
        if (prev) lines.push({ label: 'From ' + prev.label, value: pct(s.rate) });
        lines.push({ label: 'Of ' + steps[0].label, value: pct(s.ofTop, 2) });
        tip.show(tipBody(s.label, lines), px, m.top + i * rowH + rowH / 2);
      }
      hit.addEventListener('mousemove', show);
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', tip.hide);
      hit.addEventListener('blur', tip.hide);
      root.appendChild(hit);
    });

    host.appendChild(root);

    var worst = steps.slice(1).reduce(function (a, b) { return b.stepLoss > a.stepLoss ? b : a; }, steps[1]);
    document.getElementById('funnel-callout').textContent =
      'Biggest single drop: ' + pct(worst.stepLoss, 0) + ' of users lost at ' + worst.label
      + '. End to end, ' + pct(1 - steps[steps.length - 1].ofTop, 0) + ' never reach '
      + steps[steps.length - 1].label + '.';

    var tHost = document.getElementById('table-funnel');
    clear(tHost);
    var body = el('tbody');
    steps.forEach(function (s, i) {
      body.appendChild(el('tr', {}, [
        el('th', { scope: 'row', text: s.label }),
        el('td', { text: count(s.value) }),
        el('td', { text: i ? pct(s.rate) : '—' }),
        el('td', { text: pct(s.ofTop, 2) })
      ]));
    });
    tHost.appendChild(tableOf('Funnel counts and step conversion for the current range.',
      [th('Stage'), th('Users'), th('Step rate'), th('Of ' + steps[0].label)], body));
  }

  /* ── traffic mix ──────────────────────────────────────────── */
  function renderMix() {
    var host = document.getElementById('table-mix');
    clear(host);
    var dates = datesInScope();
    var sites = activeSites();

    var totals = {};
    sites.forEach(function (s) {
      var sessions = sum(rows(dates, s.id), 'sessions');
      s.sources.forEach(function (src) {
        totals[src.label] = (totals[src.label] || 0) + sessions * src.share;
      });
    });
    var grand = Object.keys(totals).reduce(function (a, k) { return a + totals[k]; }, 0);
    var list = Object.keys(totals).map(function (k) { return { label: k, value: totals[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
    var max = list[0] ? list[0].value : 1;

    var body = el('tbody');
    list.forEach(function (r) {
      var barCell = el('td', { class: 'bar-cell' });
      var track = el('span', { class: 'bar-track' });
      var fill = el('span', { class: 'bar-fill' });
      fill.style.width = (r.value / max * 100).toFixed(1) + '%';
      track.appendChild(fill);
      barCell.appendChild(track);
      body.appendChild(el('tr', {}, [
        el('th', { scope: 'row', text: r.label }),
        el('td', { text: count(r.value) }),
        el('td', { text: pct(r.value / grand, 0) }),
        barCell
      ]));
    });
    host.appendChild(tableOf(null, [th('Source'), th('Sessions'), th('Share'), th('')], body));
  }

  /* ── scorecard ────────────────────────────────────────────── */
  function renderScorecard() {
    var host = document.getElementById('table-score');
    clear(host);
    var dates = datesInScope();
    var body = el('tbody');

    D.sites.forEach(function (s) {
      var list = rows(dates, s.id);
      var k = kpis(list);
      var tr = el('tr', { 'data-selected': String(state.site === 'all' || state.site === s.id) });
      var head = el('th', { scope: 'row' });
      head.appendChild(siteKey(s));
      tr.appendChild(head);
      [count(k.sessions), count(k.users), pct(k.conversion, 2), count(k.orders),
       moneyExact(k.revenue), money2(k.aov), money2(k.revPerUser),
       moneyExact(k.adSpend), k.roas.toFixed(1) + '×'
      ].forEach(function (v) { tr.appendChild(el('td', { text: v })); });
      tr.appendChild(el('td', {}, [statusPill(siteStatus(list))]));
      body.appendChild(tr);
    });

    var all = kpis(rows(dates, 'all'));
    var foot = el('tfoot', {}, [el('tr', {}, [
      el('th', { scope: 'row', text: 'All websites' }),
      el('td', { text: count(all.sessions) }), el('td', { text: count(all.users) }),
      el('td', { text: pct(all.conversion, 2) }), el('td', { text: count(all.orders) }),
      el('td', { text: moneyExact(all.revenue) }), el('td', { text: money2(all.aov) }),
      el('td', { text: money2(all.revPerUser) }), el('td', { text: moneyExact(all.adSpend) }),
      el('td', { text: all.roas.toFixed(1) + '×' }), el('td', {})
    ])]);

    host.appendChild(tableOf(null,
      [th('Website'), th('Sessions'), th('Users'), th('Conversion'), th('Orders'),
       th('Revenue'), th('AOV'), th('Rev / user'), th('Ad spend'), th('ROAS'), th('Health')],
      body, foot));
  }

  /* ── engagement ───────────────────────────────────────────── */
  function renderEngagement() {
    var host = document.getElementById('table-engage');
    clear(host);
    var body = el('tbody');

    D.sites.forEach(function (s) {
      var tr = el('tr', { 'data-selected': String(state.site === 'all' || state.site === s.id) });
      var head = el('th', { scope: 'row' });
      head.appendChild(siteKey(s));
      tr.appendChild(head);
      [count(s.email.sent), pct(s.email.open, 0), pct(s.email.click), pct(s.email.unsub, 1),
       s.hasChat ? s.chatLabel : '—',
       s.hasChat ? s.chat.msgsPerSession.toFixed(1) : '—',
       s.hasChat ? duration(s.chat.avgSeconds) : '—',
       pct(s.retention, 0)
      ].forEach(function (v) { tr.appendChild(el('td', { text: v })); });
      body.appendChild(tr);
    });

    host.appendChild(tableOf('Email figures are per campaign period; chat and retention are site settings.',
      [th('Website'), th('Emails sent'), th('Open'), th('Click'), th('Unsub'),
       th('Chat surface'), th('Msgs / session'), th('Avg. length'), th('Retention')],
      body));
  }

  /* ── orchestration ────────────────────────────────────────── */
  function renderAll() {
    var dates = datesInScope();
    var s = state.site === 'all' ? null : site(state.site);

    document.getElementById('page-title').textContent = s ? s.name : 'All websites';
    var sub = document.getElementById('page-sub');
    clear(sub);
    if (s) {
      sub.appendChild(el('a', { href: 'https://' + s.domain, target: '_blank', rel: 'noreferrer noopener', text: s.domain }));
      sub.appendChild(el('span', { text: ' · ' + dayLong(dates[0]) + ' – ' + dayLong(dates[dates.length - 1]) }));
    } else {
      sub.textContent = D.sites.length + ' websites · ' + dayLong(dates[0]) + ' – ' + dayLong(dates[dates.length - 1]);
    }

    renderNav();
    renderRanges();
    renderBanner();
    renderHero();
    renderTiles();
    renderHealth();
    renderAlerts();
    renderFunnelSurface();

    lineChart({
      host: 'chart-rev', legend: 'legend-rev', table: 'table-rev',
      value: function (list) { return sum(list, 'revenue'); },
      tickFormat: money, endFormat: money, zeroBased: true,
      totalLabel: 'All websites',
      caption: 'Daily revenue by website (USD).',
      ariaLabel: 'Lines: daily revenue per website. Table view has the values.'
    });

    lineChart({
      host: 'chart-load', legend: 'legend-load', table: 'table-load',
      value: function (list) { return mean(list, 'loadMs'); },
      tickFormat: ms, endFormat: ms,
      threshold: D.thresholds.loadMs.good,
      thresholdLabel: 'target ' + ms(D.thresholds.loadMs.good),
      caption: 'Daily median page load time by website.',
      ariaLabel: 'Lines: daily median page load time per website, against the target line.'
    });

    renderFunnel();
    renderMix();
    renderScorecard();
    renderEngagement();
  }

  function init() {
    document.querySelectorAll('[data-table-for]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById('table-' + btn.getAttribute('data-table-for'));
        var open = target.hidden;
        target.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? 'Hide table' : 'Table';
      });
    });

    document.getElementById('footnote').textContent =
      'Data through ' + dayLong(D.dates[D.dates.length - 1]) + '. ' + D.meta.note;

    // Charts are sized to their container in real pixels, so they are redrawn
    // whenever that container changes width.
    var widths = {}, frames = {};
    function watch(id, render) {
      var host = document.getElementById(id);
      widths[id] = host.clientWidth;
      if (!window.ResizeObserver) return;
      new ResizeObserver(function () {
        var w = host.clientWidth;
        if (Math.abs(w - widths[id]) < 2) return;
        widths[id] = w;
        cancelAnimationFrame(frames[id]);
        frames[id] = requestAnimationFrame(function () { widths[id] = host.clientWidth; render(); });
      }).observe(host);
    }
    watch('chart-rev', renderAll);
    watch('chart-load', renderAll);
    watch('chart-funnel', renderFunnel);

    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
