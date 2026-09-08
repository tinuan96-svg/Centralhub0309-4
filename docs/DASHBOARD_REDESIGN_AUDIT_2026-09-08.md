# CentralHub dashboard redesign audit

Date: 8 September 2026. Canonical repository: `tinuan96-svg/Centralhub0309-4`, branch `main`.

## Scope and baseline

The request is to modernize the existing dashboard presentation and make charts and indicators appropriate to each section, while preserving operational functions, configuration and synchronization. The visual direction comes from the supplied dark navy, purple and cyan dashboard images and the [personal-finance dashboard reference](https://exceltable.com/en/templates/template-for-personal-finances-of-excel-dashboard-developer). Reference figures and decorative percentages were not used as business data.

The source audit began at commit `7faca94f695016e411059e352d805e6181e9cb9d`. The local source snapshot was verified against GitHub blob hashes. Concurrent changes through `f1e6bc7b32e8d023a32c65a4741f4eaacc73a6c2` were incorporated before final validation, including the latest marketing/OAuth changes. Those upstream changes did not overlap the redesign.

Reviewed areas include the root layout, mobile and desktop navigation, Fold breakpoints, design-system components, all overview widgets, dashboard filters, orders and fulfilment handlers, inventory summaries, Profit Analysis, finance performance, analytics, marketing provider metrics, customer-care reporting and integration health. The route audit inventories 127 App Router pages, guards 92 critical pages and checks 109 navigation targets against the full desktop/mobile catalog. The feature audit checks 63 files and 46 behavior groups.

Read-only database inspection checked actual columns and relationships for orders, order items, inventory, expenses, business targets, marketing metrics and connections, analytics configuration, conversations, messages and support tickets. No database changes were made.

## Findings and changes

| Area | Finding before redesign | Implemented behavior |
| --- | --- | --- |
| Layout and typography | Several dashboard labels were only 8–10px; large letter spacing and inconsistent card treatments reduced readability. | Shared navy surfaces, restrained cyan/violet accents, clear labels, tabular figures, consistent spacing and section accents. Existing Fold shell breakpoint remains 699/700px. |
| KPIs | Dynamically constructed Tailwind color names could be absent from generated CSS. Query failures could look like zero values. | Explicit color values and clear unavailable states. A genuine zero remains zero. |
| Reporting scope | Several overview graphs, cities and customer indicators ignored the selected store. | Overview charts derive from the same selected store and date range. Shared warehouse figures explicitly say all stores and current stock. |
| Profit quality | A legacy analytics method contains a 25% fallback, and some widgets presented estimates or gross figures as net profit. | The active overview uses the existing Profit Analysis resolver, requires matching paid-order cost coverage, labels estimates and suppresses incomplete profit figures. It explains the difference between order gross profit, the amount after paid expenses, and accounting profit. The legacy service itself is unchanged. |
| Time-series chart | Canvas rendering could divide by zero for one date, did not handle negative axes well and offered no exact-value table. | SVG chart supports empty, zero, single-date and negative data, series toggles, pointer inspection, keyboard date selection and an exact-value table. Small screens scroll within the chart instead of reducing labels to unreadable sizes. |
| Inventory indicators | A nonexistent `totalItems` property and fixed 85/15/5 percentages could misstate stock availability. | Measured counts of records above their threshold, low stock and zero/negative stock. Missing valuation costs produce an unavailable value. |
| Targets | UI queried names such as `metric_key` and `period_type`, absent from the actual schema. | Uses `target_type`, `target_value`, `period_start`, `period_end` and `name`. Progress requires matching store and full target dates. No invented target is displayed. |
| Communications | Fixed 65/45 percentages, a verification claim and a 240ms latency claim were not backed by readings. | Recorded conversation/ticket counts and today's inbound/outbound messages. Store scoping follows the message-to-conversation relationship. |
| Marketing | Overview divided stored major-unit currency amounts by 100 and displayed hardcoded live labels. | Uses imported GBP amounts as stored; ROAS and CTR require a denominator. Status comes from the canonical `marketing_connections` records used by Integrations. Attribution overlap and all-history scope are explicit. |
| Finance | Financial summary was harder to compare across periods. | Adds a comparison of existing RPC net-profit values; overlapping periods are explicitly non-additive. Existing calculations and finance controls remain intact. |
| Analytics | Trend and shopping-event information lacked appropriate graphical summaries. | Adds sessions/purchases trends and shopping-event bars using existing results, retaining tables and source queries. Event counts are not called a unique-user funnel. |
| Actions and messages | Some overview buttons were inert. | Existing operational actions remain wired to their services; informational widgets link to their working management pages. Saved AI proposals are reviewed through existing intelligence pages. |

Additional presentation-only changes cover customer lists, store cards, inventory, order lists, picking, packing, shipping and executive/finance panels. Shared cards and headers carry the design into sections already using the design system. Every individual page has not been independently redesigned.

## Metric definitions

| Indicator | Source and meaning |
| --- | --- |
| Product sales | Paid, non-deleted orders, excluding cancelled/refunded order states; sum of order total less delivery fee. |
| Paid orders | Count of those eligible orders created within the selected period. |
| Order gross profit | Existing `ProfitAnalysisService` output: order total less resolved product cost. Includes delivery charged; before shipping, packing, gateway fees and overhead. Missing or mismatched cost coverage suppresses the total. |
| After paid expenses | Order gross profit less paid expense invoice amounts in the same scope. This is not accounting net profit. Finance remains the accounting source. |
| Warehouse value | Current shared central inventory quantity multiplied by cost. Any nonzero stock with an absent or invalid cost makes valuation unavailable. |
| Repeat buyers | Customers identified by normalized email with more than one eligible paid order during the selected period, divided by identified buyers. Orders without email are excluded and counted separately. |
| Cost coverage | Paid orders with recorded order cost or complete item snapshots, divided by paid orders. Current-cost estimates are separately labeled. |
| Target progress | Actual metric divided by a positive saved target, only when store and full date period match. |
| Marketing ratios | Attributed provider revenue divided by spend; clicks divided by impressions. No denominator means unavailable. Provider attribution can overlap. |

Report readers paginate in batches of 500. Any page failure rejects that report rather than silently presenting a partial total. A 100,000-row safety ceiling asks for a narrower report. Profit resolution retains the existing service's behavior; incomplete returned coverage is exposed. Requests completed after a scope change cannot replace the active report. Report loading time is labeled as loading time, distinct from saved integration sync time.

## Live-data observations

The pre-change snapshot contained 484 orders, including 92 eligible paid orders, and 419 central inventory records: 107 zero/negative and 76 low-stock records. These are audit observations, not values embedded in the interface.

The health view was checked again at approximately 11:09 UTC on 8 September: all four stores remained registered; order-sync errors and product-sync errors were both zero. The canonical marketing connection table had no connection records. Existing health warnings reported no live marketing integrations and missing GA4 identifiers for four stores. The new UI exposes missing imported data; this visual change does not configure provider accounts. No active business targets were present during the audit.

## Preservation boundaries

No redesign changes were made to database migrations, RLS, SQL functions, edge functions, API endpoints, sync jobs, authentication, OAuth handlers, provider credentials, environment variables, deployment configuration, dependency versions or lockfiles. Order actions still use `useOrderActions`; picking, packing, shipping, payment, refund, print and inventory methods remain in their existing services. Navigation routes, permissions and mobile shell selection remain unchanged.

The redesign introduces read-only reporting helpers and replaces overview display calculations. That is the intended data-presentation scope; it does not alter transactional accounting or operational writes.

## Validation

Completed successfully before release:

- `npm run validate:production`: ESLint; route integrity; all 46 feature-continuity groups; runtime compatibility; order-sync contract; explicit TypeScript check; optimized production build; and smoke checks for 115 static frontend routes.
- `node scripts/dashboard-reporting-audit.mjs`: paid-order eligibility, zero and missing costs, matching cost IDs, inventory valuation, negative-baseline comparisons, invalid/incomplete custom periods, pagination and page errors, plus server-rendered empty/single-date/negative charts and unavailable ratios.
- `git diff --check`: no whitespace errors.
- Read-only live schema and health inspection; review of the change boundary against protected operational files.

The first local build attempt failed because a reused dependency directory was linked outside Turbopack's filesystem root. Copying the identical dependencies into the checkout resolved it without a configuration or lockfile change. The subsequent production validation passed.

The local build used the application's existing missing-environment fallback, so it is a compilation and route check, not an authenticated live-data session. Authenticated browser interaction and visual device testing were not performed. Post-push CI and hosting results are reported separately with the release.

## Reference-model refinement

Following the request to match the composition of `543701.png` more closely, the overview was rebuilt from baseline `535fa3738a603b04160ce1bb67d8073a09ebd25e`. The primary screen now uses a framed purple/navy console with compact navigation, a combined financial band and three gradient rings, payment-position dots, a two-series sales/gross-profit area chart beside an operating-ratio radar, a store sales/margin scatter plot, a segmented repeat-buyer gauge, grouped weekly columns and an order-activity calendar. Light and dark overview appearances mirror the two reference treatments; this preference is stored only on the current device.

The desktop composition becomes a readable stacked/grid layout on narrow and Fold screens. It does not reproduce the reference's payroll labels, sample figures, promotional copy or watermarks. Critical action messages remain outside the expandable detailed reports. Existing KPI comparisons, stock breakdowns, targets, communications, integration health, AI insights and audit information remain available in that detailed section. Existing Products, Orders, Packing and Shipping view handlers are unchanged.

All new visuals derive from the already-loaded dashboard report; this refinement adds no database queries, transactional changes, synchronization changes or configuration changes. Zero denominators remain unavailable. Radar axes have explicit percentage definitions rather than an invented composite score. The store scatter excludes missing-cost stores and labels current-cost estimates. The calendar disables days outside the selected period, and the weekly chart uses the final seven available calendar days of that period. Sales exclude delivery; the gross-profit series retains the existing inclusion of delivery charged and exclusion of operating fees.

Production validation passed again: lint, route/feature/runtime/order-sync audits, TypeScript, production build and 115 static-route smoke checks. The reporting audit additionally covers unavailable and genuine-zero gradient gauges, incomplete radar data, negative store margins and daily values, calendar date boundaries and a single-day compact chart. No browser screenshot comparison or authenticated visual-device test was performed; an exact pixel match is not asserted.

## Consolidating the red-marked dashboard area

The next refinement starts from `0208dacd6e20f795c6f1f48333d08e160ece87e1`, including the concurrent financial-planning release. Its nine added/changed files were restored and verified against remote Git blob hashes before this work. The planning page, navigation entries, migration and edge function are preserved.

The marked screenshot showed the oversized financial introduction, reconciliation banner and duplicate CentralHub navigation above the actual charts. The dashboard now opens with one compact visual console. Its toolbar retains store/date/comparison filters, refresh, CSV export and the existing device-local light/dark preference. The reference-model financial band, rings, position dots, trend/radar combination, profitability scatter, repeat-buyer gauge, weekly columns and calendar appear immediately after the toolbar.

KPI comparisons and section visuals are directly below those primary charts in the same console, with no collapsed report hiding them. Large action messages, definitions, AI insights, audit information and operational navigation sit outside and below the visual frame. Existing Products, Orders, Packing and Shipping tabs remain available, along with P&L, bank reconciliation, payables and planning links. StoreChat is rendered once from the dashboard wrapper. The four operational tab implementations, order-action bindings, print callbacks and order-detail bindings are unchanged byte-for-byte against this refinement's baseline. The global header, sidebar and their synchronization controls are unchanged.

| Visual module | Reporting boundary |
| --- | --- |
| Sales, products, orders, payments, fulfilment, stores, delivery locations, customer ratios and cost quality | The existing selected-store/date dashboard report. Cost coverage, estimated costs and excluded buyer identities retain their definitions. |
| Stock availability and warehouse value | Current shared warehouse records, explicitly labeled all stores. |
| Accounting finance | The existing `get_financial_performance` seven-day RPC and its revenue, net-profit, profit-per-order and closing-cash outputs. The selected sales period does not redefine accounting results. |
| Bank reconciliation | Current `v_bank_reconciliation_summary`, including reconciled/total rate, unreconciled count, outstanding value and older-than-today count. |
| Targets | Existing active targets. A progress percentage requires matching store, complete period and positive target. |
| Customer communications | Existing current conversation state plus today's inbound/outbound messages and ticket resolutions, using the selected store. |
| Integration health | Existing saved service checks across stores. The percentage is explicitly healthy checks divided by available checks; timestamps and issue counts remain visible. |
| Website activity, traffic sources and shopping events | Imported `analytics_daily_metrics` for the selected store and dates. Sessions are counts; shopping events are not unique-user funnel stages. |
| Advertising return, rates and provider spend | Imported `marketing_metrics` for the selected store and dates. Stored GBP major units are preserved. ROAS is a multiple; CTR and conversions/clicks are ratios with valid denominators. Provider attribution may overlap. |
| Marketing reserve | The existing shared `v_marketing_reserve_dashboard`; current available funds, this month's allocations and spending to date are labeled separately. |

The website and advertising summaries use read-only paginated queries against existing imported tables. They do not trigger provider imports or change integration settings. Finance and bank failures are handled independently; imported metrics also have independent loading/failure states. Missing imports, incomplete totals and absent denominators are not converted to measured zero. Signed corrections and all-zero imported distributions use bars because a composition ring cannot represent those cases accurately. Requests completed after a scope change cannot overwrite the active channel summary.

Read-only schema inspection verified the selected table/view columns. The accounting RPC values matched the financial figures in the supplied screenshot. Analytics records were present; advertising imports were absent at the time of inspection. Those observations are not hardcoded into the UI.

The composition uses a single column below 700px, a two-column arrangement from 700px, and a wider reference grid from 1150px. Secondary visuals expand to three/four columns as space allows. The application's existing 699/700px shell breakpoint is preserved. The console can continue vertically so charts remain readable rather than forcing every section into a single fixed-height image.

Validation for this refinement includes the production gate (128 pages, 93 critical routes, 110 navigation targets, 67 feature files, all 46 behavior groups, order-sync contract, TypeScript, production build and 116 static-route smoke checks), the reporting audit and whitespace review. Imported-metric audit cases cover missing/partial values, real zeros, signed GBP corrections, grouping and ROAS units. No transactional services, auth, configuration, dependencies, database objects or sync methods were changed. Local build checks still use the existing missing-environment fallback; they do not establish authenticated browser behavior or an exact screenshot match.
