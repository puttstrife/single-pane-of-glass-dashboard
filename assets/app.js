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
  /* Compact trims chart heights and row pitch as well as padding — a density
     switch that only changes CSS still leaves the charts eating the page. */
  function compactMode() { return document.documentElement.getAttribute('data-density') === 'compact'; }

  /* Which sites show their page list. Independent of selection, so you can open
     one site's pages without leaving the site you are looking at — and collapse a
     long list to reach the site below it. */
  var expanded = {};
  try { expanded = JSON.parse(localStorage.getItem('spg-expanded') || '{}'); } catch (e) { expanded = {}; }
  function isExpanded(s) {
    return expanded[s.id] === undefined ? state.site === s.id : !!expanded[s.id];
  }
  function setExpanded(id, open) {
    expanded[id] = open;
    localStorage.setItem('spg-expanded', JSON.stringify(expanded));
  }

  var state = {
    density: localStorage.getItem('spg-density') || 'comfortable',
    range: '30d',
    site: 'all',
    page: null,        // a page id within the selected site, or null for the whole site
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
  function rows(dates, siteId, pageId) {
    var set = {}; dates.forEach(function (d) { set[d] = 1; });
    return D.daily.filter(function (r) {
      return set[r.date]
        && (!siteId || siteId === 'all' || r.site === siteId)
        && (!pageId || r.page === pageId);
    });
  }
  /* Uptime is an infrastructure fact about the site, not about one page. */
  function uptimeOf(dates, siteId) {
    var set = {}; dates.forEach(function (d) { set[d] = 1; });
    var list = D.siteDaily.filter(function (r) {
      return set[r.date] && (!siteId || siteId === 'all' || r.site === siteId);
    });
    return list.length ? mean(list, 'uptime') : 1;
  }
  function pageOf(s, id) {
    return s && s.pages.find(function (p) { return p.id === id; });
  }
  function scopeRows(dates) { return rows(dates, state.site, state.page); }
  function sum(list, key) { return list.reduce(function (a, r) { return a + r[key]; }, 0); }
  function mean(list, key) { return list.length ? sum(list, key) / list.length : 0; }
  function weighted(list, key) {
    var w = sum(list, 'sessions');
    if (!w) return mean(list, key);
    return list.reduce(function (a, r) { return a + r[key] * r.sessions; }, 0) / w;
  }

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
      // Session-weighted, so a low-traffic page can't drag the site average.
      loadMs: weighted(list, 'loadMs'), bounce: weighted(list, 'bounce'),
      errorRate: weighted(list, 'errorRate'), failedApi: weighted(list, 'failedApi'),
      jsErrors: sum(list, 'jsErrors'), rageClicks: sum(list, 'rageClicks')
    };
  }

  /* Thresholds → a named state. Most metrics are faults, where lower is better;
     these few are outcomes, where higher is. */
  var HIGHER_IS_BETTER = { uptime: 1, emailOpen: 1, emailClick: 1 };
  function statusOf(metric, value) {
    var t = D.thresholds[metric];
    if (!t) return null;
    if (HIGHER_IS_BETTER[metric]) {
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
  var KIND_LABEL = { landing: 'Landing', main: 'Main site', chat: 'Chat' };

  function siteStatus(list, uptime) {
    var k = kpis(list);
    k.uptime = uptime;
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
    if (span <= 0) return [min, min + 1];
    var raw = span / (target || 4);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; })
      .find(function (s) { return s >= raw; }) || 10 * mag;
    var start = Math.floor(min / step) * step;
    var out = [];
    for (var v = start; v <= max + step * 0.001; v += step) out.push(+v.toFixed(6));
    // The top tick IS the plot ceiling, so it has to sit at or above the peak —
    // otherwise the line is drawn outside the plot and clipped by the card.
    if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(6));
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
      var status = siteStatus(rows(dates, s.id), uptimeOf(dates, s.id));
      var hasPages = s.pages.length > 1;
      var open = hasPages && isExpanded(s);
      var listId = 'nav-pages-' + s.id;

      var row = el('div', { class: 'nav-row' });
      row.appendChild(el('button', {
        type: 'button', class: 'nav-main', 'aria-current': String(state.site === s.id && !state.page),
        onclick: function () { select(s.id, null); }
      }, [
        el('span', { class: 'status-dot', 'data-status': status, 'aria-hidden': 'true' }),
        el('span', { class: 'nav-name' }, [
          el('span', { text: s.name }),
          // Second line is the status, not the domain: at 240px the domain and a
          // status label together wrap, and the domain is in the page header
          // the moment you select the site.
          el('span', { class: 'nav-domain' }, [
            el('span', { class: 'nav-status', 'data-status': status, text: STATUS_META[status].label })
          ])
        ])
      ]));

      // The chevron opens the page list without selecting the site, so a long
      // list can be folded away to reach the site under it.
      if (hasPages) {
        row.appendChild(el('button', {
          type: 'button', class: 'nav-chev', 'aria-expanded': String(open), 'aria-controls': listId,
          'aria-label': (open ? 'Hide' : 'Show') + ' pages of ' + s.name,
          onclick: function () { setExpanded(s.id, !open); renderNav(); }
        }, [el('span', { class: 'chev', 'aria-hidden': 'true', text: '⌃' })]));
      }
      host.appendChild(row);

      if (!open) return;
      var list = el('div', { class: 'nav-pages', id: listId });
      host.appendChild(list);
      s.pages.forEach(function (p) {
        var pageRows = rows(dates, s.id, p.id);
        var k = kpis(pageRows);
        list.appendChild(el('button', {
          type: 'button', class: 'nav-sub', 'aria-current': String(state.page === p.id),
          onclick: function () { select(s.id, p.id); }
        }, [
          el('span', { class: 'page-kind', 'data-kind': p.kind, 'aria-hidden': 'true' }),
          el('span', { class: 'nav-name' }, [
            el('span', { text: p.name }),
            el('span', { class: 'nav-domain', text: pct(k.conversion, 2) + ' conversion' })
          ]),
          el('span', { class: 'nav-meta', text: compact(k.sessions) })
        ]));
      });
    });

    document.getElementById('sidebar-foot').textContent =
      'Monitoring ' + D.sites.length + ' sites · ' + D.meta.days + ' days of history';
  }
  function select(id, pageId) {
    if (state.site === id && state.page === (pageId || null)) return;
    state.site = id;
    state.page = pageId || null;
    state.emphasis = null;
    if (id !== 'all') setExpanded(id, true);
    var s = site(id);
    var p = pageOf(s, state.page);
    // A chat page has only one funnel worth showing; anything else defaults back.
    state.surface = p && p.kind === 'chat' ? 'chat' : 'site';
    if (!s || !s.hasChat) state.surface = 'site';
    renderAll();
  }
  function scopeLabel() {
    var s = site(state.site);
    if (!s) return 'all websites';
    var p = pageOf(s, state.page);
    return p ? s.name + ' · ' + p.name : s.name;
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
    scopeRows(dates).forEach(function (r) {
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
    var curr = kpis(scopeRows(dates));
    var past = kpis(scopeRows(priorDates()));

    document.getElementById('hero-scope').textContent =
      'Last ' + rangeDef().days + ' days · ' + scopeLabel();
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
      return sum(scopeRows([d]), 'revenue');
    }), 320, compactMode() ? 40 : 56));
  }

  function renderTiles() {
    var host = document.getElementById('tiles');
    clear(host);
    var dates = datesInScope();
    var curr = kpis(scopeRows(dates));
    var past = kpis(scopeRows(priorDates()));
    var trend = function (fn) { return dates.map(function (d) { return fn(kpis(scopeRows([d]))); }); };

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
      // Compact shrinks the sparkline rather than dropping it — the delta says
      // how much, the line says what shape got there.
      tile.appendChild(sparkline(d.series, 120, compactMode() ? 18 : 30));
      if (d.foot) tile.appendChild(el('span', { class: 'target', text: d.foot }));
      host.appendChild(tile);
    });
  }

  /* ── site health table ────────────────────────────────────── */
  function renderHealth() {
    var host = document.getElementById('table-health');
    clear(host);
    var dates = datesInScope();
    var s = site(state.site);
    // Drilled into a site with variants, the health table becomes its pages —
    // that is where a regression actually lives.
    var byPage = !!(s && s.pages.length > 1);

    var body = el('tbody');
    var entries = byPage
      ? s.pages.map(function (p) {
          return { key: p.id, label: p.name, sub: p.kind, list: rows(dates, s.id, p.id),
                   uptime: uptimeOf(dates, s.id), selected: !state.page || state.page === p.id };
        })
      : D.sites.map(function (x) {
          return { key: x.id, label: x.name, sub: x.domain, slot: x.slot, list: rows(dates, x.id),
                   uptime: uptimeOf(dates, x.id), selected: state.site === 'all' || state.site === x.id };
        });

    entries.forEach(function (e) {
      var k = kpis(e.list);
      k.uptime = e.uptime;
      var tr = el('tr', { 'data-selected': String(e.selected) });
      var head = el('th', { scope: 'row' });
      if (e.slot) head.appendChild(el('span', { class: 'series-key' }, [swatch(siteColor(e.slot)), el('span', { text: e.label })]));
      else head.appendChild(el('span', { text: e.label }));
      head.appendChild(el('span', { class: 'row-sub', text: e.sub }));
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
      tr.appendChild(el('td', {}, [statusPill(siteStatus(e.list, e.uptime))]));
      body.appendChild(tr);
    });

    host.appendChild(tableOf(null,
      [th(byPage ? 'Page' : 'Website'), th('Uptime'), th('Median load'), th('Error rate'),
       th('Failed API'), th('JS errors'), th('Rage clicks'), th('Status')],
      body));

    document.getElementById('health-hint').textContent =
      (byPage ? 'Pages of ' + s.name + ' · uptime is site-level · ' : '')
      + 'thresholds: uptime ' + uptimePct(D.thresholds.uptime.good)
      + ', load ' + ms(D.thresholds.loadMs.good)
      + ', errors ' + pct(D.thresholds.errorRate.good, 0);
  }

  /* ── computed alerts (replaces a hand-written insight list) ─ */
  function renderAlerts() {
    var host = document.getElementById('alerts');
    clear(host);
    var dates = datesInScope();
    var found = [];

    // Scope: all sites → one entry per site; a site → one per page; a page → it.
    var scopes = [];
    D.sites.forEach(function (s) {
      if (state.site !== 'all' && state.site !== s.id) return;
      if (state.site === 'all' || s.pages.length < 2) {
        scopes.push({ label: s.name, site: s, list: rows(dates, s.id), prior: rows(priorDates(), s.id) });
      } else {
        s.pages.forEach(function (p) {
          if (state.page && state.page !== p.id) return;
          scopes.push({ label: s.name + ' · ' + p.name, site: s, page: p,
            list: rows(dates, s.id, p.id), prior: rows(priorDates(), s.id, p.id) });
        });
      }
    });

    scopes.forEach(function (sc) {
      var k = kpis(sc.list);
      k.uptime = uptimeOf(dates, sc.site.id);
      var past = kpis(sc.prior);

      [['uptime', 'Uptime ' + uptimePct(k.uptime), 'warning', !sc.page],
       ['loadMs', 'Median load ' + ms(k.loadMs), 'warning', true],
       ['errorRate', 'Error rate ' + pct(k.errorRate, 2), 'warning', true],
       ['failedApi', 'Failed API calls ' + pct(k.failedApi, 2), 'warning', true],
       // Bounce drifts over its target constantly; only a critical read is news.
       ['bounce', 'Bounce rate ' + pct(k.bounce), 'critical', true]
      ].forEach(function (row) {
        if (!row[3]) return;
        var st = statusOf(row[0], k[row[0]]);
        if (st === 'good') return;
        if (row[2] === 'critical' && st !== 'critical') return;
        found.push({ status: st, label: sc.label, text: row[1] + ' is outside the healthy band.' });
      });

      if (past.revenue && (k.revenue - past.revenue) / past.revenue < -0.1) {
        found.push({ status: 'critical', label: sc.label,
          text: 'Revenue down ' + pct(Math.abs((k.revenue - past.revenue) / past.revenue))
                + ' against the prior ' + rangeDef().days + ' days.' });
      }
    });

    // A variant that converts far below its siblings is a finding, not a metric.
    D.sites.forEach(function (s) {
      if (state.site !== 'all' && state.site !== s.id) return;
      var landings = s.pages.filter(function (p) { return p.kind === 'landing'; });
      if (landings.length < 2) return;
      var scored = landings.map(function (p) {
        return { page: p, conv: kpis(rows(dates, s.id, p.id)).conversion };
      }).sort(function (a, b) { return b.conv - a.conv; });
      var best = scored[0], worst = scored[scored.length - 1];
      if (!best.conv || (best.conv - worst.conv) / best.conv < 0.2) return;
      if (state.page && state.page !== worst.page.id) return;
      found.push({ status: 'warning', label: s.name + ' · ' + worst.page.name,
        text: 'Converts at ' + pct(worst.conv, 2) + ' against ' + pct(best.conv, 2)
              + ' on ' + best.page.name + ' — ' + pct((best.conv - worst.conv) / best.conv, 0) + ' behind the best version.' });
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
          el('strong', { text: a.label }),
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
    // Only the all-sites view is multi-series. Drilled into a site, comparing its
    // eight pages as eight lines would need eight validated hues; the page
    // comparison belongs in the Page versions card, as bars.
    var sites = state.site === 'all' ? D.sites : [];
    var width = Math.max(300, host.clientWidth || 520);
    var m = { top: 16, right: 58, bottom: 28, left: 52 };
    var height = compactMode() ? 190 : 260;
    var plotW = width - m.left - m.right;
    var plotH = height - m.top - m.bottom;

    var series = sites.length
      ? sites.map(function (s) {
          return { site: s, name: s.name, slot: s.slot,
            values: dates.map(function (d) { return opts.value(rows([d], s.id)); }) };
        })
      : [{ site: site(state.site), name: scopeLabel(), slot: site(state.site).slot,
           values: dates.map(function (d) { return opts.value(scopeRows([d])); }) }];

    var all = series.reduce(function (a, s) { return a.concat(s.values); }, []);
    var max = Math.max.apply(null, all);
    var min = opts.zeroBased ? 0 : Math.min.apply(null, all);
    // Keep the target inside the domain: a threshold you can't see tells you
    // nothing about how far over it you are.
    if (opts.threshold !== undefined) {
      max = Math.max(max, opts.threshold);
      min = Math.min(min, opts.threshold);
    }
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
      var path = svg('path', { d: d, fill: 'none', stroke: siteColor(s.slot), 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      var dot = svg('circle', { cx: x(s.values.length - 1), cy: y(s.values[s.values.length - 1]), r: 4.5,
        fill: siteColor(s.slot), stroke: token('--card'), 'stroke-width': 2 });
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
          return s.name + ' ' + opts.endFormat(s.values[i]);
        }).join(', ') });
      function show(ev) {
        crosshair.setAttribute('x1', x(i)); crosshair.setAttribute('x2', x(i));
        crosshair.setAttribute('opacity', 1);
        var box = host.getBoundingClientRect();
        var px = ev && ev.clientX ? ev.clientX - box.left : x(i);
        var lines = series.map(function (s) {
          return { color: siteColor(s.slot), label: s.name, value: opts.endFormat(s.values[i]) };
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
      cell.appendChild(el('span', { class: 'series-key' }, [swatch(siteColor(s.slot)), el('span', { text: s.name })]));
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
  function funnelSteps(s, surface, pageId) {
    var defs = surface === 'chat' && s.chatFunnel.length ? s.chatFunnel : s.funnel;
    var list = rows(datesInScope(), s.id, pageId);
    // With a page selected the base is that page's own sessions; without one, the
    // chat funnel starts from the share of sessions that reach chat.
    var base = sum(list, 'sessions') * (!pageId && surface === 'chat' && s.chat ? s.chat.sessionsShare : 1);
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
    var perSite = sites.map(function (s) { return funnelSteps(s, state.surface, state.page); });
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
    var rowH = compactMode() ? 36 : 46, barH = compactMode() ? 20 : 24;
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

  /* ── page versions — the A/B comparison the source only hinted at ── */
  function renderPages() {
    var card = document.getElementById('card-pages');
    var host = document.getElementById('table-pages');
    var hint = document.getElementById('pages-hint');
    var callout = document.getElementById('pages-callout');
    clear(host);
    callout.textContent = '';

    var dates = datesInScope();
    // Which sites contribute rows: the selected one, or every site with variants.
    var sites = (state.site === 'all' ? D.sites : [site(state.site)])
      .filter(function (s) { return s && s.pages.length > 1; });
    if (!sites.length) { card.hidden = true; return; }
    card.hidden = false;

    var list = [];
    sites.forEach(function (s) {
      s.pages.forEach(function (p) {
        var k = kpis(rows(dates, s.id, p.id));
        list.push({ site: s, page: p, k: k,
          revPerSession: k.sessions ? k.revenue / k.sessions : 0 });
      });
    });
    list.sort(function (a, b) { return b.k.conversion - a.k.conversion; });

    var maxConv = list[0] ? list[0].k.conversion : 1;

    var body = el('tbody');
    list.forEach(function (r) {
      var selected = !state.page || state.page === r.page.id;
      var tr = el('tr', { 'data-selected': String(selected) });

      var head = el('th', { scope: 'row' });
      var nameBtn = el('button', {
        class: 'link-cell', type: 'button', text: r.page.name,
        onclick: function () { select(r.site.id, r.page.id); }
      });
      head.appendChild(el('span', { class: 'series-key' }, [
        el('span', { class: 'page-kind', 'data-kind': r.page.kind, 'aria-hidden': 'true' }), nameBtn
      ]));
      if (state.site === 'all') head.appendChild(el('span', { class: 'row-sub', text: r.site.name }));
      tr.appendChild(head);

      tr.appendChild(el('td', { text: KIND_LABEL[r.page.kind] || r.page.kind }));
      tr.appendChild(el('td', { text: count(r.k.sessions) }));
      tr.appendChild(el('td', { text: pct(r.page.share, 1) }));

      // Conversion carries a bar as well as a number: this card exists to be
      // scanned for the outlier, and length reads faster than digits.
      var convCell = el('td', { class: 'bar-cell' });
      convCell.appendChild(el('span', { class: 'bar-value', text: pct(r.k.conversion, 2) }));
      var track = el('span', { class: 'bar-track' });
      var fill = el('span', { class: 'bar-fill' });
      fill.style.width = (r.k.conversion / maxConv * 100).toFixed(1) + '%';
      track.appendChild(fill);
      convCell.appendChild(track);
      tr.appendChild(convCell);

      tr.appendChild(el('td', { text: count(r.k.orders) }));
      tr.appendChild(el('td', { text: money2(r.revPerSession) }));
      tr.appendChild(el('td', { text: pct(r.k.bounce) }));
      var loadCell = el('td');
      loadCell.appendChild(el('span', { class: 'metric', 'data-status': statusOf('loadMs', r.k.loadMs), text: ms(r.k.loadMs) }));
      tr.appendChild(loadCell);
      body.appendChild(tr);
    });

    host.appendChild(tableOf(null,
      [th('Page'), th('Type'), th('Sessions'), th('Traffic share'), th('Conversion'),
       th('Orders'), th('Rev / session'), th('Bounce'), th('Median load')],
      body));

    hint.textContent = sites.length === 1
      ? sites[0].pages.length + ' versions of ' + sites[0].name
      : list.length + ' versions across ' + sites.length + ' sites';

    // Compare like with like: a chat entry and a landing page are different jobs,
    // so the headline gap is drawn from the page type with the widest spread.
    var groups = {};
    list.forEach(function (r) { (groups[r.page.kind] = groups[r.page.kind] || []).push(r); });
    var pick = null;
    Object.keys(groups).forEach(function (kind) {
      var g = groups[kind];
      if (g.length < 2) return;
      var best = g[0], worst = g[g.length - 1];
      if (!best.k.conversion) return;
      var gap = (best.k.conversion - worst.k.conversion) / best.k.conversion;
      if (!pick || gap > pick.gap) pick = { kind: kind, best: best, worst: worst, gap: gap };
    });

    if (pick) {
      var site_ = function (r) { return state.site === 'all' ? ' (' + r.site.name + ')' : ''; };
      callout.textContent =
        'Among ' + (KIND_LABEL[pick.kind] || pick.kind).toLowerCase() + ' pages: '
        + pick.best.page.name + site_(pick.best) + ' converts best at ' + pct(pick.best.k.conversion, 2) + '. '
        + pick.worst.page.name + site_(pick.worst) + ' is ' + pct(pick.gap, 0)
        + ' behind at ' + pct(pick.worst.k.conversion, 2)
        + ', on ' + count(pick.worst.k.sessions) + ' sessions — worth '
        + moneyExact(pick.worst.k.sessions * (pick.best.revPerSession - pick.worst.revPerSession))
        + ' if it matched the best version.';
    }
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
    host.appendChild(tableOf(
      state.page ? 'Source split is recorded per site, so this is ' + siteName(state.site) + ' as a whole.' : null,
      [th('Source'), th('Sessions'), th('Share'), th('')], body));
  }

  /* ── scoreboard ───────────────────────────────────────────── */
  function biggestDrop(s) {
    var steps = funnelSteps(s, 'site');
    return steps.slice(1).reduce(function (a, b) { return b.stepLoss > a.stepLoss ? b : a; }, steps[1]);
  }

  function renderScorecard() {
    var host = document.getElementById('table-score');
    clear(host);
    var dates = datesInScope();
    var body = el('tbody');

    D.sites.forEach(function (s) {
      var list = rows(dates, s.id);
      var k = kpis(list);
      var drop = biggestDrop(s);
      var tr = el('tr', { 'data-selected': String(state.site === 'all' || state.site === s.id) });
      var head = el('th', { scope: 'row' });
      head.appendChild(siteKey(s));
      tr.appendChild(head);

      [count(k.sessions), count(k.users), pct(k.conversion, 2), count(k.orders),
       moneyExact(k.revenue), money2(k.aov), money2(k.revPerUser), k.roas.toFixed(1) + '×'
      ].forEach(function (v) { tr.appendChild(el('td', { text: v })); });

      // Biggest drop is the source's most useful column — keep it, and name the
      // step rather than only the percentage.
      var dropCell = el('td');
      dropCell.appendChild(el('span', { class: 'metric', 'data-status': drop.stepLoss >= 0.35 ? 'warning' : null,
        text: drop.label + '  −' + pct(drop.stepLoss, 0) }));
      tr.appendChild(dropCell);

      var trendCell = el('td', { class: 'trend-cell' });
      trendCell.appendChild(sparkline(dates.map(function (d) {
        return sum(rows([d], s.id), 'revenue');
      }), 92, 24));
      tr.appendChild(trendCell);

      tr.appendChild(el('td', {}, [statusPill(siteStatus(list, uptimeOf(dates, s.id)))]));
      body.appendChild(tr);
    });

    var all = kpis(rows(dates, 'all'));
    var foot = el('tfoot', {}, [el('tr', {}, [
      el('th', { scope: 'row', text: 'All websites' }),
      el('td', { text: count(all.sessions) }), el('td', { text: count(all.users) }),
      el('td', { text: pct(all.conversion, 2) }), el('td', { text: count(all.orders) }),
      el('td', { text: moneyExact(all.revenue) }), el('td', { text: money2(all.aov) }),
      el('td', { text: money2(all.revPerUser) }), el('td', { text: all.roas.toFixed(1) + '×' }),
      el('td', {}), el('td', {}), el('td', {})
    ])]);

    host.appendChild(tableOf(null,
      [th('Website'), th('Sessions'), th('Users'), th('Conversion'), th('Orders'),
       th('Revenue'), th('AOV'), th('Rev / user'), th('ROAS'),
       th('Biggest drop'), th('Revenue trend'), th('Health')],
      body, foot));
  }

  /* ── email ────────────────────────────────────────────────── */
  function renderEmail() {
    var host = document.getElementById('table-email');
    var split = document.getElementById('email-split');
    clear(host); clear(split);

    var body = el('tbody');
    D.sites.forEach(function (s) {
      var e = s.email;
      var tr = el('tr', { 'data-selected': String(state.site === 'all' || state.site === s.id) });
      var head = el('th', { scope: 'row' });
      head.appendChild(siteKey(s));
      tr.appendChild(head);
      tr.appendChild(el('td', { text: count(e.sent) }));
      [['emailOpen', e.open, pct(e.open, 0)], ['emailClick', e.click, pct(e.click)],
       ['emailUnsub', e.unsub, pct(e.unsub, 1)]
      ].forEach(function (m) {
        var cell = el('td');
        cell.appendChild(el('span', { class: 'metric', 'data-status': statusOf(m[0], m[1]), text: m[2] }));
        tr.appendChild(cell);
      });
      // Clicks per open says whether the body worked, separately from the subject.
      tr.appendChild(el('td', { text: e.open ? pct(e.click / e.open) : '—' }));
      tr.appendChild(el('td', { text: count(e.sent * e.click) }));
      body.appendChild(tr);
    });

    host.appendChild(tableOf(null,
      [th('Website'), th('Sent'), th('Open'), th('Click'), th('Unsub'),
       th('Click to open'), th('Clicks')], body));

    document.getElementById('email-hint').textContent =
      'Per campaign period, not the selected range · benchmarks: open '
      + pct(D.thresholds.emailOpen.good, 0) + ', click ' + pct(D.thresholds.emailClick.good, 0)
      + ', unsub under ' + pct(D.thresholds.emailUnsub.good, 1);

    // Campaigns and top buyers sit side by side under the table.
    var shown = state.site === 'all' ? D.sites : [site(state.site)];

    var campaigns = [];
    shown.forEach(function (s) {
      s.email.campaigns.forEach(function (c) { campaigns.push({ site: s, c: c }); });
    });
    campaigns.sort(function (a, b) { return b.c.open - a.c.open; });

    var campBody = el('tbody');
    campaigns.forEach(function (r) {
      var nameCell = el('th', { scope: 'row', text: r.c.name });
      if (state.site === 'all') nameCell.appendChild(el('span', { class: 'row-sub', text: r.site.name }));

      // Against the site's own average, in points — the only comparison that
      // says whether a campaign did well, and one a reader can check.
      var diff = r.c.open - r.site.email.open;
      var vs = el('span', { class: 'delta', 'data-dir': Math.abs(diff) < 0.005 ? 'flat' : diff > 0 ? 'good' : 'bad' }, [
        el('span', { class: 'arrow', 'aria-hidden': 'true', text: Math.abs(diff) < 0.005 ? '→' : diff > 0 ? '↑' : '↓' }),
        el('span', { text: (diff > 0 ? '+' : '') + (diff * 100).toFixed(1) + ' pts' })
      ]);

      campBody.appendChild(el('tr', {}, [
        nameCell,
        el('td', {}, [el('span', { class: 'metric', 'data-status': statusOf('emailOpen', r.c.open), text: pct(r.c.open, 0) })]),
        el('td', {}, [vs])
      ]));
    });
    var campWrap = el('div', { class: 'table-wrap scroll-cap' });
    campWrap.appendChild(tableOf('Campaign open rate, against its own site average.',
      [th('Campaign'), th('Open'), th('vs. site avg')], campBody));

    var buyers = [];
    shown.forEach(function (s) {
      s.email.topBuyers.forEach(function (b) { buyers.push({ site: s, b: b }); });
    });
    buyers.sort(function (a, b) { return b.b.revenue - a.b.revenue; });
    buyers = buyers.slice(0, 8);
    var buyerTotal = buyers.reduce(function (a, r) { return a + r.b.revenue; }, 0);

    var buyerBody = el('tbody');
    buyers.forEach(function (r, i) {
      var nameCell = el('th', { scope: 'row' }, [
        el('span', { class: 'rank', 'aria-hidden': 'true', text: String(i + 1) }),
        el('span', { text: r.b.name })
      ]);
      if (state.site === 'all') nameCell.appendChild(el('span', { class: 'row-sub', text: r.site.name }));
      buyerBody.appendChild(el('tr', {}, [
        nameCell,
        el('td', { text: moneyExact(r.b.revenue) }),
        el('td', { text: buyerTotal ? pct(r.b.revenue / buyerTotal, 0) : '—' })
      ]));
    });
    var buyerWrap = el('div', { class: 'table-wrap scroll-cap' });
    buyerWrap.appendChild(tableOf('Top buyers by revenue. Contact details deliberately left out of the view.',
      [th('Buyer'), th('Revenue'), th('Share of top 8')], buyerBody));

    split.appendChild(campWrap);
    split.appendChild(buyerWrap);
  }

  /* ── chat & retention ─────────────────────────────────────── */
  function renderChat() {
    var host = document.getElementById('table-chat');
    clear(host);
    var dates = datesInScope();
    var body = el('tbody');

    D.sites.forEach(function (s) {
      var tr = el('tr', { 'data-selected': String(state.site === 'all' || state.site === s.id) });
      var head = el('th', { scope: 'row' });
      head.appendChild(siteKey(s));
      tr.appendChild(head);

      if (!s.hasChat) {
        tr.appendChild(el('td', { class: 'muted-cell', colspan: '5', text: 'No chat surface' }));
        tr.appendChild(el('td', { text: pct(s.retention, 0) }));
        body.appendChild(tr);
        return;
      }

      var chatPages = s.pages.filter(function (p) { return p.kind === 'chat'; });
      var chatRows = D.daily.filter(function (r) {
        return r.site === s.id && dates.indexOf(r.date) >= 0
          && chatPages.some(function (p) { return p.id === r.page; });
      });
      var k = kpis(chatRows);
      var chatFunnelEnd = s.chatFunnel.length ? s.chatFunnel[s.chatFunnel.length - 1].cumulativeLoss : 0;

      tr.appendChild(el('td', { text: s.chatLabel }));
      tr.appendChild(el('td', { text: count(k.sessions) }));
      tr.appendChild(el('td', { text: s.chat.msgsPerSession.toFixed(1) }));
      tr.appendChild(el('td', { text: duration(s.chat.avgSeconds) }));
      tr.appendChild(el('td', { text: pct(chatFunnelEnd, 0) }));
      tr.appendChild(el('td', { text: pct(s.retention, 0) }));
      body.appendChild(tr);
    });

    host.appendChild(tableOf(null,
      [th('Website'), th('Surface'), th('Chat sessions'), th('Msgs / session'),
       th('Avg. length'), th('Drop before purchase'), th('Retention')], body));
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
    renderPages();
    renderMix();
    renderScorecard();
    renderEmail();
    renderChat();
  }

  function applyDensity() {
    document.documentElement.setAttribute('data-density', state.density);
    document.querySelectorAll('[data-density]').forEach(function (b) {
      if (b === document.documentElement) return;
      b.setAttribute('aria-pressed', String(b.getAttribute('data-density') === state.density));
    });
  }

  /* ── folding ──────────────────────────────────────────────────
     A single pane should fit on a screen or two. The monitoring blocks stay
     open; the reference blocks (traffic mix, email, chat) start folded and
     remember what you choose. */
  function setupFolds() {
    document.querySelectorAll('.grid > section').forEach(function (card, i) {
      var head = card.querySelector('.card-head');
      var heading = head.querySelector('h2');
      var id = heading.id || ('card-' + i);
      var saved = localStorage.getItem('spg-fold-' + id);
      var open = saved ? saved === 'open' : card.getAttribute('data-fold') !== 'closed';

      var btn = el('button', {
        class: 'fold', type: 'button',
        'aria-expanded': String(open),
        'aria-label': (open ? 'Collapse ' : 'Expand ') + heading.textContent
      }, [el('span', { class: 'chev', 'aria-hidden': 'true', text: '⌃' })]);

      function apply(next) {
        card.setAttribute('data-folded', String(!next));
        btn.setAttribute('aria-expanded', String(next));
        btn.setAttribute('aria-label', (next ? 'Collapse ' : 'Expand ') + heading.textContent);
        localStorage.setItem('spg-fold-' + id, next ? 'open' : 'closed');
      }
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('aria-expanded') !== 'true';
        apply(next);
        if (next) renderAll();   // charts inside were sized against a hidden box
      });
      apply(open);
      head.insertBefore(btn, head.firstChild);
    });
  }

  function init() {
    document.querySelectorAll('#density button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.density = b.getAttribute('data-density');
        localStorage.setItem('spg-density', state.density);
        applyDensity();
        renderAll();     // charts re-measure against the new pitch
      });
    });

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

    applyDensity();
    setupFolds();
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
