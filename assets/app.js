(() => {
  'use strict';
  const data = window.DASHBOARD_DATA;
  const $ = (selector) => document.querySelector(selector);
  const fmt = (n) => new Intl.NumberFormat('en-US').format(n);
  const set = (selector, html) => { const node = $(selector); if (node) node.innerHTML = html; };

  $('#property').innerHTML = data.properties.map((property) => `<option value="${property.id}">${property.name}</option>`).join('');
  $('#period').innerHTML = data.periods.map((period) => `<option value="${period.id}" ${period.id === '30d' ? 'selected' : ''}>${period.name}</option>`).join('');

  function funnel(rows, teal = false) {
    const max = rows[0][1] || 1;
    return rows.map(([label, value]) => `<div class="funnel-row"><div><strong>${label}</strong><span>${fmt(value)}</span></div><div class="bar ${teal ? 'bar-teal' : ''}"><i style="width:${Math.max(7, value / max * 100)}%"></i></div></div>`).join('');
  }
  function trend(values) {
    const high = Math.max(...values), low = Math.min(...values), range = high - low || 1;
    const points = values.map((value, index) => `${index * (100 / (values.length - 1))},${92 - ((value - low) / range * 70)}`).join(' ');
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Illustrative scoped earnings trend"><polyline points="${points}"/></svg><div class="trend-labels"><span>W1</span><span>W6</span></div>`;
  }
  function domains(rows) {
    return `<div class="domain-list">${rows.map(([name, value, change]) => `<div><span>${name}</span><strong>${value}</strong><em class="${change.startsWith('-') ? 'down' : 'up'}">${change}</em></div>`).join('')}</div>`;
  }
  function coverage(readiness) {
    return [['Property mapped', readiness.mapped], ['Eligible segment', readiness.eligible], ['Consent-ready', readiness.consent], ['Unassigned / needs mapping', readiness.unassigned]].map(([label, value]) => `<div class="coverage-row"><div><span>${label}</span><strong>${value}%</strong></div><div class="bar"><i style="width:${value}%"></i></div></div>`).join('');
  }
  function decisions(rows) {
    return rows.map(([type, title, action]) => `<article class="decision"><span class="tag ${type === 'Risk' ? 'risk' : type === 'Opportunity' ? 'opportunity' : 'mapping'}">${type}</span><h3>${title}</h3><p>${action}</p></article>`).join('');
  }
  function currentScope() {
    return data.scope($('#property').value, $('#period').value);
  }
  function announceScope(scope) {
    $('#view-subtitle').textContent = `${scope.property.name} · ${scope.period.name} · selected period scopes Maropost email and AdSense only; CPV remains a latest dummy snapshot. No data is requested or persisted.`;
  }
  function renderDashboard() {
    const scope = currentScope();
    $('#kpi-email').textContent = `${(scope.email.sent / 1000).toFixed(1)}k`;
    $('#kpi-cpv').textContent = scope.cpv.value;
    $('#kpi-adsense').textContent = scope.adsense.earnings;
    $('#kpi-confidence').textContent = `${scope.readiness.consent}%`;
    const emailRows = [['Sent', scope.email.sent], ['Delivered', scope.email.delivered], ['Opened', scope.email.opened], ['Clicked', scope.email.clicked]];
    const cpvRows = [['Views', scope.cpv.views], ['Clicks', scope.cpv.clicks], ['Conversions', scope.cpv.conversions]];
    set('#email-funnel', funnel(emailRows));
    set('#cpv-funnel', funnel(cpvRows, true)); set('#cpv-funnel-detail', funnel(cpvRows, true));
    set('#adsense-trend', trend(scope.adsense.trend)); set('#adsense-trend-detail', trend(scope.adsense.trend));
    set('#adsense-domains', domains(scope.adsense.domains)); set('#adsense-domains-detail', domains(scope.adsense.domains));
    set('#coverage', coverage(scope.readiness)); set('#coverage-detail', coverage(scope.readiness));
    set('#campaigns', scope.email.campaigns.map(([name, sent, open, click]) => `<tr><td>${name}</td><td>${sent}</td><td>${open}%</td><td>${click}%</td></tr>`).join(''));
    set('#decisions', decisions(scope.decisions));
    announceScope(scope);
  }
  $('#property').addEventListener('change', () => renderDashboard());
  $('#period').addEventListener('change', () => renderDashboard());
  renderDashboard();

  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => { item.classList.remove('active'); item.removeAttribute('aria-current'); });
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
    button.classList.add('active'); button.setAttribute('aria-current', 'page');
    $(`#view-${button.dataset.view}`).classList.add('active');
    $('#view-title').textContent = button.textContent;
    announceScope(currentScope());
    $('#main').focus({ preventScroll: true });
  }));
  const panel = $('#status-panel'), open = $('#status-open'), close = $('#status-close');
  function toggleStatus(show) { panel.hidden = !show; open.setAttribute('aria-expanded', String(show)); if (show) close.focus(); }
  open.addEventListener('click', () => toggleStatus(panel.hidden));
  close.addEventListener('click', () => { toggleStatus(false); open.focus(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { toggleStatus(false); open.focus(); } });
})();
