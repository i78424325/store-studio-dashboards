/* Local case data shared by the three dashboards. No network access. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CaseStudio = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const KEYS = { central: 'case-studio-v1', shop: 'shoot-store-v1', meta: 'video-meta-ads-v1' };
  const DAY = 86400000;
  const MAX = 999999999999;
  const META_FIELDS = ['spend', 'purchases', 'value', 'impressions', 'reach', 'clicks'];
  const ECON_FIELDS = ['cogsPercent', 'shippingPerOrder', 'feePercent', 'feePerOrder', 'refundPercent', 'fixedCosts', 'otherVariablePerOrder'];
  const listeners = new Set();
  const copy = value => JSON.parse(JSON.stringify(value));
  const cents = value => Math.round(value * 100);
  const money = value => Math.round(value) / 100;
  const stamp = value => Date.parse(value + 'T00:00:00Z');
  const iso = value => new Date(value).toISOString().slice(0, 10);
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
  function fail(message) { throw new Error(message); }
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ': ожидается объект.');
    return value;
  }
  function numeric(value, label, integer = false, max = MAX) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) fail(label + ': некорректное число.');
    return value;
  }
  function text(value, label, length = 300) {
    if (typeof value !== 'string' || !value.trim() || value.length > length) fail(label + ': некорректный текст.');
    return value;
  }
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '9998-12-31' && Number.isFinite(stamp(value)) && iso(stamp(value)) === value;
  }
  function range(start, end, maxDays = 36600) {
    if (!validDate(start) || !validDate(end) || end < start || (stamp(end) - stamp(start)) / DAY + 1 > maxDays) fail('Некорректный период.');
  }
  function dates(start, end) {
    range(start, end);
    return Array.from({ length: (stamp(end) - stamp(start)) / DAY + 1 }, (_, i) => iso(stamp(start) + i * DAY));
  }
  function random(seed) {
    let state = 2166136261;
    for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    return function () {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ state >>> 15, state | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Largest remainder allocation conserves cents and counts exactly.
  function allocate(total, weights) {
    if (!weights.length) { if (total) fail('Нет записей для распределения.'); return []; }
    const weightSum = weights.reduce((a, b) => a + b, 0);
    if (!weightSum) { if (total) fail('Нулевые веса распределения.'); return weights.map(() => 0); }
    const exact = weights.map(weight => total * weight / weightSum);
    const result = exact.map(Math.floor);
    let left = total - result.reduce((a, b) => a + b, 0);
    const ranking = exact.map((v, i) => ({ i, remainder: v - result[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
    for (let i = 0; i < left; i++) result[ranking[i % ranking.length].i]++;
    return result;
  }
  function economicDefaults() { return Object.fromEntries(ECON_FIELDS.map(key => [key, 0])); }
  function defaults() {
    return {
      name: 'Northline Studio', currency: 'USD', start: '2026-10-01', end: '2026-10-31',
      sales: 12842.50, orders: 186, paidSpend: 1840, paidOrders: 120, organicOrders: 42,
      organicViews: 480000, organicCost: 420, videosPerAccount: 12, conversionRate: 2.5,
      viralShare: 65, variance: 'balanced', trend: 'growth', seed: 'northline-2026',
      accounts: Array.from({ length: 7 }, (_, i) => ({ id: 'organic-' + (i + 1), platform: i === 6 ? 'TikTok' : 'Instagram', name: i === 6 ? '@northline.tiktok' : '@northline.' + (i + 1) })),
      economics: economicDefaults()
    };
  }
  function validateEconomics(value) {
    object(value, 'Экономика');
    for (const key of ECON_FIELDS) numeric(value[key], key, false, key.endsWith('Percent') ? 100 : MAX);
  }
  function validateAccounts(accounts) {
    if (!Array.isArray(accounts) || !accounts.length || accounts.length > 30) fail('Нужно от 1 до 30 аккаунтов.');
    const seen = new Set();
    accounts.forEach(account => {
      object(account, 'Аккаунт'); text(account.id, 'ID'); text(account.name, 'Название'); text(account.platform, 'Платформа');
      if (seen.has(account.id)) fail('Повторяющийся ID аккаунта.');
      seen.add(account.id);
    });
  }
  function validateConfig(config) {
    object(config, 'Конфигурация'); range(config.start, config.end, 366);
    text(config.name, 'Магазин'); text(config.seed, 'Seed');
    if (!/^[A-Z]{3}$/.test(config.currency)) fail('Укажите трёхбуквенную валюту.');
    for (const key of ['sales', 'paidSpend', 'organicCost']) numeric(config[key], key);
    for (const key of ['orders', 'paidOrders', 'organicOrders', 'organicViews']) numeric(config[key], key, true);
    numeric(config.videosPerAccount, 'Количество видео', true, 100);
    if (!config.videosPerAccount) fail('Нужно хотя бы одно видео на аккаунт.');
    numeric(config.conversionRate, 'Конверсия', false, 100);
    if (!config.conversionRate) fail('Конверсия должна быть больше нуля.');
    numeric(config.viralShare, 'Доля вирусных просмотров', false, 100);
    if (config.ctr !== undefined) { numeric(config.ctr, 'CTR', false, 100); if (!config.ctr) fail('CTR должен быть больше нуля.'); }
    if (config.paidOrders + config.organicOrders > config.orders) fail('Заказы рекламы и органики превышают заказы магазина.');
    if (!config.orders && config.sales) fail('Для выручки нужны заказы.');
    if (config.organicViews < config.organicOrders) fail('Просмотров органики меньше, чем заказов.');
    if (!['stable', 'balanced', 'volatile'].includes(config.variance) || !['growth', 'steady', 'launch'].includes(config.trend)) fail('Неизвестный режим распределения.');
    validateAccounts(config.accounts); validateEconomics(config.economics);
  }
  function dayWeights(config, rng, allDates) {
    return allDates.map((date, i) => {
      const progress = (i + 1) / allDates.length;
      const trend = config.trend === 'growth' ? 0.35 + progress * 1.3 : config.trend === 'launch' ? 0.25 + 2 * Math.exp(-Math.pow((progress - 0.32) * 4, 2)) : 1;
      const scale = { stable: 0.2, balanced: 0.8, volatile: 1.8 }[config.variance];
      return Math.max(0.03, trend * (1 + (rng() - 0.5) * scale));
    });
  }
  function hierarchy(existing) {
    const prior = existing?.rows || [];
    if (prior.length === 180 && new Set(prior.map(r => r.cid)).size === 3 && new Set(prior.map(r => r.sid)).size === 9) return copy(prior);
    const campaigns = [...new Set(prior.map(r => r.cid))];
    const result = [];
    for (let c = 0; c < 3; c++) {
      const cid = campaigns[c] || 'campaign-' + (c + 1);
      const campaignRows = prior.filter(r => r.cid === cid);
      const sets = [...new Set(campaignRows.map(r => r.sid))];
      for (let s = 0; s < 3; s++) {
        const sid = sets[s] || cid + '-set-' + (s + 1);
        const setRows = campaignRows.filter(r => r.sid === sid);
        for (let a = 0; a < 20; a++) {
          const old = setRows[a];
          result.push(old ? copy(old) : {
            id: sid + '-ad-' + (a + 1), cid, sid,
            c: campaignRows[0]?.c || ['Prospecting', 'Retargeting', 'Creative testing'][c],
            s: setRows[0]?.s || ['Broad audience', 'Interests', 'Lookalike audience'][s] + ' · ' + (c + 1),
            a: 'Creative ' + String(a + 1).padStart(2, '0'), active: true, budget: 0, visual: a % 12
          });
        }
      }
    }
    return result;
  }
  function generate(config, current) {
    validateConfig(config);
    const rng = random(config.seed), allDates = dates(config.start, config.end), weights = dayWeights(config, rng, allDates);
    const metaRows = hierarchy(current?.meta);
    const spendWeights = metaRows.map(() => 0.05 + Math.pow(rng(), 2) * 3);
    const orderWeights = spendWeights.map((w, i) => i % 4 === 0 ? 0 : w * (0.2 + rng() * 3));
    const paidOrders = allocate(config.paidOrders, orderWeights), spends = allocate(cents(config.paidSpend), spendWeights);
    const sessions = Math.max(config.orders, Math.round(config.orders / (config.conversionRate / 100)));
    const directOrders = config.orders - config.paidOrders - config.organicOrders;
    const extraTraffic = allocate(sessions - config.orders, [config.paidOrders + (config.paidSpend ? 1 : 0), config.organicOrders + (config.organicViews ? 1 : 0), directOrders + 1]);
    const organicClicks = Math.min(config.organicViews, config.organicOrders + extraTraffic[1]);
    const paidClicks = config.paidOrders + extraTraffic[0];
    const directSessions = sessions - paidClicks - organicClicks;
    const adClicks = allocate(paidClicks - config.paidOrders, spendWeights).map((n, i) => n + paidOrders[i]);
    const videos = [];
    for (const account of config.accounts) for (let i = 0; i < config.videosPerAccount; i++) {
      const dateIndex = Math.min(allDates.length - 1, Math.floor((i + rng()) / config.videosPerAccount * allDates.length));
      videos.push({ id: account.id + '-video-' + (i + 1), accountId: account.id, date: allDates[dateIndex], title: 'Video ' + String(i + 1).padStart(2, '0') });
    }
    const viralCount = Math.max(1, Math.ceil(videos.length * 0.08));
    const ranked = videos.map((v, i) => ({ i, rank: rng() })).sort((a, b) => b.rank - a.rank);
    const viralIds = new Set(ranked.slice(0, viralCount).map(r => r.i));
    const videoWeights = videos.map((v, i) => (viralIds.has(i) ? config.viralShare / viralCount : (100 - config.viralShare) / Math.max(1, videos.length - viralCount)) * (0.5 + rng()));
    if (!videoWeights.some(Boolean)) videoWeights.fill(1);
    const viewPools = allocate(config.organicViews, videos.length === viralCount ? [1, 0] : [config.viralShare, 100 - config.viralShare]);
    const views = videos.map(() => 0);
    for (const [pool, isViral] of [[viewPools[0], true], [viewPools[1], false]]) {
      const indices = videos.map((_, i) => i).filter(i => viralIds.has(i) === isViral);
      const assigned = allocate(pool, indices.map(i => 0.5 + rng()));
      indices.forEach((index, i) => { views[index] = assigned[i]; });
    }
    const videoOrders = allocate(config.organicOrders, views);
    const clicks = allocate(organicClicks - config.organicOrders, views.map((n, i) => n - videoOrders[i])).map((n, i) => n + videoOrders[i]);
    const videoCosts = allocate(cents(config.organicCost), videos.map(() => 0.5 + rng()));
    const directByDay = allocate(directOrders, weights);
    const revenueWeights = [...paidOrders, ...videoOrders, ...directByDay];
    const revenue = config.sales ? allocate(cents(config.sales), revenueWeights) : revenueWeights.map(() => 0);
    const shopDaily = allDates.map(date => [date, 0, 0, 0]);
    metaRows.forEach((row, i) => {
      row.spend = money(spends[i]); row.purchases = paidOrders[i]; row.value = money(revenue[i]); row.clicks = adClicks[i];
      row.impressions = row.clicks ? Math.max(row.clicks, Math.round(row.clicks / (Math.min(100, (config.ctr || 1.7) * (0.6 + rng() * 1.4)) / 100))) : Math.round(row.spend / 12 * 1000);
      row.reach = Math.max(row.clicks, Math.round(row.impressions * (0.55 + rng() * 0.25)));
      const ownWeights = weights.map(w => w * (0.2 + rng() * 1.6));
      const orders = allocate(row.purchases, ownWeights), amount = row.value ? allocate(cents(row.value), orders) : orders.map(() => 0);
      const spend = allocate(spends[i], ownWeights), click = allocate(row.clicks - row.purchases, ownWeights).map((n, d) => n + orders[d]);
      const reach = allocate(row.reach - row.clicks, ownWeights).map((n, d) => n + click[d]);
      const impressions = allocate(row.impressions - row.reach, ownWeights).map((n, d) => n + reach[d]);
      row.daily = allDates.map((date, d) => {
        shopDaily[d][1] += amount[d]; shopDaily[d][2] += orders[d]; shopDaily[d][3] += click[d];
        return [date, money(spend[d]), orders[d], money(amount[d]), impressions[d], reach[d], click[d]];
      });
    });
    videos.forEach((video, i) => {
      Object.assign(video, { views: views[i], clicks: clicks[i], orders: videoOrders[i], revenue: money(revenue[180 + i]), cost: money(videoCosts[i]) });
      const d = allDates.indexOf(video.date);
      shopDaily[d][1] += cents(video.revenue); shopDaily[d][2] += video.orders; shopDaily[d][3] += video.clicks;
    });
    const directTraffic = allocate(directSessions - directOrders, weights).map((n, i) => n + directByDay[i]);
    shopDaily.forEach((row, i) => {
      row[1] = money(row[1] + revenue[180 + videos.length + i]); row[2] += directByDay[i]; row[3] += directTraffic[i];
    });
    const budgets = new Map();
    for (const row of metaRows) budgets.set(row.sid, (budgets.get(row.sid) || 0) + cents(row.spend));
    for (const row of metaRows) row.budget = money(Math.round(budgets.get(row.sid) / allDates.length));
    return {
      shop: { ...(current?.shop || {}), name: config.name, currency: config.currency, start: config.start, end: config.end, sales: money(cents(config.sales)), orders: config.orders, sessions, spend: money(cents(config.paidSpend)), provider: current?.shop?.provider || 'Shopify Payments', campaign: current?.shop?.campaign || 'Store campaigns', daily: shopDaily, dailySpend: allDates.map((date, d) => [date, money(metaRows.reduce((total, row) => total + cents(row.daily[d][1]), 0))]) },
      meta: { ...(current?.meta || {}), account: current?.meta?.account || config.name, accountId: current?.meta?.accountId || '419682351204870', currency: config.currency, start: config.start, end: config.end, schemaVersion: 2, rows: metaRows },
      organic: { accounts: copy(config.accounts), videos }, settings: { economics: copy(config.economics), config: copy(config) }, revision: current?.revision || 0, _sourceRevision: current?._sourceRevision || fingerprints(), _generated: true
    };
  }
  function storage() { try { return root.localStorage; } catch (_) { return null; } }
  function fingerprints() {
    const target = storage();
    return Object.fromEntries(Object.values(KEYS).map(key => {
      let value = '';
      try { value = target?.getItem(key) || ''; } catch (_) { return [key, 'unavailable']; }
      let hash = 2166136261;
      for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
      return [key, value.length + ':' + (hash >>> 0)];
    }));
  }
  function stored(key, warnings) {
    try { const raw = storage()?.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (_) { warnings.push('Не удалось прочитать сохранённые данные: ' + key); return null; }
  }
  function read() {
    const warnings = [], central = stored(KEYS.central, warnings), shop = stored(KEYS.shop, warnings), meta = stored(KEYS.meta, warnings);
    if (!shop && !meta && !central) {
      const initial = generate(defaults()); delete initial._generated; initial.warnings = warnings; return initial;
    }
    const emptyShop = { name: 'Store', currency: meta?.currency || 'USD', start: meta?.start || defaults().start, end: meta?.end || defaults().end, sales: 0, orders: 0, sessions: 0, spend: 0, provider: 'Payments', campaign: 'Campaigns' };
    const actualShop = shop || central?.shop || emptyShop;
    const emptyMeta = { account: actualShop.name, accountId: '419682351204870', currency: actualShop.currency, start: actualShop.start, end: actualShop.end, schemaVersion: 2, rows: [] };
    const result = { shop: actualShop, meta: meta || central?.meta || emptyMeta, organic: central?.organic || { accounts: defaults().accounts, videos: [] }, settings: central?.settings || { economics: economicDefaults(), config: defaults() }, revision: central?.revision || 0, _sourceRevision: fingerprints(), warnings };
    if (!shop && !central?.shop) warnings.push('Данные магазина отсутствуют. Сохранённые значения рекламы оставлены без изменений.');
    if (!meta && !central?.meta) warnings.push('Данные рекламного кабинета отсутствуют.');
    return copy(result);
  }
  function preview(config) {
    const previous = read();
    return generate({ ...defaults(), ...config, economics: { ...economicDefaults(), ...config.economics } }, previous);
  }
  function validateDaily(rows, start, end, fields, moneyFields) {
    if (rows === undefined) return;
    if (!Array.isArray(rows) || rows.length > 36600) fail('Некорректные дневные данные.');
    const seen = new Set();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== fields.length + 1 || !validDate(row[0]) || row[0] < start || row[0] > end || seen.has(row[0])) fail('Некорректная или повторная дата.');
      seen.add(row[0]); fields.forEach((key, i) => numeric(row[i + 1], key, !moneyFields.includes(key)));
    }
  }
  function validate(model) {
    object(model, 'Модель'); const shop = object(model.shop, 'Магазин'), meta = object(model.meta, 'Реклама');
    range(shop.start, shop.end); range(meta.start, meta.end); text(shop.name, 'Магазин'); text(meta.account, 'Рекламный кабинет');
    for (const entity of [shop, meta]) if (typeof entity.currency !== 'string' || !/^[A-Z]{3}$/.test(entity.currency)) fail('Некорректная валюта.');
    for (const key of ['sales', 'orders', 'sessions', 'spend']) numeric(shop[key], key, key === 'orders' || key === 'sessions');
    validateDaily(shop.daily, shop.start, shop.end, ['sales', 'orders', 'sessions'], ['sales']);
    validateDaily(shop.dailySpend, shop.start, shop.end, ['spend'], ['spend']);
    if (!Array.isArray(meta.rows) || meta.rows.length > 10000) fail('Некорректные объявления.');
    const adIds = new Set();
    for (const row of meta.rows) {
      object(row, 'Объявление');
      for (const key of ['id', 'cid', 'sid', 'c', 's', 'a']) text(row[key], key);
      if (adIds.has(row.id)) fail('Повторяющийся ID объявления.'); adIds.add(row.id);
      numeric(row.budget, 'Бюджет');
      for (const key of META_FIELDS) numeric(row[key], key, !['spend', 'value'].includes(key));
      validateDaily(row.daily, meta.start, meta.end, META_FIELDS, ['spend', 'value']);
    }
    object(model.organic, 'Органика'); validateAccounts(model.organic.accounts);
    if (!Array.isArray(model.organic.videos) || model.organic.videos.length > 10000) fail('Некорректные видео.');
    const accounts = new Set(model.organic.accounts.map(a => a.id)), videos = new Set();
    for (const video of model.organic.videos) {
      object(video, 'Видео'); text(video.id, 'ID видео'); text(video.title, 'Название видео');
      if (videos.has(video.id) || !accounts.has(video.accountId) || !validDate(video.date)) fail('Некорректная связь видео или дата.');
      videos.add(video.id);
      for (const key of ['views', 'clicks', 'orders', 'revenue', 'cost']) numeric(video[key], key, !['revenue', 'cost'].includes(key));
    }
    object(model.settings, 'Настройки'); validateEconomics(model.settings.economics);
    return model;
  }
  function notify() { for (const listener of listeners) { try { listener(read()); } catch (error) { root.console?.error(error); } } }
  function save(model) {
    validate(model);
    const target = storage(); if (!target) fail('Хранилище браузера недоступно.');
    const current = stored(KEYS.central, []);
    if (model._sourceRevision && Object.entries(fingerprints()).some(([key, value]) => model._sourceRevision[key] !== value)) fail('Данные изменились в другом кабинете. Обновите данные перед сохранением.');
    if (model.revision !== undefined && model.revision < (current?.revision || 0)) fail('Данные изменились в другой вкладке. Обновите страницу перед сохранением.');
    const clean = copy(model); delete clean._generated; delete clean.warnings; delete clean._sourceRevision;
    clean.revision = (current?.revision || 0) + 1;
    const writes = [ [KEYS.shop, JSON.stringify(clean.shop)], [KEYS.meta, JSON.stringify(clean.meta)] ];
    if (model._generated) {
      writes.push([KEYS.shop + '-filter', JSON.stringify({ start: clean.shop.start, end: clean.shop.end })]);
      writes.push([KEYS.meta + '-range', JSON.stringify({ start: clean.meta.start, end: clean.meta.end })]);
    }
    writes.push([KEYS.central, JSON.stringify({ organic: clean.organic, settings: clean.settings, revision: clean.revision })]);
    const previous = writes.map(([key]) => [key, target.getItem(key)]);
    let completed = 0;
    try { for (const [key, value] of writes) { target.setItem(key, value); completed++; } }
    catch (error) {
      let restored = true;
      for (let i = completed - 1; i >= 0; i--) { try { const [key, value] = previous[i]; if (value === null) target.removeItem(key); else target.setItem(key, value); } catch (_) { restored = false; } }
      fail(restored ? 'Не удалось сохранить: хранилище заполнено. Предыдущие данные восстановлены.' : 'Не удалось завершить сохранение и восстановление. Сохраните резервную копию текущих данных.');
    }
    clean._sourceRevision = fingerprints(); notify(); return clean;
  }
  function subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); }
  if (root.addEventListener) root.addEventListener('storage', event => { if (event.key === null || Object.values(KEYS).includes(event.key)) notify(); });
  function projectRecord(record, sourceStart, sourceEnd, start, end, fields, moneyFields) {
    const result = Object.fromEntries(fields.map(k => [k, 0]));
    if (record.daily?.length) {
      for (const row of record.daily) if (row[0] >= start && row[0] <= end) fields.forEach((key, i) => { result[key] += moneyFields.includes(key) ? cents(row[i + 1]) : row[i + 1]; });
      for (const key of moneyFields) result[key] = money(result[key]);
      return result;
    }
    const n = (stamp(sourceEnd) - stamp(sourceStart)) / DAY + 1;
    const from = Math.max(0, Math.min(n, (stamp(start) - stamp(sourceStart)) / DAY));
    const to = Math.max(0, Math.min(n, (stamp(end) - stamp(sourceStart)) / DAY + 1));
    for (const key of fields) {
      const units = moneyFields.includes(key) ? cents(record[key]) : record[key];
      const value = Math.round(units * to / n) - Math.round(units * from / n);
      result[key] = moneyFields.includes(key) ? money(value) : value;
    }
    return result;
  }
  function economics(revenue, orders, paidSpend, organicCost, fixed, rates) {
    const cogs = cents(revenue * rates.cogsPercent / 100), shipping = cents(orders * rates.shippingPerOrder);
    const fees = cents(revenue * rates.feePercent / 100 + orders * rates.feePerOrder), refunds = cents(revenue * rates.refundPercent / 100);
    const other = cents(orders * rates.otherVariablePerOrder), costs = cogs + shipping + fees + refunds + cents(fixed) + other + cents(paidSpend) + cents(organicCost);
    return { cogs: money(cogs), shipping: money(shipping), fees: money(fees), refunds: money(refunds), fixedCosts: fixed, otherCosts: money(other), totalCosts: money(costs), profit: money(cents(revenue) - costs) };
  }
  function costSchedule(shop, rates) {
    const sourceDates = dates(shop.start, shop.end);
    const supplied = new Map((shop.daily || []).map(row => [row[0], row]));
    const daily = sourceDates.map(date => {
      if (shop.daily?.length) {
        const row = supplied.get(date);
        return { date, revenue: row?.[1] || 0, orders: row?.[2] || 0 };
      }
      const value = projectRecord(shop, shop.start, shop.end, date, date, ['sales', 'orders'], ['sales']);
      return { date, revenue: value.sales, orders: value.orders };
    });
    const revenue = money(daily.reduce((total, day) => total + cents(day.revenue), 0));
    const orders = sum(daily, 'orders');
    const costs = economics(revenue, orders, 0, 0, rates.fixedCosts, rates);
    for (const key of ['cogs', 'shipping', 'fees', 'refunds', 'otherCosts', 'fixedCosts']) {
      const weights = daily.map(day => key === 'fixedCosts' ? 1 : key === 'fees' ? day.revenue * rates.feePercent / 100 + day.orders * rates.feePerOrder : ['shipping', 'otherCosts'].includes(key) ? day.orders : day.revenue);
      if (!weights.some(Boolean)) weights.fill(1);
      const parts = allocate(cents(costs[key]), weights);
      daily.forEach((day, i) => { day[key] = money(parts[i]); });
    }
    return new Map(daily.map(day => [day.date, day]));
  }
  function calculate(model, start = model.shop.start, end = model.shop.end) {
    validate(model); range(start, end, 3660);
    const warnings = [...(model.warnings || [])], shop = model.shop, meta = model.meta, currencyMismatch = shop.currency !== meta.currency;
    const rates = model.settings.economics, allDates = dates(start, end);
    const scheduledCosts = costSchedule(shop, rates);
    const shopFields = ['sales', 'orders', 'sessions'], shopRecord = { ...shop, sales: shop.sales };
    const paidByDate = new Map(allDates.map(date => [date, Object.fromEntries(META_FIELDS.map(key => [key, 0]))]));
    for (const row of meta.rows) {
      if (row.daily?.length) {
        for (const entry of row.daily) {
          const total = paidByDate.get(entry[0]);
          if (!total) continue;
          META_FIELDS.forEach((key, i) => { total[key] += ['spend', 'value'].includes(key) ? cents(entry[i + 1]) : entry[i + 1]; });
        }
      } else {
        for (const [date, total] of paidByDate) {
          const projected = projectRecord(row, meta.start, meta.end, date, date, META_FIELDS, ['spend', 'value']);
          for (const key of META_FIELDS) total[key] += ['spend', 'value'].includes(key) ? cents(projected[key]) : projected[key];
        }
      }
    }
    const organicByDate = new Map();
    for (const video of model.organic.videos) {
      if (!organicByDate.has(video.date)) organicByDate.set(video.date, []);
      organicByDate.get(video.date).push(video);
    }
    const daily = allDates.map(date => {
      const store = projectRecord(shopRecord, shop.start, shop.end, date, date, shopFields, ['sales']);
      const paid = paidByDate.get(date);
      const videos = organicByDate.get(date) || [];
      const organicRevenue = money(videos.reduce((total, v) => total + cents(v.revenue), 0)), organicCost = money(videos.reduce((total, v) => total + cents(v.cost), 0));
      const paidSpend = currencyMismatch ? 0 : money(paid.spend), paidRevenue = currencyMismatch ? 0 : money(paid.value);
      const scheduled = scheduledCosts.get(date) || {};
      const costKeys = ['cogs', 'shipping', 'fees', 'refunds', 'fixedCosts', 'otherCosts'];
      const costs = Object.fromEntries(costKeys.map(key => [key, scheduled[key] || 0]));
      costs.totalCosts = money(costKeys.reduce((total, key) => total + cents(costs[key]), 0) + cents(paidSpend) + cents(organicCost));
      costs.profit = money(cents(store.sales) - cents(costs.totalCosts));
      return { date, revenue: store.sales, orders: store.orders, sessions: store.sessions, paidSpend, paidRevenue, paidOrders: paid.purchases, paidClicks: paid.clicks, impressions: paid.impressions, reach: paid.reach, organicRevenue, organicOrders: sum(videos, 'orders'), organicViews: sum(videos, 'views'), organicClicks: sum(videos, 'clicks'), organicCost, ...costs };
    });
    const monetary = ['revenue', 'paidSpend', 'paidRevenue', 'organicRevenue', 'organicCost', 'profit', 'totalCosts', 'cogs', 'shipping', 'fees', 'refunds', 'fixedCosts', 'otherCosts'];
    const counts = ['orders', 'sessions', 'paidOrders', 'paidClicks', 'impressions', 'reach', 'organicOrders', 'organicViews', 'organicClicks'];
    const totals = Object.fromEntries([...monetary.map(key => [key, money(daily.reduce((t, d) => t + cents(d[key]), 0))]), ...counts.map(key => [key, sum(daily, key)])]);
    const directRevenue = money(cents(totals.revenue) - cents(totals.paidRevenue) - cents(totals.organicRevenue));
    const directOrders = totals.orders - totals.paidOrders - totals.organicOrders;
    if (currencyMismatch) warnings.push('Валюты магазина и рекламы различаются. Денежные показатели рекламы исключены из общей экономики до выбора одной валюты.');
    if (directRevenue < 0 || directOrders < 0) warnings.push('Атрибутированные продажи превышают магазин: отрицательный остаток показывает расхождение, исходные данные сохранены.');
    if (daily.some(d => d.paidOrders + d.organicOrders > d.orders || cents(d.paidRevenue) + cents(d.organicRevenue) > cents(d.revenue))) warnings.push('Есть дневные расхождения атрибуции. Для данных с общими итогами распределение по дням расчётное.');
    if (!shop.daily?.length || meta.rows.some(r => !r.daily?.length)) warnings.push('Часть периода рассчитана пропорционально дням: точных дневных записей нет.');
    if (Object.values(rates).every(v => !v)) warnings.push('Затраты на товар, доставку и комиссии не введены. Прибыль рассчитана только после известных затрат.');
    if (shop.daily?.length) {
      const reported = [shop.sales, shop.orders, shop.sessions];
      if (reported.some((n, i) => i === 0 ? cents(n) !== shop.daily.reduce((t, d) => t + cents(d[i + 1]), 0) : n !== shop.daily.reduce((t, d) => t + d[i + 1], 0))) warnings.push('Итоги магазина отличаются от дневных записей. Для выбранных дат использованы дневные записи.');
    }
    if (meta.rows.some(row => row.daily?.length && META_FIELDS.some((key, i) => ['spend', 'value'].includes(key) ? cents(row[key]) !== row.daily.reduce((t, d) => t + cents(d[i + 1]), 0) : row[key] !== row.daily.reduce((t, d) => t + d[i + 1], 0)))) warnings.push('Итоги объявлений отличаются от дневных записей. Использованы дневные записи.');
    const nonAcquisition = cents(totals.totalCosts) - cents(totals.paidSpend) - cents(totals.organicCost);
    const ratio = (a, b) => b ? a / b : null;
    return {
      ...totals, currency: shop.currency, totalRevenue: totals.revenue, directRevenue, directOrders,
      margin: ratio(totals.profit * 100, totals.revenue), profitPerOrder: ratio(totals.profit, totals.orders),
      cac: ratio(totals.paidSpend, totals.paidOrders), paidRoas: ratio(totals.paidRevenue, totals.paidSpend), mer: ratio(totals.revenue, totals.paidSpend + totals.organicCost),
      breakEvenCpa: totals.orders ? money(cents(totals.revenue) - nonAcquisition) / totals.orders : null,
      warnings: [...new Set(warnings)], daily,
      channels: {
        paid: { revenue: totals.paidRevenue, orders: totals.paidOrders, cost: totals.paidSpend, clicks: totals.paidClicks },
        organic: { revenue: totals.organicRevenue, orders: totals.organicOrders, cost: totals.organicCost, clicks: totals.organicClicks, views: totals.organicViews },
        direct: { revenue: directRevenue, orders: directOrders, cost: 0 }
      }, profitLabel: 'Прибыль после введённых затрат, до налогов'
    };
  }
  function syncShop(next, previous) {
    validate(next); validate(previous);
    if (next.shop.currency !== next.meta.currency || previous.shop.currency !== previous.meta.currency) fail('Для синхронизации нужна одна валюта магазина и рекламы.');
    const start = next.shop.start, end = next.shop.end;
    const before = calculate(previous, start, end), after = calculate(next, start, end);
    const daily = [], dailySpend = [];
    for (let i = 0; i < before.daily.length; i++) {
      const old = before.daily[i], updated = after.daily[i];
      const revenue = cents(old.revenue) - cents(old.paidRevenue) - cents(old.organicRevenue) + cents(updated.paidRevenue) + cents(updated.organicRevenue);
      const orders = old.orders - old.paidOrders - old.organicOrders + updated.paidOrders + updated.organicOrders;
      if (revenue < 0 || orders < 0) fail('Нельзя синхронизировать продажи: исходная дневная атрибуция превышает магазин. Сначала задайте согласованный сценарий.');
      const sessions = Math.max(orders, old.sessions - old.paidClicks - old.organicClicks + updated.paidClicks + updated.organicClicks);
      daily.push([old.date, money(revenue), orders, sessions]);
      dailySpend.push([old.date, updated.paidSpend]);
    }
    next.shop.daily = daily;
    next.shop.dailySpend = dailySpend;
    next.shop.sales = money(daily.reduce((n, row) => n + cents(row[1]), 0));
    next.shop.orders = daily.reduce((n, row) => n + row[2], 0);
    next.shop.sessions = daily.reduce((n, row) => n + row[3], 0);
    next.shop.spend = money(dailySpend.reduce((n, row) => n + cents(row[1]), 0));
    return next;
  }
  function exportModel(model = read()) { validate(model); const clean = copy(model); delete clean._sourceRevision; delete clean._generated; return JSON.stringify({ type: 'case-studio', version: 1, model: clean }, null, 2); }
  function importModel(value) {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || parsed.type !== 'case-studio' || parsed.version !== 1) fail('Неизвестный формат резервной копии.');
    const model = copy(parsed.model); validate(model); model.revision = read().revision; model._sourceRevision = fingerprints(); delete model._generated; return model;
  }
  return { read, preview, save, subscribe, calculate, defaults, validate, syncShop, exportModel, importModel, keys: { ...KEYS } };
});
