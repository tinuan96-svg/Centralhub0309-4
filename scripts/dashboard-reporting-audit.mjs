import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = process.cwd();
const cache = new Map();
function load(file) {
  const absolute = path.resolve(root, file);
  if (absolute === path.join(root, 'lib/supabase.ts')) return { supabase: {} }; // No network or database writes.
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} }; cache.set(absolute, module);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const localRequire = spec => {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return require(spec);
    const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(absolute), spec);
    const resolved = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!resolved) throw new Error('Cannot resolve ' + spec);
    return load(resolved);
  };
  new Function('exports', 'require', 'module', compiled.outputText)(module.exports, localRequire, module);
  return module.exports;
}

const { summarisePeriod, percentChange } = load('lib/dashboard/metrics.ts');
const order = { id: 'paid', total: 100, delivery_fee: 10, payment_status: 'paid', order_status: 'delivered' };
const cost = { id: 'paid', gross_profit: 80, cost_quality: 'snapshot' };
const inventory = [{ stock_quantity: 3, cost_price: 5 }];
const summary = summarisePeriod([order, { ...order, id: 'cancelled', order_status: 'cancelled' }, { ...order, id: 'unpaid', payment_status: 'pending', order_status: 'pending_payment' }], [cost], [{ amount_gross: 7 }], inventory);
assert.equal(summary.totalRevenue, 90, 'Unpaid/cancelled orders must not inflate sales');
assert.equal(summary.totalOrders, 1);
assert.equal(summary.pendingOrders, 1);
assert.equal(summary.actualGrossProfit, 80, 'Preserve existing Profit Analysis gross definition');
assert.equal(summary.netProfit, 73);
assert.equal(summary.totalInventoryValue, 15);
assert.equal(summarisePeriod([order], [{ ...cost, gross_profit: 0 }], [], inventory).actualGrossProfit, 0, 'A real zero is not replaced with a profit estimate');
assert.equal(summarisePeriod([order], [{ ...cost, cost_quality: 'missing' }], [], inventory).actualGrossProfit, null);
assert.equal(summarisePeriod([order], [], [], inventory).netProfit, null, 'Incomplete cost responses must not look like zero profit');
assert.equal(summarisePeriod([order], [{ ...cost, id: 'another-order' }], [], inventory).netProfit, null, 'Same-size cost responses must match the paid order IDs');
assert.equal(summarisePeriod([order], [{ ...cost, cost_quality: 'estimated_current' }], [], inventory).estimatedCosts, 1);
assert.equal(summarisePeriod([], [], [], [{ stock_quantity: 2, cost_price: null }]).totalInventoryValue, null);
assert.equal(percentChange(100, 0), null, 'Zero baseline has no defined percentage change');
assert.equal(percentChange(-50, -100), 50, 'Reduced losses should have positive arithmetic change');
assert.equal(percentChange(-150, -100), -50);

const { metricTotal, metricRate, metricGroups } = load('lib/dashboard/channelMetrics.ts');
assert.equal(metricTotal([], 'spend'), null, 'No import is unavailable, not measured zero');
assert.equal(metricTotal([{ spend: 0 }], 'spend'), 0, 'Retain an imported zero');
assert.equal(metricTotal([{ spend: 100 }, { spend: null }], 'spend'), null, 'Partial imported totals must not be published');
assert.equal(metricTotal([{ spend: 'bad' }], 'spend'), null);
assert.equal(metricTotal([{ spend: '25.50' }, { spend: -5.25 }], 'spend'), 20.25, 'GBP major units and signed corrections are retained');
assert.equal(metricRate(5, 0), null);
assert.equal(metricRate(null, 100), null);
assert.equal(metricRate(0, 100), 0);
assert.equal(metricRate(50, 25, 1), 2, 'ROAS is a multiple, not a percentage');
assert.deepEqual(metricGroups([{ source: 'Search', sessions: 10 }, { source: 'Search', sessions: 5 }, { source: 'Email', sessions: 3 }], 'source', 'sessions'), [{ label: 'Search', value: 15 }, { label: 'Email', value: 3 }]);
assert.equal(metricGroups([{ source: 'Search', sessions: 10 }, { source: 'Search', sessions: null }], 'source', 'sessions')[0].value, null);

