(function () {
  'use strict';
  const engine = window.CaseStudio;
  const byId = id => document.getElementById(id);
  const copy = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const integer = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value || 0);
  const decimal = value => value == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  let model, draft, scenario, pending, saving = false, dirty = false, toastTimer;
  let range, activeView, tablePage = 0, organicPage = 0;
  const selected = new Set();
  const metaFilters = { query: '', campaign: '', set: '' };
  let organicAccount = '';
  const views = { overview: 'Обзор', scenario: 'Сценарий', meta: 'Массовая настройка', organic: 'Органика', economics: 'Юнит-экономика' };
  const symbols = { overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', scenario: 'm13 2-9 12h7l-1 8 10-13h-7z', meta: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M9 15v6', organic: 'M12 21V11m0 3C4 14 3 9 3 4c7 0 9 4 9 10Zm0-3c0-6 3-8 9-8 0 6-3 10-9 10', economics: 'M4 3h16v18H4zM7 7h10M7 12h2m6 0h2M7 17h2m6 0h2' };
  const icon = key => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + symbols[key] + '"/></svg>';
  const money = (value, currency = model.shop.currency) => value == null ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  const ratio = (value, suffix) => value == null ? '—' : decimal(value) + suffix;
  const shortDate = date => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
  const metric = (label, value, note = '') => '<div class="metric"><div class="metric-label">' + label + '</div><strong>' + value + '</strong>' + (note ? '<small>' + note + '</small>' : '') + '</div>';
  function toast(message, error = false) {
    const box = byId('toast'); box.textContent = message; box.className = error ? 'error' : ''; box.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, error ? 9000 : 4500);
  }
  function guard(action) { try { return action(); } catch (error) { toast(error.message || 'Не удалось выполнить действие.', true); } }
  function markDirty() {
    dirty = true; byId('saveStatus').textContent = 'Есть несохранённые изменения';
    const count = byId('editCount'); if (count) count.textContent = 'Изменения готовы к сохранению';
  }
  function initScenario() {
    const totals = engine.calculate(model);
    return { ...engine.defaults(), ...model.settings.config, name: model.shop.name, currency: model.shop.currency, start: model.shop.start, end: model.shop.end, sales: model.shop.sales, orders: model.shop.orders, paidSpend: totals.paidSpend, paidOrders: Math.min(totals.paidOrders, model.shop.orders), organicOrders: Math.min(totals.organicOrders, Math.max(0, model.shop.orders - totals.paidOrders)), organicViews: totals.organicViews, organicCost: totals.organicCost, economics: copy(model.settings.economics), accounts: copy(model.organic.accounts) };
  }
  function load(next) {
    model = next; draft = copy(model); scenario = initScenario(); dirty = false;
    if (!range || range.start < model.shop.start || range.end > model.shop.end) range = { start: model.shop.start, end: model.shop.end };
    byId('projectName').textContent = model.shop.name; byId('projectAvatar').textContent = model.shop.name.slice(0, 1).toUpperCase();
    byId('saveStatus').textContent = 'Все изменения сохранены';
  }
  function save(next, message) {
    saving = true;
    try { load(engine.save(next)); selected.clear(); pending = null; byId('previewDialog').close(); render(); toast(message || 'Изменения сохранены в трёх кабинетах.'); }
    finally { saving = false; }
  }
  function heading(title, subtitle, action = '') {
    return '<div class="page-head"><div><h1>' + title + '</h1><p class="muted">' + subtitle + '</p></div>' + action + '</div>';
  }
  function periodForm() {
    return '<form id="periodForm" class="period-form"><label>С<input type="date" name="start" value="' + range.start + '" required></label><label>По<input type="date" name="end" value="' + range.end + '" required></label><button class="button small">Показать</button></form>';
  }
  function warnings(summary) {
    if (!summary.warnings.length) return '';
    return '<details class="banner"><summary>Примечания к расчёту · ' + summary.warnings.length + '</summary><ul>' + summary.warnings.map(w => '<li>' + escape(w) + '</li>').join('') + '</ul></details>';
  }
  function chart(rows, currency = model.shop.currency) {
    if (!rows.length) return '<p class="empty-state">Нет данных за этот период</p>';
    const width = window.innerWidth < 700 ? Math.max(285, window.innerWidth - 65) : 650;
    const height = 220, left = 49, bottom = 185, plot = width - left - 15;
    const all = rows.flatMap(row => [row.revenue, row.paidSpend, row.profit]);
    const min = Math.min(0, ...all), max = Math.max(1, ...all), span = max - min;
    const x = i => left + (rows.length === 1 ? plot / 2 : i * plot / (rows.length - 1));
    const y = value => bottom - (value - min) / span * 150;
    const colors = { revenue: '#254f3e', paidSpend: '#a3c675', profit: '#4b9d9c' };
    let svg = '<svg role="img" aria-label="График выручки, рекламы и прибыли по дням" viewBox="0 0 ' + width + ' ' + height + '">';
    for (let i = 0; i < 4; i++) { const value = min + span * i / 3; svg += '<line x1="' + left + '" y1="' + y(value) + '" x2="' + (width - 10) + '" y2="' + y(value) + '" stroke="#e9eee3"/><text x="' + (left - 7) + '" y="' + (y(value) + 4) + '" text-anchor="end" fill="#8c9987" font-size="10">' + integer(value) + '</text>'; }
    for (const [key, color] of Object.entries(colors)) {
      svg += '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" points="' + rows.map((r, i) => x(i).toFixed(1) + ',' + y(r[key]).toFixed(1)).join(' ') + '"/>';
      rows.forEach((row, i) => { svg += '<circle cx="' + x(i) + '" cy="' + y(row[key]) + '" r="' + (rows.length === 1 ? 4 : 2) + '" fill="' + color + '"><title>' + escape(shortDate(row.date) + ' · ' + money(row[key], currency)) + '</title></circle>'; });
    }
    for (const i of [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])]) svg += '<text x="' + x(i) + '" y="208" text-anchor="' + (i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle') + '" fill="#8c9987" font-size="10">' + shortDate(rows[i].date) + '</text>';
    return svg + '</svg>';
  }
  function channelList(summary) {
    const labels = { paid: 'Meta Ads', organic: 'Органика', direct: 'Прямые и другие' }, colors = { paid: '#244d3e', organic: '#92b96b', direct: '#67a49b' };
    return Object.entries(summary.channels).map(([key, channel]) => '<div class="channel"><div class="channel-top"><i class="channel-dot" style="background:' + colors[key] + '"></i>' + labels[key] + '<strong>' + money(channel.revenue) + '</strong></div><div class="channel-bar"><span style="width:' + Math.max(0, Math.min(100, channel.revenue / (summary.totalRevenue || 1) * 100)) + '%;background:' + colors[key] + '"></span></div><div class="channel-bottom"><span>' + integer(channel.orders) + ' заказов</span><span>Затраты ' + money(channel.cost) + '</span></div></div>').join('');
  }
  function accountStrip() {
    return model.organic.accounts.map(account => { const rows = model.organic.videos.filter(v => v.accountId === account.id && v.date >= range.start && v.date <= range.end); return '<div class="account-tile"><span class="account-platform">' + escape(account.platform) + '</span><strong>' + escape(account.name) + '</strong><b>' + integer(rows.reduce((sum, v) => sum + v.views, 0)) + '</b><small>' + rows.length + ' видео · ' + integer(rows.reduce((sum, v) => sum + v.orders, 0)) + ' заказов</small></div>'; }).join('');
  }
  function overview() {
    const s = engine.calculate(model, range.start, range.end);
    return heading('Весь кейс. Одна картина.', escape(model.shop.name) + ' · ' + shortDate(range.start) + ' — ' + shortDate(range.end), '<a class="button primary" href="#scenario">Задать сценарий ↗</a>') + periodForm() + warnings(s) +
      '<div class="overview-grid"><section class="profit-hero"><span class="eyebrow">ПРИБЫЛЬ ДО НАЛОГОВ</span><div class="profit-value">' + money(s.profit) + '</div><p class="hero-note">После всех введённых затрат</p><div class="hero-bottom"><div><small>Маржинальность</small><strong>' + decimal(s.margin) + '%</strong></div><div><small>На один заказ</small><strong>' + money(s.profitPerOrder) + '</strong></div><div><small>MER</small><strong>' + decimal(s.mer) + '×</strong></div></div></section><div class="metrics-grid">' + metric('Выручка магазина', money(s.totalRevenue), integer(s.orders) + ' заказов') + metric('Расходы Meta Ads', money(s.paidSpend), 'ROAS ' + ratio(s.paidRoas, '×')) + metric('Органические просмотры', integer(s.organicViews), integer(s.organicOrders) + ' заказов') + metric('Стоимость платного заказа', money(s.cac), 'Допустимая ' + money(s.breakEvenCpa)) + '</div></div>' +
      '<div class="section-grid"><section class="panel"><div class="panel-head"><h2>Динамика кейса</h2><div class="chart-legend"><span><i style="background:#254f3e"></i>Выручка</span><span><i style="background:#a3c675"></i>Реклама</span><span><i style="background:#4b9d9c"></i>Прибыль</span></div></div><div class="chart-wrap">' + chart(s.daily) + '</div></section><section class="panel"><div class="panel-head"><h2>Источники продаж</h2></div><div class="channel-list">' + channelList(s) + '</div></section></div>' +
      '<section class="panel" style="margin-top:18px"><div class="panel-head"><h2>Контент приносит результат</h2><a class="button link small" href="#organic">Все видео →</a></div><div class="account-strip">' + accountStrip() + '</div></section>';
  }
  function inputField(name, title, value, type = 'number', extra = '') {
    const numeric = type === 'number' ? ' min="0" step="' + (['orders', 'paidOrders', 'organicOrders', 'organicViews', 'videosPerAccount'].includes(name) ? '1' : '0.01') + '"' : '';
    return '<label>' + title + '<input name="' + name + '" type="' + type + '" value="' + escape(value) + '"' + numeric + ' required ' + extra + '></label>';
  }
  function selectField(name, title, values, value) {
    return '<label>' + title + '<select name="' + name + '">' + Object.entries(values).map(([key, label]) => '<option value="' + key + '" ' + (key === value ? 'selected' : '') + '>' + label + '</option>').join('') + '</select></label>';
  }
  function accountFields(accounts) {
    return accounts.map((account, i) => '<div class="account-fields"><select data-account-platform="' + i + '" aria-label="Платформа аккаунта ' + (i + 1) + '"><option' + (account.platform === 'Instagram' ? ' selected' : '') + '>Instagram</option><option' + (account.platform === 'TikTok' ? ' selected' : '') + '>TikTok</option></select><input data-account-name="' + i + '" aria-label="Имя аккаунта ' + (i + 1) + '" value="' + escape(account.name) + '" required maxlength="100"><button type="button" class="button small" data-remove-account="' + i + '">Убрать</button></div>').join('');
  }
  function scenarioView() {
    const c = scenario;
    return heading('Задай итоги. Остальное распределим.', 'Один сценарий для Shopify, Meta Ads, органики и юнит-экономики.') + '<form id="scenarioForm" class="form-layout"><div class="form-stack"><section class="panel form-panel"><h2>Магазин и период</h2><p>Точные итоговые значения сохранятся при каждом перемешивании.</p><div class="form-grid">' + inputField('name', 'Название магазина', c.name, 'text', 'maxlength="80"') + selectField('currency', 'Валюта', { USD: 'USD · доллар', EUR: 'EUR · евро', RUB: 'RUB · рубль', GBP: 'GBP · фунт', VND: 'VND · донг', CAD: 'CAD · канадский доллар', AUD: 'AUD · австралийский доллар' }, c.currency) + inputField('start', 'Начало', c.start, 'date') + inputField('end', 'Конец', c.end, 'date') + inputField('sales', 'Выручка магазина', c.sales) + inputField('orders', 'Все заказы', c.orders) + '</div></section>' +
      '<section class="panel form-panel"><h2>Meta Ads</h2><p>3 кампании · 9 групп · 180 объявлений. Названия и загруженные миниатюры сохраняются.</p><div class="form-grid">' + inputField('paidSpend', 'Общие расходы на рекламу', c.paidSpend) + inputField('paidOrders', 'Заказы из Meta Ads', c.paidOrders) + '</div></section>' +
      '<section class="panel form-panel"><h2>Reels и TikTok</h2><p>Видео получат разное число просмотров. Часть роликов соберёт основную аудиторию.</p><div class="form-grid">' + inputField('organicViews', 'Все органические просмотры', c.organicViews) + inputField('organicOrders', 'Заказы из органики', c.organicOrders) + inputField('organicCost', 'ИИ-видео и ведение аккаунтов', c.organicCost) + inputField('videosPerAccount', 'Видео на каждый аккаунт', c.videosPerAccount, 'number', 'max="100"') + '</div><details style="margin-top:18px"><summary>Аккаунты · ' + c.accounts.length + '</summary><div id="scenarioAccounts">' + accountFields(c.accounts) + '</div><button type="button" class="button small" data-add-account style="margin-top:12px">+ Аккаунт</button></details></section>' +
      '<section class="panel form-panel"><h2>Характер результатов</h2><p>Поменяй рисунок распределения, сохранив заданные суммы.</p><div class="form-grid">' + selectField('variance', 'Разброс между креативами', { stable: 'Умеренный', balanced: 'Сбалансированный', volatile: 'Резкие победители' }, c.variance) + selectField('trend', 'Динамика по дням', { growth: 'Постепенный рост', steady: 'Ровный период', launch: 'Всплеск после запуска' }, c.trend) + inputField('viralShare', 'Доля просмотров у топ-видео, %', c.viralShare, 'number', 'max="100"') + inputField('conversionRate', 'Конверсия магазина, %', c.conversionRate, 'number', 'max="100" min="0.01"') + '<label class="full">Ключ варианта<input name="seed" value="' + escape(c.seed) + '" required maxlength="120"><span class="field-note">Одинаковый ключ даёт одинаковое распределение.</span></label></div></section></div>' +
      '<aside class="sticky-aside info-card"><h2>Итоги сценария</h2><div class="info-line"><span>Все заказы</span><strong id="scenarioTotalOrders">' + integer(c.orders) + '</strong></div><div class="info-line"><span>Из Meta Ads</span><strong id="scenarioPaidOrders">' + integer(c.paidOrders) + '</strong></div><div class="info-line"><span>Из органики</span><strong id="scenarioOrganicOrders">' + integer(c.organicOrders) + '</strong></div><div class="info-line"><span>Прямые и другие</span><strong id="scenarioDirectOrders">' + integer(c.orders - c.paidOrders - c.organicOrders) + '</strong></div><p>Сначала посмотри результат. Кнопка «Применить» обновит все кабинеты вместе.</p><button class="button primary" type="submit">Предпросмотр сценария</button><button class="button" id="shuffleButton" type="button">↻ Перемешать вариант</button><p>Настройки себестоимости и комиссий берутся из раздела «Юнит-экономика».</p><div class="validation" id="scenarioError" hidden></div></aside></form>';
  }
  function readScenario() {
    const form = byId('scenarioForm');
    for (const key of Object.keys(scenario)) {
      const field = form.elements.namedItem(key); if (!field) continue;
      scenario[key] = field.type === 'number' ? Number(field.value) : field.value.trim();
    }
    scenario.accounts.forEach((account, i) => { account.name = form.querySelector('[data-account-name="' + i + '"]').value.trim(); account.platform = form.querySelector('[data-account-platform="' + i + '"]').value; });
    scenario.economics = copy(model.settings.economics); return copy(scenario);
  }
  function showPreview(next, title, note = '') {
    engine.validate(next); pending = next;
    const s = engine.calculate(next), current = engine.calculate(model);
    const cash = value => money(value, next.shop.currency);
    byId('previewTitle').textContent = title;
    byId('previewBody').innerHTML = '<div class="preview-metrics">' + metric('Выручка', cash(s.totalRevenue), 'Сейчас ' + money(current.totalRevenue)) + metric('Все заказы', integer(s.orders), 'Сейчас ' + integer(current.orders)) + metric('Расходы Meta', cash(s.paidSpend), integer(s.paidOrders) + ' платных заказов') + metric('Просмотры органики', integer(s.organicViews), integer(s.organicOrders) + ' органических заказов') + metric('Прибыль до налогов', cash(s.profit), 'После введённых затрат') + metric('Ролики', integer(next.organic.videos.length), next.organic.accounts.length + ' аккаунтов') + '</div><div class="chart-wrap">' + chart(s.daily, next.shop.currency) + '</div>' + (note ? '<p class="field-note">' + escape(note) + '</p>' : '') + warnings(s);
    byId('previewDialog').showModal();
  }
  function filteredAds() {
    return draft.meta.rows.filter(row => (!metaFilters.campaign || row.cid === metaFilters.campaign) && (!metaFilters.set || row.sid === metaFilters.set) && (!metaFilters.query || (row.a + ' ' + row.s + ' ' + row.c).toLowerCase().includes(metaFilters.query.toLowerCase())));
  }
  function uniqueOptions(rows, key, label, selectedValue, all) {
    return '<option value="">' + all + '</option>' + [...new Map(rows.map(row => [row[key], row[label]])).entries()].map(([id, name]) => '<option value="' + escape(id) + '"' + (selectedValue === id ? ' selected' : '') + '>' + escape(name) + '</option>').join('');
  }
  function metaView() {
    return heading('Все объявления в одном окне.', 'Меняй показатели в таблице или распределяй одну сумму между выбранными креативами.', '<a class="button" href="meta-ads.html" target="_blank">Открыть Meta Ads ↗</a>') + '<div class="edit-bar"><label><input id="syncMeta" type="checkbox" checked>Пересчитать продажи и расходы Shopify</label><span id="editCount" class="muted">' + (dirty ? 'Есть изменения' : 'Изменений нет') + '</span><button class="button" id="resetMeta">Отменить правки</button><button class="button primary" id="saveMeta">Сохранить всё</button></div><section class="panel"><div class="filterbar"><input id="metaSearch" placeholder="Найти объявление…" aria-label="Поиск объявления" value="' + escape(metaFilters.query) + '"><select id="campaignFilter" aria-label="Кампания">' + uniqueOptions(draft.meta.rows, 'cid', 'c', metaFilters.campaign, 'Все кампании') + '</select><select id="setFilter" aria-label="Группа">' + uniqueOptions(draft.meta.rows.filter(r => !metaFilters.campaign || r.cid === metaFilters.campaign), 'sid', 's', metaFilters.set, 'Все группы') + '</select><button class="button small" id="distributeSpend">Распределить расходы</button></div><div class="table-scroll"><table><thead><tr><th><input id="selectVisible" type="checkbox" aria-label="Выбрать все отфильтрованные объявления"></th><th>Объявление</th><th>Расходы</th><th>Покупки</th><th>Выручка</th><th>Показы</th><th>Охват</th><th>Клики</th><th>ROAS</th></tr></thead><tbody id="metaRows"></tbody></table></div><div class="pagination"><span id="metaCount"></span><div><button class="button small" id="metaPrev">←</button><span id="metaPage"></span><button class="button small" id="metaNext">→</button></div></div></section><p class="field-note">Правка итогов заменяет дневную разбивку этого объявления пропорциональным распределением. Названия и миниатюры сохраняются. Для новой точной дневной разбивки используй генератор.</p>';
  }
  function numericCell(row, key, scope) { return '<td><input type="number" min="0" step="' + (['spend', 'value', 'revenue', 'cost'].includes(key) ? '0.01' : '1') + '" value="' + row[key] + '" data-' + scope + '-id="' + escape(row.id) + '" data-key="' + key + '" aria-label="' + escape(key + ' · ' + (row.a || row.title)) + '" required></td>'; }
  function renderMetaRows() {
    const rows = filteredAds(), pages = Math.max(1, Math.ceil(rows.length / 30)); tablePage = Math.min(tablePage, pages - 1);
    byId('metaRows').innerHTML = rows.slice(tablePage * 30, (tablePage + 1) * 30).map(row => '<tr><td><input type="checkbox" data-select-ad="' + escape(row.id) + '" ' + (selected.has(row.id) ? 'checked' : '') + ' aria-label="Выбрать ' + escape(row.a) + '"></td><td><input class="name-input" value="' + escape(row.a) + '" data-ad-id="' + escape(row.id) + '" data-key="a" aria-label="Название объявления"><small class="row-meta">' + escape(row.c + ' / ' + row.s) + '</small></td>' + ['spend', 'purchases', 'value', 'impressions', 'reach', 'clicks'].map(key => numericCell(row, key, 'ad')).join('') + '<td class="number">' + decimal(row.spend ? row.value / row.spend : null) + '×</td></tr>').join('') || '<tr><td colspan="9" class="empty-state">Объявления не найдены</td></tr>';
    byId('metaCount').textContent = rows.length + ' объявлений · выбрано ' + selected.size;
    byId('metaPage').textContent = (tablePage + 1) + ' / ' + pages;
    byId('metaPrev').disabled = tablePage === 0; byId('metaNext').disabled = tablePage === pages - 1;
    byId('selectVisible').checked = rows.length > 0 && rows.every(r => selected.has(r.id));
  }
  function organicView() {
    const s = engine.calculate(draft, range.start, range.end);
    return heading('Контент, который приводит заказы.', 'Каждое видео привязано к аккаунту. Просмотры, заказы и затраты доступны для правки.') + '<div class="stats-row">' + metric('Просмотры', integer(s.organicViews)) + metric('Заказы', integer(s.organicOrders)) + metric('Выручка', money(s.organicRevenue)) + metric('Производство контента', money(s.organicCost)) + '</div><details class="panel form-panel"><summary>Настроить аккаунты · ' + draft.organic.accounts.length + '</summary><div id="organicAccounts">' + accountFields(draft.organic.accounts) + '</div><button class="button small" data-add-account style="margin-top:14px">+ Аккаунт</button></details><div class="edit-bar"><label><input id="syncOrganic" type="checkbox" checked>Пересчитать продажи Shopify</label><span id="editCount" class="muted">' + (dirty ? 'Есть изменения' : 'Изменений нет') + '</span><button class="button" id="addVideo">+ Видео</button><button class="button primary" id="saveOrganic">Сохранить органику</button></div><section class="panel"><div class="filterbar"><select id="organicFilter" aria-label="Аккаунт"><option value="">Все аккаунты</option>' + draft.organic.accounts.map(a => '<option value="' + escape(a.id) + '"' + (organicAccount === a.id ? ' selected' : '') + '>' + escape(a.name) + '</option>').join('') + '</select><span class="muted">Итоги наверху — за период обзора</span></div><div class="table-scroll"><table><thead><tr><th>Видео</th><th>Аккаунт</th><th>Дата</th><th>Просмотры</th><th>Клики</th><th>Заказы</th><th>Выручка</th><th>Затраты</th><th></th></tr></thead><tbody id="organicRows"></tbody></table></div><div class="pagination"><span id="organicCount"></span><div><button class="button small" id="organicPrev">←</button><span id="organicPage"></span><button class="button small" id="organicNext">→</button></div></div></section>';
  }
  function renderOrganicRows() {
    const rows = draft.organic.videos.filter(v => !organicAccount || v.accountId === organicAccount);
    const pages = Math.max(1, Math.ceil(rows.length / 25)); organicPage = Math.min(organicPage, pages - 1);
    const mean = rows.length ? rows.reduce((n, v) => n + v.views, 0) / rows.length : 0;
    byId('organicRows').innerHTML = rows.slice(organicPage * 25, (organicPage + 1) * 25).map(video => '<tr><td><input class="name-input" data-video-id="' + escape(video.id) + '" data-key="title" value="' + escape(video.title) + '" aria-label="Название видео">' + (video.views > mean * 3 && video.views > 0 ? '<small class="viral">Залетело</small>' : '') + '</td><td><select data-video-id="' + escape(video.id) + '" data-key="accountId" aria-label="Аккаунт видео">' + draft.organic.accounts.map(a => '<option value="' + escape(a.id) + '"' + (a.id === video.accountId ? ' selected' : '') + '>' + escape(a.name) + '</option>').join('') + '</select></td><td><input type="date" data-video-id="' + escape(video.id) + '" data-key="date" value="' + video.date + '" aria-label="Дата видео" style="width:145px" required></td>' + ['views', 'clicks', 'orders', 'revenue', 'cost'].map(key => numericCell(video, key, 'video')).join('') + '<td><button class="button small" data-remove-video="' + escape(video.id) + '" aria-label="Удалить видео">×</button></td></tr>').join('') || '<tr><td colspan="9" class="empty-state"><h2>Пока нет видео</h2><p>Добавь своё видео или создай органику в генераторе.</p><a href="#scenario" class="button">Создать сценарий</a></td></tr>';
    byId('organicCount').textContent = rows.length + ' видео'; byId('organicPage').textContent = (organicPage + 1) + ' / ' + pages; byId('organicPrev').disabled = organicPage === 0; byId('organicNext').disabled = organicPage === pages - 1;
  }
  const costs = { cogs: 'Себестоимость товара', shipping: 'Доставка', fees: 'Платёжные комиссии', refunds: 'Возвраты', paidSpend: 'Meta Ads', organicCost: 'ИИ-видео и аккаунты', fixedCosts: 'Постоянные расходы', otherCosts: 'Другие переменные затраты' };
  function costList(s) { return '<div class="cost-list">' + Object.entries(costs).map(([key, label]) => '<div class="cost-row"><span>' + label + '</span><strong>' + money(s[key]) + '</strong></div>').join('') + '<div class="cost-row total"><span>Всего затрат</span><strong>' + money(s.totalCosts) + '</strong></div></div>'; }
  function economicsView() {
    const s = engine.calculate(model, range.start, range.end), e = draft.settings.economics;
    return heading('Экономика одного заказа.', 'Выручка, привлечение и затраты в одной модели. Налоги задаются вне этого расчёта.') + periodForm() + '<div class="stats-row">' + metric('Прибыль на заказ', money(s.profitPerOrder)) + metric('Маржинальность', ratio(s.margin, '%')) + metric('Допустимая цена заказа', money(s.breakEvenCpa)) + metric('Фактический CPA Meta', money(s.cac)) + '</div><form id="economicsForm" class="form-layout"><section class="panel form-panel"><h2>Твои затраты</h2><p>Процентные ставки применяются к выручке. Фиксированные затраты относятся ко всему периоду магазина.</p><div class="form-grid">' + inputField('cogsPercent', 'Себестоимость, % выручки', e.cogsPercent, 'number', 'max="100"') + inputField('shippingPerOrder', 'Доставка одного заказа', e.shippingPerOrder) + inputField('feePercent', 'Комиссия платежей, %', e.feePercent, 'number', 'max="100"') + inputField('feePerOrder', 'Комиссия за заказ, фикс.', e.feePerOrder) + inputField('refundPercent', 'Возвраты, % выручки', e.refundPercent, 'number', 'max="100"') + inputField('otherVariablePerOrder', 'Прочие затраты на заказ', e.otherVariablePerOrder) + '<div class="full">' + inputField('fixedCosts', 'Постоянные затраты за период', e.fixedCosts) + '</div></div><p class="field-note" style="margin-top:18px">Затраты на производство видео берутся из органики. Расходы на рекламу — из Meta Ads. MER = вся выручка / (реклама + производство контента). Допустимая цена заказа — выручка на заказ после затрат, кроме привлечения.</p><button class="button primary" style="margin-top:20px">Сохранить и пересчитать</button></section><aside class="panel panel-body"><h2>Структура затрат</h2>' + costList(s) + '<div class="cost-row total"><span>Прибыль до налогов</span><strong>' + money(s.profit) + '</strong></div></aside></form>' + warnings(s);
  }
  function render() {
    activeView = views[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
    byId('sectionName').textContent = views[activeView];
    byId('navigation').innerHTML = Object.entries(views).map(([key, label]) => '<a href="#' + key + '" class="' + (key === activeView ? 'active' : '') + '">' + icon(key) + label + '</a>').join('');
    byId('content').innerHTML = ({ overview, scenario: scenarioView, meta: metaView, organic: organicView, economics: economicsView }[activeView])();
    bind();
  }
  function validateInputs(container) { for (const field of container.querySelectorAll('input,select')) if (!field.reportValidity()) return false; return true; }
  function bind() {
    const form = byId('periodForm'); if (form) form.onsubmit = event => { event.preventDefault(); guard(() => { const next = { start: form.elements.start.value, end: form.elements.end.value }; engine.calculate(model, next.start, next.end); range = next; render(); }); };
    if (activeView === 'scenario') {
      const scenarioForm = byId('scenarioForm');
      scenarioForm.oninput = () => { readScenario(); for (const [id, value] of Object.entries({ scenarioTotalOrders: scenario.orders, scenarioPaidOrders: scenario.paidOrders, scenarioOrganicOrders: scenario.organicOrders, scenarioDirectOrders: scenario.orders - scenario.paidOrders - scenario.organicOrders })) byId(id).textContent = integer(value); };
      const preview = () => { if (!scenarioForm.reportValidity()) return; guard(() => showPreview(engine.preview(readScenario()), 'Новый сценарий', 'Заданные итоги точны. Распределение между днями, объявлениями и видео сгенерировано для демонстрации.')); };
      scenarioForm.onsubmit = event => { event.preventDefault(); preview(); };
      byId('shuffleButton').onclick = () => { readScenario(); scenario.seed = 'case-' + Math.random().toString(36).slice(2, 10); scenarioForm.elements.seed.value = scenario.seed; preview(); };
    }
    if (activeView === 'meta') {
      renderMetaRows();
      byId('metaSearch').oninput = event => { metaFilters.query = event.target.value; tablePage = 0; renderMetaRows(); };
      byId('campaignFilter').onchange = event => { metaFilters.campaign = event.target.value; metaFilters.set = ''; tablePage = 0; render(); };
      byId('setFilter').onchange = event => { metaFilters.set = event.target.value; tablePage = 0; renderMetaRows(); };
      byId('metaPrev').onclick = () => { tablePage--; renderMetaRows(); }; byId('metaNext').onclick = () => { tablePage++; renderMetaRows(); };
      byId('selectVisible').onchange = event => { filteredAds().forEach(r => event.target.checked ? selected.add(r.id) : selected.delete(r.id)); renderMetaRows(); };
      byId('resetMeta').onclick = () => { draft = copy(model); dirty = false; render(); };
      byId('saveMeta').onclick = () => guard(() => { if (!validateInputs(byId('metaRows'))) return; const next = copy(draft); if (byId('syncMeta').checked) engine.syncShop(next, model); save(next); });
      byId('distributeSpend').onclick = () => { const rows = selected.size ? draft.meta.rows.filter(r => selected.has(r.id)) : filteredAds(); byId('budgetScope').textContent = 'Выбрано ' + rows.length + ' объявлений. Сумма относится ко всему периоду.'; byId('budgetForm').elements.spend.value = Math.round(rows.reduce((sum, r) => sum + r.spend, 0) * 100) / 100; byId('budgetDialog').showModal(); };
    }
    if (activeView === 'organic') {
      renderOrganicRows(); byId('organicFilter').onchange = event => { organicAccount = event.target.value; organicPage = 0; renderOrganicRows(); };
      byId('organicPrev').onclick = () => { organicPage--; renderOrganicRows(); }; byId('organicNext').onclick = () => { organicPage++; renderOrganicRows(); };
      byId('addVideo').onclick = () => { draft.organic.videos.unshift({ id: 'video-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), accountId: organicAccount || draft.organic.accounts[0].id, date: model.shop.end, title: 'Новое видео', views: 0, clicks: 0, orders: 0, revenue: 0, cost: 0 }); organicPage = 0; markDirty(); renderOrganicRows(); };
      byId('saveOrganic').onclick = () => guard(() => { if (!validateInputs(byId('content'))) return; const next = copy(draft); if (byId('syncOrganic').checked) engine.syncShop(next, model); save(next); });
    }
    if (activeView === 'economics') {
      byId('economicsForm').oninput = event => { if (event.target.name) { draft.settings.economics[event.target.name] = Number(event.target.value); markDirty(); } };
      byId('economicsForm').onsubmit = event => { event.preventDefault(); guard(() => save(copy(draft), 'Юнит-экономика пересчитана.')); };
    }
  }
  byId('content').addEventListener('change', event => {
    const target = event.target;
    if (target.dataset.selectAd) { target.checked ? selected.add(target.dataset.selectAd) : selected.delete(target.dataset.selectAd); byId('metaCount').textContent = filteredAds().length + ' объявлений · выбрано ' + selected.size; }
    const rowId = target.dataset.adId || target.dataset.videoId;
    if (rowId) {
      const row = target.dataset.adId ? draft.meta.rows.find(r => r.id === rowId) : draft.organic.videos.find(r => r.id === rowId);
      row[target.dataset.key] = target.type === 'number' ? Number(target.value) : target.value.trim();
      if (target.dataset.adId && target.type === 'number') delete row.daily;
      target.closest('tr').classList.add('row-changed'); markDirty();
    }
    if (activeView === 'organic' && ('accountName' in target.dataset || 'accountPlatform' in target.dataset)) {
      const index = Number(target.dataset.accountName ?? target.dataset.accountPlatform);
      draft.organic.accounts[index]['accountName' in target.dataset ? 'name' : 'platform'] = target.value.trim(); markDirty();
    }
  });
  byId('content').addEventListener('click', event => {
    const add = event.target.closest('[data-add-account]'), remove = event.target.closest('[data-remove-account]'), removeVideo = event.target.closest('[data-remove-video]');
    if (add || remove) guard(() => {
      if (activeView === 'scenario') readScenario();
      const accounts = activeView === 'scenario' ? scenario.accounts : draft.organic.accounts;
      if (add) { if (accounts.length >= 30) throw Error('Максимум 30 аккаунтов.'); accounts.push({ id: 'account-' + Date.now(), platform: 'Instagram', name: '@new.account' }); }
      else { const index = Number(remove.dataset.removeAccount); if (accounts.length === 1) throw Error('Оставьте хотя бы один аккаунт.'); if (activeView === 'organic' && draft.organic.videos.some(v => v.accountId === accounts[index].id)) throw Error('Сначала перенесите или удалите видео этого аккаунта.'); accounts.splice(index, 1); }
      if (activeView === 'organic') markDirty(); render();
    });
    if (removeVideo) { draft.organic.videos = draft.organic.videos.filter(v => v.id !== removeVideo.dataset.removeVideo); markDirty(); renderOrganicRows(); }
  });
  byId('budgetForm').onsubmit = event => {
    event.preventDefault(); guard(() => {
      const next = copy(draft), rows = selected.size ? next.meta.rows.filter(r => selected.has(r.id)) : next.meta.rows.filter(r => filteredAds().some(f => f.id === r.id));
      if (!rows.length) throw Error('Нет объявлений для распределения.');
      const total = Math.round(Number(event.target.elements.spend.value) * 100), oldTotal = rows.reduce((sum, r) => sum + r.spend, 0);
      let assigned = 0, cumulative = 0;
      rows.forEach((row, index) => { cumulative += oldTotal ? row.spend / oldTotal : 1 / rows.length; const end = index === rows.length - 1 ? total : Math.round(total * cumulative); row.spend = (end - assigned) / 100; assigned = end; delete row.daily; });
      if (byId('syncMeta').checked) engine.syncShop(next, model);
      byId('budgetDialog').close(); showPreview(next, 'Распределение расходов', 'Покупки и выручка объявлений сохранятся. Дневные значения изменённых объявлений будут распределены пропорционально.');
    });
  };
  byId('closeBudget').onclick = () => byId('budgetDialog').close();
  byId('cancelPreview').onclick = () => { pending = null; byId('previewDialog').close(); };
  byId('applyPreview').onclick = () => guard(() => { if (pending) save(pending); });
  byId('exportButton').onclick = () => guard(() => {
    const text = engine.exportModel(model), url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'case-' + model.shop.end + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Кейс экспортирован. Загруженные миниатюры остаются в браузере Meta Ads.');
  });
  byId('importButton').onclick = () => byId('importFile').click();
  byId('importFile').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 25 * 1024 * 1024) throw Error('Максимальный размер файла — 25 МБ.'); showPreview(engine.importModel(await file.text()), 'Импорт кейса', 'После применения данные этого файла заменят текущий кейс в трёх кабинетах.'); }
    catch (error) { toast(error.message, true); } finally { event.target.value = ''; }
  };
  window.addEventListener('hashchange', () => { guard(render); window.scrollTo(0, 0); });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  try {
    if (!engine) throw Error('Не удалось загрузить расчётный модуль. Обновите страницу.');
    const initial = engine.read();
    const fresh = Object.values(engine.keys).every(key => localStorage.getItem(key) === null);
    load(fresh ? engine.save(initial) : initial); render();
    engine.subscribe(next => {
      if (saving) return;
      if (dirty || byId('previewDialog').open) { byId('saveStatus').textContent = 'Данные изменены в другой вкладке'; toast('Данные изменились в другом кабинете. Экспортируйте правки или обновите страницу перед сохранением.', true); return; }
      guard(() => { load(next); render(); });
    });
  } catch (error) { byId('content').innerHTML = '<div class="banner error">' + escape(error.message) + '</div>'; }
})();
