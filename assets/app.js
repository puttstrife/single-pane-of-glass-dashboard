/* Marketing performance — single pane of glass.
   Vanilla JS, no dependencies. Charts are hand-built SVG so the whole thing
   opens from the filesystem and inherits the design tokens in styles.css. */
(function () {
  'use strict';

  var D = window.DASHBOARD_DATA;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ── chart colours come from the CSS tokens, never hard-coded here ── */
  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function seriesColor(slot) { return token('--series-' + slot); }

  /* ── formatting ───────────────────────────────────────────── */
  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthShort(key) {
    var p = key.split('-');
    return MONTH_NAMES[+p[1] - 1] + " '" + p[0].slice(2);
  }
  function monthLong(key) {
    var p = key.split('-');
    return MONTH_NAMES[+p[1] - 1] + ' ' + p[0];
  }
  function compact(n) {
    var abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e4) return Math.round(n / 1e3) + 'K';
    if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }
  function money(n) { return '$' + compact(n); }
  function moneyExact(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function count(n) { return Math.round(n).toLocaleString('en-US'); }
  function pct(n, dp) { return (n * 100).toFixed(dp === undefined ? 1 : dp) + '%'; }

  /* ── state ────────────────────────────────────────────────── */
  var state = {
    period: 6,
    channel: 'all',
    emphasis: null           // channel id hovered/pressed in the legend
  };

  function monthsInScope() { return D.months.slice(-state.period); }
  function priorMonths() {
    var end = D.months.length - state.period;
    return D.months.slice(Math.max(0, end - state.period), end);
  }
  function activeChannels() {
    return state.channel === 'all' ? D.channels : D.channels.filter(function (c) { return c.id === state.channel; });
  }
  function rowsFor(months, channelId) {
    var mset = {}; months.forEach(function (m) { mset[m] = 1; });
    return D.series.filter(function (r) {
      return mset[r.month] && (!channelId || channelId === 'all' || r.channel === channelId);
    });
  }
  function sum(rows, key) { return rows.reduce(function (s, r) { return s + r[key]; }, 0); }

  function kpis(rows) {
    var spend = sum(rows, 'spend'), mqls = sum(rows, 'mqls'), sqls = sum(rows, 'sqls');
    var customers = sum(rows, 'customers'), pipeline = sum(rows, 'pipeline'), revenue = sum(rows, 'revenue');
    return {
      spend: spend, mqls: mqls, sqls: sqls, customers: customers,
      pipeline: pipeline, revenue: revenue,
      cac: customers ? spend / customers : 0,
      cpm: mqls ? spend / mqls : 0,
      roas: spend ? revenue / spend : 0,
      mqlToSql: mqls ? sqls / mqls : 0
    };
  }

  /* ── small DOM helpers ────────────────────────────────────── */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    apply(n, attrs, kids); return n;
  }
  function svg(tag, attrs, kids) {
    var n = document.createElementNS(SVG_NS, tag);
    apply(n, attrs, kids); return n;
  }
  function apply(n, attrs, kids) {
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function swatchSpan(color) {
    var s = el('span', { class: 'swatch' }); s.style.background = color; return s;
  }

  /* Nice round axis ticks. */
  function niceTicks(max, target) {
    if (max <= 0) return [0, 1];
    var raw = max / (target || 4);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; })
      .find(function (s) { return s >= raw; }) || 10 * mag;
    var ticks = [], v = 0;
    while (v < max + step * 0.001) { ticks.push(v); v += step; }
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }

  /* Rounded data-end at the top, square at the baseline. */
  function topRoundedPath(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return 'M' + x + ',' + (y + h) +
           'V' + (y + r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + -r +
           'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
           'V' + (y + h) + 'Z';
  }
  function endRoundedPathH(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, h / 2, w));
    return 'M' + x + ',' + y +
           'h' + (w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
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
        var top = y - tb.height - 12;
        if (top < 0) top = y + 16;
        tip.style.left = left + 'px'; tip.style.top = top + 'px';
      },
      hide: function () { tip.removeAttribute('data-open'); }
    };
  }
  function tipBody(title, rows, total) {
    var dl = el('dl');
    rows.forEach(function (r) {
      dl.appendChild(r.color ? swatchSpan(r.color) : el('span'));
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
    var lowerIsBetter = !!opts.lowerIsBetter;
    var span = el('span', { class: 'delta' });
    if (!prev) { span.setAttribute('data-dir', 'flat'); span.textContent = 'no prior period'; return span; }
    var change = (curr - prev) / Math.abs(prev);
    var up = change > 0;
    var flat = Math.abs(change) < 0.005;
    var good = flat ? 'flat' : ((up && !lowerIsBetter) || (!up && lowerIsBetter)) ? 'good' : 'bad';
    span.setAttribute('data-dir', good);
    span.appendChild(el('span', { class: 'arrow', 'aria-hidden': 'true', text: flat ? '→' : up ? '▲' : '▼' }));
    span.appendChild(el('span', { text: (up ? '+' : '') + (change * 100).toFixed(1) + '%' }));
    span.appendChild(el('span', { class: 'vs', text: opts.vs || 'vs. prior period' }));
    return span;
  }

  /* ── sparkline (12 points, current period in the accent) ──── */
  function sparkline(values, width, height) {
    var w = width || 108, h = height || 26, pad = 3;
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var span = (max - min) || 1;
    var x = function (i) { return pad + i * ((w - pad * 2) / Math.max(1, values.length - 1)); };
    var y = function (v) { return h - pad - ((v - min) / span) * (h - pad * 2); };
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('');
    return svg('svg', { class: 'spark', width: w, height: h, 'aria-hidden': 'true', focusable: 'false' }, [
      svg('path', { d: d, fill: 'none', stroke: token('--muted'), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.55 }),
      svg('circle', { cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 4, fill: token('--brand'), stroke: token('--card'), 'stroke-width': 2 })
    ]);
  }

  /* ── hero + tiles ─────────────────────────────────────────── */
  function renderHero() {
    var months = monthsInScope(), prev = priorMonths();
    var curr = kpis(rowsFor(months, state.channel));
    var past = kpis(rowsFor(prev, state.channel));
    var target = D.targets.pipelinePerMonth * months.length *
      (state.channel === 'all' ? 1 : 1 / D.channels.length);

    document.getElementById('hero-scope').textContent =
      'Last ' + months.length + ' months' +
      (state.channel === 'all' ? ' · all channels' : ' · ' + channelName(state.channel));
    document.getElementById('hero-value').textContent = money(curr.pipeline);

    var foot = document.getElementById('hero-delta');
    clear(foot);
    foot.appendChild(deltaChip(curr.pipeline, past.pipeline, { vs: 'vs. prior ' + months.length + ' months' }));

    var attain = target ? curr.pipeline / target : 0;
    document.getElementById('hero-note').textContent =
      moneyExact(curr.pipeline) + ' from ' + count(curr.sqls) + ' SQLs · ' +
      count(curr.customers) + ' customers won.';

    var meter = document.getElementById('hero-meter');
    clear(meter);
    var state_ = attain >= 1 ? 'good' : attain >= 0.9 ? 'warning' : 'critical';
    var fill = el('div', { class: 'meter-fill' });
    fill.style.width = Math.min(100, attain * 100).toFixed(1) + '%';
    meter.appendChild(el('div', { class: 'meter-head' }, [
      el('span', { text: 'Attainment vs. plan' }),
      el('strong', { text: pct(attain, 0) })
    ]));
    meter.appendChild(el('div', {
      class: 'meter-track', 'data-state': state_, role: 'meter',
      'aria-valuenow': Math.round(attain * 100), 'aria-valuemin': '0', 'aria-valuemax': '150',
      'aria-label': 'Pipeline attainment against plan'
    }, [fill]));
    meter.appendChild(el('div', { class: 'meter-foot' }, [
      el('span', { text: money(curr.pipeline) + ' actual' }),
      el('span', { text: money(target) + ' plan' })
    ]));
  }

  function channelName(id) {
    var c = D.channels.find(function (x) { return x.id === id; });
    return c ? c.name : id;
  }

  function renderTiles() {
    var host = document.getElementById('tiles');
    clear(host);
    var months = monthsInScope();
    var curr = kpis(rowsFor(months, state.channel));
    var past = kpis(rowsFor(priorMonths(), state.channel));

    var trend = function (fn) {
      return months.map(function (m) { return fn(kpis(rowsFor([m], state.channel))); });
    };

    var defs = [
      { label: 'MQLs', value: count(curr.mqls), curr: curr.mqls, prev: past.mqls,
        series: trend(function (k) { return k.mqls; }), foot: null },
      { label: 'CAC', value: moneyExact(curr.cac), curr: curr.cac, prev: past.cac, lowerIsBetter: true,
        series: trend(function (k) { return k.cac; }),
        foot: 'target ' + moneyExact(D.targets.cac) },
      { label: 'ROAS', value: curr.roas.toFixed(2) + '×', curr: curr.roas, prev: past.roas,
        series: trend(function (k) { return k.roas; }),
        foot: 'target ' + D.targets.roas.toFixed(2) + '×' },
      { label: 'MQL → SQL', value: pct(curr.mqlToSql), curr: curr.mqlToSql, prev: past.mqlToSql,
        series: trend(function (k) { return k.mqlToSql; }),
        foot: 'target ' + pct(D.targets.mqlToSql, 0) }
    ];

    defs.forEach(function (d) {
      var tile = el('div', { class: 'tile' }, [
        el('span', { class: 'label', text: d.label }),
        el('span', { class: 'value', text: d.value }),
        deltaChip(d.curr, d.prev, { lowerIsBetter: d.lowerIsBetter, vs: 'vs. prior' })
      ]);
      tile.appendChild(sparkline(d.series));
      if (d.foot) tile.appendChild(el('span', { class: 'target', text: d.foot }));
      host.appendChild(tile);
    });
  }

  /* ── stacked columns: pipeline by channel, by month ───────── */
  function renderPipeline() {
    var host = document.getElementById('chart-pipe');
    clear(host);
    var tip = makeTooltip(host);

    var months = monthsInScope();
    var chans = activeChannels();
    var width = Math.max(320, host.clientWidth || 640);
    var m = { top: 18, right: 16, bottom: 30, left: 52 };
    var height = 300;
    var plotW = width - m.left - m.right;
    var plotH = height - m.top - m.bottom;

    var byMonth = months.map(function (mo) {
      var parts = chans.map(function (c) {
        var r = D.series.find(function (x) { return x.month === mo && x.channel === c.id; });
        return { channel: c, value: r ? r.pipeline : 0 };
      });
      return { month: mo, parts: parts, total: parts.reduce(function (s, p) { return s + p.value; }, 0) };
    });

    var max = Math.max.apply(null, byMonth.map(function (d) { return d.total; }));
    var ticks = niceTicks(max, 4);
    var top = ticks[ticks.length - 1];
    var y = function (v) { return m.top + plotH - (v / top) * plotH; };
    var band = plotW / months.length;
    var barW = Math.min(24, band * 0.55);

    var root = svg('svg', { width: width, height: height, role: 'img',
      'aria-label': 'Stacked columns: marketing-sourced pipeline by channel for each month. Table view has the values.' });

    ticks.forEach(function (t) {
      root.appendChild(svg('line', { class: t === 0 ? 'baseline' : 'gridline',
        x1: m.left, x2: m.left + plotW, y1: y(t), y2: y(t) }));
      root.appendChild(svg('text', { class: 'tick', x: m.left - 8, y: y(t) + 4, 'text-anchor': 'end',
        text: t === 0 ? '0' : money(t) }));
    });

    byMonth.forEach(function (d, i) {
      var cx = m.left + band * i + band / 2;
      var acc = 0;
      var group = svg('g');
      d.parts.forEach(function (p, idx) {
        if (p.value <= 0) return;
        var yTop = y(acc + p.value);
        var yBot = y(acc);
        var h = yBot - yTop;
        var isTop = idx === d.parts.length - 1;
        // 2px surface gap does the separating — no strokes around marks.
        var gap = idx === 0 ? 0 : 2;
        var drawH = Math.max(1, h - gap);
        var drawY = yTop;
        var color = seriesColor(p.channel.slot);
        var path = svg('path', {
          d: isTop ? topRoundedPath(cx - barW / 2, drawY, barW, drawH, 4)
                   : 'M' + (cx - barW / 2) + ',' + drawY + 'h' + barW + 'v' + drawH + 'h' + -barW + 'Z',
          fill: color
        });
        if (state.emphasis && state.emphasis !== p.channel.id) path.setAttribute('data-dim', 'true');
        group.appendChild(path);
        acc += p.value;
      });
      root.appendChild(group);

      // Drop every other tick label rather than let them collide.
      if (band >= 44 || i % 2 === 0) {
        root.appendChild(svg('text', { class: 'tick', x: cx, y: m.top + plotH + 18, 'text-anchor': 'middle',
          text: monthShort(d.month) }));
      }

      // Hit target spans the whole band, well past the 24px minimum.
      var hit = svg('rect', { class: 'hit', x: m.left + band * i, y: m.top, width: band, height: plotH,
        tabindex: '0', role: 'button', 'aria-label': monthLong(d.month) + ': ' + moneyExact(d.total) + ' pipeline' });
      function show(ev) {
        var box = host.getBoundingClientRect();
        var px = ev && ev.clientX ? ev.clientX - box.left : m.left + band * i + band / 2;
        var node = tipBody(monthLong(d.month),
          d.parts.slice().reverse().map(function (p) {
            return { color: seriesColor(p.channel.slot), label: p.channel.name, value: money(p.value) };
          }),
          { label: 'Total', value: moneyExact(d.total) });
        tip.show(node, px, y(d.total));
      }
      hit.addEventListener('mousemove', show);
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', tip.hide);
      hit.addEventListener('blur', tip.hide);
      root.appendChild(hit);
    });

    // Direct-label the peak month only — never a number on every column.
    var peak = byMonth.reduce(function (a, b) { return b.total > a.total ? b : a; });
    var pi = byMonth.indexOf(peak);
    root.appendChild(svg('text', { class: 'mark-label', x: m.left + band * pi + band / 2,
      y: y(peak.total) - 10, 'text-anchor': 'middle', text: money(peak.total) }));

    host.appendChild(root);
    renderPipelineLegend(chans);
    renderPipelineTable(byMonth, chans);
  }

  function renderPipelineLegend(chans) {
    var host = document.getElementById('legend-pipe');
    clear(host);
    // One series needs no legend — the title already names what is plotted.
    if (chans.length < 2) { host.hidden = true; return; }
    host.hidden = false;
    chans.forEach(function (c) {
      var pressed = !state.emphasis || state.emphasis === c.id;
      var btn = el('button', {
        class: 'legend-item', type: 'button', 'aria-pressed': String(pressed),
        onclick: function () { state.emphasis = state.emphasis === c.id ? null : c.id; renderPipeline(); },
        onmouseenter: function () { state.emphasis = c.id; renderPipeline(); },
        onmouseleave: function () { state.emphasis = null; renderPipeline(); }
      }, [swatchSpan(seriesColor(c.slot)), el('span', { text: c.name })]);
      host.appendChild(btn);
    });
  }

  function renderPipelineTable(byMonth, chans) {
    var host = document.getElementById('table-pipe');
    clear(host);
    var head = el('tr', {}, [el('th', { scope: 'col', text: 'Month' })]);
    chans.forEach(function (c) {
      var th = el('th', { scope: 'col' });
      th.appendChild(el('span', { class: 'series-key' }, [swatchSpan(seriesColor(c.slot)), el('span', { text: c.name })]));
      head.appendChild(th);
    });
    head.appendChild(el('th', { scope: 'col', text: 'Total' }));
    var body = el('tbody');
    byMonth.forEach(function (d) {
      var tr = el('tr', {}, [el('th', { scope: 'row', text: monthLong(d.month) })]);
      d.parts.forEach(function (p) { tr.appendChild(el('td', { text: moneyExact(p.value) })); });
      tr.appendChild(el('td', {}, [el('strong', { text: moneyExact(d.total) })]));
      body.appendChild(tr);
    });
    host.appendChild(el('table', {}, [
      el('caption', { text: 'Pipeline by channel and month (USD).' }),
      el('thead', {}, [head]), body
    ]));
  }

  /* ── funnel: ordered stages → ordinal ramp ────────────────── */
  function renderFunnel() {
    var host = document.getElementById('chart-funnel');
    clear(host);
    var tip = makeTooltip(host);

    var rows = rowsFor(monthsInScope(), state.channel);
    var mqls = sum(rows, 'mqls');
    var stages = D.funnel.ratios.map(function (s, i) {
      var value = s.id === 'sqls' ? sum(rows, 'sqls')
                : s.id === 'customers' ? sum(rows, 'customers')
                : Math.round(mqls * s.perMql);
      return { name: s.name, value: value, ramp: 'var(--ord-' + (i + 1) + ')' };
    });

    // Bars are scaled to the STEP rate (share of the previous stage), not to the
    // top of the funnel: sessions are ~41x MQLs, so a shared volume scale renders
    // the bottom four stages as invisible slivers. Counts stay direct-labelled.
    stages.forEach(function (s, i) {
      s.rate = i ? s.value / stages[i - 1].value : 1;
      s.ofTop = s.value / stages[0].value;
    });

    var width = Math.max(300, host.clientWidth || 480);
    var endLabels = stages.map(function (s, i) {
      return count(s.value) + (i ? '  ' + pct(s.rate) : '  baseline');
    });
    var longest = endLabels.reduce(function (a, b) { return b.length > a.length ? b : a; }, '');
    var m = { top: 22, right: Math.min(120, Math.max(56, longest.length * 6.4 + 12)), bottom: 26,
              left: Math.min(88, Math.max(52, width * 0.22)) };
    var rowH = 44, barH = 24;
    var height = m.top + m.bottom + stages.length * rowH;
    var plotW = width - m.left - m.right;

    var root = svg('svg', { width: width, height: height, role: 'img',
      'aria-label': 'Funnel from sessions to customers. Bar length is the share of the previous stage; counts are labelled at each bar end.' });

    [0, 0.5, 1].forEach(function (t) {
      var x = m.left + t * plotW;
      root.appendChild(svg('line', { class: t === 0 ? 'baseline' : 'gridline',
        x1: x, x2: x, y1: m.top - 6, y2: m.top + stages.length * rowH }));
      root.appendChild(svg('text', { class: 'tick', x: x, y: m.top + stages.length * rowH + 16,
        'text-anchor': t === 1 ? 'end' : t === 0 ? 'start' : 'middle', text: (t * 100) + '%' }));
    });
    root.appendChild(svg('text', { class: 'tick', x: m.left, y: m.top - 12, text: 'share of previous stage' }));

    stages.forEach(function (s, i) {
      var y = m.top + i * rowH + (rowH - barH) / 2;
      var w = Math.max(3, s.rate * plotW);
      root.appendChild(svg('text', { class: 'mark-label', x: m.left - 10, y: y + barH / 2 + 4,
        'text-anchor': 'end', text: s.name }));
      root.appendChild(svg('path', { d: endRoundedPathH(m.left, y, w, barH, 4), fill: s.ramp }));
      root.appendChild(svg('text', { class: 'mark-label', x: m.left + w + 8, y: y + barH / 2 + 4,
        text: endLabels[i] }));

      var prev = i ? stages[i - 1] : null;
      var hit = svg('rect', { class: 'hit', x: m.left, y: m.top + i * rowH, width: plotW + m.right - 8, height: rowH,
        tabindex: '0', role: 'button',
        'aria-label': s.name + ': ' + count(s.value) + (prev ? ', ' + pct(s.rate) + ' of ' + prev.name : '') });
      function show(ev) {
        var box = host.getBoundingClientRect();
        var px = ev && ev.clientX ? ev.clientX - box.left : m.left + w / 2;
        var lines = [{ label: 'Count', value: count(s.value) }];
        if (prev) lines.push({ label: 'From ' + prev.name, value: pct(s.rate) });
        lines.push({ label: 'Of ' + stages[0].name, value: pct(s.ofTop, 2) });
        tip.show(tipBody(s.name, lines), px, m.top + i * rowH + rowH / 2);
      }
      hit.addEventListener('mousemove', show);
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', tip.hide);
      hit.addEventListener('blur', tip.hide);
      root.appendChild(hit);
    });

    host.appendChild(root);

    var tHost = document.getElementById('table-funnel');
    clear(tHost);
    var body = el('tbody');
    stages.forEach(function (s, i) {
      body.appendChild(el('tr', {}, [
        el('th', { scope: 'row', text: s.name }),
        el('td', { text: count(s.value) }),
        el('td', { text: i ? pct(s.value / stages[i - 1].value) : '—' }),
        el('td', { text: pct(s.value / stages[0].value, 2) })
      ]));
    });
    tHost.appendChild(el('table', {}, [
      el('caption', { text: 'Funnel counts and step conversion for the selected period.' }),
      el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: 'Stage' }), el('th', { scope: 'col', text: 'Count' }),
        el('th', { scope: 'col', text: 'Step rate' }), el('th', { scope: 'col', text: 'Of sessions' })
      ])]), body
    ]));
  }

  /* ── cost per MQL by channel: nominal categories, one hue ── */
  function renderCpa() {
    var host = document.getElementById('chart-cpa');
    clear(host);
    var tip = makeTooltip(host);

    var months = monthsInScope();
    // This card is a comparison, so it always plots every channel — a channel
    // filter emphasises one instead of reducing the chart to a single bar.
    var chans = D.channels;
    var rows = chans.map(function (c) {
      var k = kpis(rowsFor(months, c.id));
      var kPrev = kpis(rowsFor(priorMonths(), c.id));
      return { channel: c, cpm: k.cpm, prev: kPrev.cpm, mqls: k.mqls, spend: k.spend };
    }).sort(function (a, b) { return b.cpm - a.cpm; });

    var width = Math.max(300, host.clientWidth || 480);
    var m = { top: 8, right: Math.min(78, Math.max(52, width * 0.2)), bottom: 8,
              left: Math.min(108, Math.max(64, width * 0.26)) };
    var rowH = 44, barH = 24;
    var height = Math.max(m.top + m.bottom + rows.length * rowH, 140);
    var plotW = width - m.left - m.right;
    var max = Math.max.apply(null, rows.map(function (r) { return r.cpm; })) || 1;

    var root = svg('svg', { width: width, height: height, role: 'img',
      'aria-label': 'Bars: blended cost per MQL by channel for the selected period.' });

    rows.forEach(function (r, i) {
      var y = m.top + i * rowH + (rowH - barH) / 2;
      var w = Math.max(3, (r.cpm / max) * plotW);
      root.appendChild(svg('text', { class: 'mark-label', x: m.left - 10, y: y + barH / 2 + 4,
        'text-anchor': 'end', text: r.channel.name }));
      // Colour follows the channel, so a channel keeps the same hue in every
      // card; the filter dims the others rather than recolouring the survivors.
      var selected = state.channel === 'all' || state.channel === r.channel.id;
      var bar = svg('path', { d: endRoundedPathH(m.left, y, w, barH, 4),
        fill: seriesColor(r.channel.slot) });
      if (!selected) bar.setAttribute('data-dim', 'true');
      root.appendChild(bar);
      root.appendChild(svg('text', { class: 'mark-label', x: m.left + w + 8, y: y + barH / 2 + 4,
        text: moneyExact(r.cpm) }));

      var hit = svg('rect', { class: 'hit', x: m.left, y: m.top + i * rowH, width: plotW + m.right - 8, height: rowH,
        tabindex: '0', role: 'button',
        'aria-label': r.channel.name + ': ' + moneyExact(r.cpm) + ' per MQL' });
      function show(ev) {
        var box = host.getBoundingClientRect();
        var px = ev && ev.clientX ? ev.clientX - box.left : m.left + w / 2;
        tip.show(tipBody(r.channel.name, [
          { label: 'Cost per MQL', value: moneyExact(r.cpm) },
          { label: 'Prior period', value: r.prev ? moneyExact(r.prev) : '—' },
          { label: 'MQLs', value: count(r.mqls) },
          { label: 'Spend', value: moneyExact(r.spend) }
        ]), px, m.top + i * rowH + rowH / 2);
      }
      hit.addEventListener('mousemove', show);
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', tip.hide);
      hit.addEventListener('blur', tip.hide);
      root.appendChild(hit);
    });

    host.appendChild(root);

    var hint = document.getElementById('cpa-hint');
    if (hint) {
      hint.textContent = state.channel === 'all'
        ? 'All channels'
        : channelName(state.channel) + ' highlighted';
    }

    var tHost = document.getElementById('table-cpa');
    clear(tHost);
    var body = el('tbody');
    rows.forEach(function (r) {
      body.appendChild(el('tr', {}, [
        el('th', { scope: 'row', text: r.channel.name }),
        el('td', { text: moneyExact(r.cpm) }),
        el('td', { text: r.prev ? moneyExact(r.prev) : '—' }),
        el('td', { text: count(r.mqls) }),
        el('td', { text: moneyExact(r.spend) })
      ]));
    });
    tHost.appendChild(el('table', {}, [
      el('caption', { text: 'Cost per MQL by channel, current vs. prior period.' }),
      el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: 'Channel' }), el('th', { scope: 'col', text: 'Cost / MQL' }),
        el('th', { scope: 'col', text: 'Prior' }), el('th', { scope: 'col', text: 'MQLs' }),
        el('th', { scope: 'col', text: 'Spend' })
      ])]), body
    ]));
  }

  /* ── scorecard: status = icon + label + colour, never colour alone ── */
  function statusFor(roas) {
    var t = D.targets.roas;
    if (roas >= t) return { key: 'good', glyph: '●', label: 'On track' };
    if (roas >= t * 0.85) return { key: 'warning', glyph: '▲', label: 'At risk' };
    return { key: 'critical', glyph: '■', label: 'Off track' };
  }

  function renderScorecard() {
    var host = document.getElementById('table-score');
    clear(host);
    var months = monthsInScope();
    var body = el('tbody');

    D.channels.forEach(function (c) {
      var k = kpis(rowsFor(months, c.id));
      var s = statusFor(k.roas);
      var tr = el('tr');
      var th = el('th', { scope: 'row' });
      th.appendChild(el('span', { class: 'series-key' }, [swatchSpan(seriesColor(c.slot)), el('span', { text: c.name })]));
      tr.appendChild(th);
      [moneyExact(k.spend), count(k.mqls), moneyExact(k.cpm), pct(k.mqlToSql),
       moneyExact(k.pipeline), k.roas.toFixed(2) + '×', moneyExact(k.cac)].forEach(function (v) {
        tr.appendChild(el('td', { text: v }));
      });
      var td = el('td');
      td.appendChild(el('span', { class: 'pill', 'data-status': s.key }, [
        el('span', { class: 'glyph', 'aria-hidden': 'true', text: s.glyph }),
        el('span', { text: s.label })
      ]));
      tr.appendChild(td);
      body.appendChild(tr);
    });

    var tot = kpis(rowsFor(months, 'all'));
    var foot = el('tfoot', {}, [el('tr', {}, [
      el('th', { scope: 'row', text: 'All channels' }),
      el('td', {}, [el('strong', { text: moneyExact(tot.spend) })]),
      el('td', {}, [el('strong', { text: count(tot.mqls) })]),
      el('td', {}, [el('strong', { text: moneyExact(tot.cpm) })]),
      el('td', {}, [el('strong', { text: pct(tot.mqlToSql) })]),
      el('td', {}, [el('strong', { text: moneyExact(tot.pipeline) })]),
      el('td', {}, [el('strong', { text: tot.roas.toFixed(2) + '×' })]),
      el('td', {}, [el('strong', { text: moneyExact(tot.cac) })]),
      el('td', {})
    ])]);

    host.appendChild(el('table', {}, [
      el('caption', { text: 'Per-channel performance for the selected period. Status compares ROAS with the ' + D.targets.roas.toFixed(2) + '× target.' }),
      el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: 'Channel' }), el('th', { scope: 'col', text: 'Spend' }),
        el('th', { scope: 'col', text: 'MQLs' }), el('th', { scope: 'col', text: 'Cost / MQL' }),
        el('th', { scope: 'col', text: 'MQL → SQL' }), el('th', { scope: 'col', text: 'Pipeline' }),
        el('th', { scope: 'col', text: 'ROAS' }), el('th', { scope: 'col', text: 'CAC' }),
        el('th', { scope: 'col', text: 'Status' })
      ])]),
      body, foot
    ]));
  }

  /* ── orchestration ────────────────────────────────────────── */
  function renderAll() {
    var months = monthsInScope();
    document.getElementById('page-title').textContent =
      state.channel === 'all' ? 'All channels' : channelName(state.channel);
    document.getElementById('page-sub').textContent =
      monthLong(months[0]) + ' – ' + monthLong(months[months.length - 1]) + ' · ' + months.length + ' months';
    renderNav();
    renderHero();
    renderTiles();
    renderPipeline();
    renderFunnel();
    renderCpa();
    renderScorecard();
  }

  /* ── sidebar: the channel filter, in the source's nav pattern ── */
  function renderNav() {
    var host = document.getElementById('nav');
    var months = monthsInScope();
    clear(host);

    var items = [{ id: 'all', name: 'All channels', slot: null }].concat(D.channels);
    items.forEach(function (c) {
      var k = kpis(rowsFor(months, c.id));
      var btn = el('button', {
        type: 'button', 'aria-current': String(state.channel === c.id),
        onclick: function () {
          if (state.channel === c.id) return;
          state.channel = c.id; state.emphasis = null; renderAll();
        }
      });
      if (c.slot) btn.appendChild(swatchDot(seriesColor(c.slot)));
      btn.appendChild(el('span', { text: c.name }));
      btn.appendChild(el('span', { class: 'spend', text: money(k.spend) }));
      host.appendChild(btn);
    });
  }
  function swatchDot(color) {
    var s = el('span', { class: 'dot' }); s.style.background = color; return s;
  }

  function init() {
    var periodButtons = [].slice.call(document.querySelectorAll('[data-period]'));
    periodButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        state.period = +b.getAttribute('data-period');
        periodButtons.forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        renderAll();
      });
    });

    document.querySelectorAll('[data-table-for]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById('table-' + btn.getAttribute('data-table-for'));
        var chart = document.getElementById('chart-' + btn.getAttribute('data-table-for'));
        var open = target.hidden;
        target.hidden = !open;
        if (chart) chart.hidden = false;   // table supplements the chart, never replaces it
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? 'Hide table' : 'Table';
      });
    });

    document.getElementById('footnote').textContent =
      'Data through ' + monthLong(D.months[D.months.length - 1]) + '. ' + D.meta.note;

    // Charts are sized to their container in real pixels (crisper than scaling a
    // viewBox), so they have to be redrawn whenever that container changes width.
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
    watch('chart-pipe', renderPipeline);
    watch('chart-funnel', renderFunnel);
    watch('chart-cpa', renderCpa);
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