const { readReportRows, loadDashboardReport } = load('lib/dashboard/reporting.ts');
await assert.rejects(() => loadDashboardReport({ timeRange: 'custom', customStartDate: '2026-09-01', customEndDate: null }), /Select both/);
const pages = [];
const rows = await readReportRows(() => ({ range: async (from, to) => { pages.push([from, to]); return { data: Array.from({ length: from === 0 ? 500 : 1 }, (_, i) => ({ id: from + i })), error: null }; } }), 'Test data');
assert.equal(rows.length, 501);
assert.deepEqual(pages, [[0, 499], [500, 999]]);
await assert.rejects(() => readReportRows(() => ({ range: async from => from === 0 ? { data: Array(500).fill({}), error: null } : { data: null, error: { message: 'Unavailable' } } }), 'Test data'), /could not be loaded/);

const Chart = load('components/TimeSeriesChart.tsx').default;
const { DonutChart, RatioRing, MetricBars } = load('components/dashboard/Charts.tsx');
for (const values of [[], [0], [23], [-10, 0, 20]]) {
  const html = renderToStaticMarkup(React.createElement(Chart, { series: [{ id: 'a', name: 'Store', color: '#67e8f9', data: values.map((value, i) => ({ date: '2026-09-' + String(i + 1).padStart(2, '0'), value })) }], timeRange: 'custom' }));
  assert.doesNotMatch(html, /NaN|Infinity/, 'Empty, single-day and negative charts must have finite geometry');
  if (values.length) assert.match(html, /View exact values/);
}
assert.match(renderToStaticMarkup(React.createElement(DonutChart, { data: [], label: 'Orders' })), /No records/);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(RatioRing, { value: null, label: 'Margin', detail: 'No denominator' })), /0%/);
assert.match(renderToStaticMarkup(React.createElement(MetricBars, { data: [{ label: 'Loss', value: -50 }, { label: 'Profit', value: 100 }] })), /Loss/);
const { GradientRing, HealthRadar, StoreScatter, WeeklyColumns, ActivityCalendar } = load('components/dashboard/ReferenceCharts.tsx');
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
assert.doesNotMatch(render(GradientRing, { value: null, label: 'Repeat', detail: 'No buyers', segmented: true }), /0\.0%/);
assert.match(render(GradientRing, { value: 0, label: 'Repeat', detail: 'No repeat orders' }), /0\.0%/);
assert.match(render(HealthRadar, { axes: [{ label: 'Paid', value: null }, { label: 'Costs', value: 90 }, { label: 'Stock', value: 50 }] }), /More data is needed/);
assert.match(render(StoreScatter, { stores: [{ id: 'missing', name: 'Incomplete store', revenue: 100, margin: null }] }), /excluded/);
assert.doesNotMatch(render(StoreScatter, { stores: [{ id: 'loss', name: 'Loss store', revenue: 100, margin: -25 }] }), /NaN|Infinity/);
assert.doesNotMatch(render(WeeklyColumns, { series: [{ id: 'a', name: 'Store', values: [{ date: '2026-09-01', value: -20 }] }], dates: ['2026-09-01'] }), /NaN|Infinity/);
const calendar = render(ActivityCalendar, { days: [{ date: '2026-09-02', count: 2, revenue: 100 }], start: '2026-09-02', end: '2026-09-05' });
assert.match(calendar, /2026-09-01: outside reporting period/);
assert.match(calendar, /2026-09-02: 2 paid orders/);
assert.match(calendar, /2026-09-05: 0 paid orders/);
assert.doesNotMatch(render(Chart, { compact: true, series: [{ id: 'one', name: 'One date', color: '#39e6ef', data: [{ date: '2026-09-01', value: 0 }] }], timeRange: 'custom' }), /NaN|Infinity/);
console.log('Dashboard reporting audit: PASS (paid-order eligibility, costs, missing data, comparison maths, pagination, and chart edge cases).');
