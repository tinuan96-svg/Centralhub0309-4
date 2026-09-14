'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { competitorService, Competitor } from '@/lib/services/competitorService';
import { formatCurrency } from '@/lib/utils/currency';

type CompetitorCell = {
  competitor_id?: string;
  market_key?: string | null;
  name?: string;
  price?: number | null;
  regular_price?: number | null;
  sale_price?: number | null;
  discount_percent?: number | null;
  stock_status?: string | null;
  match_status?: string | null;
  match_confidence?: number | null;
  valid_for_pricing?: boolean;
  authoritative_eligible?: boolean;
  data_quality_state?: string | null;
  scan_status?: string | null;
  last_scanned_at?: string | null;
  product_url?: string | null;
};

type MatrixRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  brand: string | null;
  category: string | null;
  variant_label: string | null;
  our_price: number | null;
  cost_price: number | null;
  competitor_cells: Record<string, CompetitorCell> | null;
  lowest_competitor_price: number | null;
  average_market_price: number | null;
  highest_competitor_price: number | null;
  valid_competitor_count: number | null;
  cheapest_competitor_name: string | null;
  gap_to_lowest: number | null;
  market_price_index: number | null;
  market_position: string | null;
};

type AIRun = {
  id: string;
  status: string;
  requested_by: string;
  products_analyzed: number;
  keep_count: number;
  reduce_count: number;
  increase_count: number;
  investigate_count: number;
  ai_reviewed_count: number;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, unknown> | null;
};

type AIReview = {
  id: string;
  run_id: string;
  product_id: string;
  action: 'KEEP' | 'REDUCE' | 'INCREASE' | 'INVESTIGATE';
  confidence: number;
  current_price: number | null;
  cost_price: number | null;
  profit_floor_price: number | null;
  lowest_competitor_price: number | null;
  median_market_price: number | null;
  average_market_price: number | null;
  highest_competitor_price: number | null;
  competitor_count: number;
  suggested_price: number | null;
  market_position: string | null;
  reason: string;
  risk_flags: string[] | null;
  competitor_data_age_hours: number | null;
  ai_used: boolean;
  review_status: string;
  pricing_suggestion_id: string | null;
  product?: { name?: string; brand?: string | null; sku?: string | null } | null;
};

const POSITION_LABELS: Record<string, string> = {
  WE_ARE_CHEAPEST: 'Cheapest',
  WITHIN_5_PERCENT: 'Within 5%',
  BELOW_MARKET_AVERAGE: 'Below market',
  ABOVE_MARKET: 'Above market',
  NO_VALID_DATA: 'No verified price',
};

const ACTION_STYLE: Record<string, string> = {
  KEEP: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  REDUCE: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
  INCREASE: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  INVESTIGATE: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
};

function priceStateLabel(cell?: CompetitorCell) {
  if (!cell) return 'no match';
  if (cell.valid_for_pricing) return 'verified';
  const state = String(cell.data_quality_state || '').toUpperCase();
  if (state === 'STALE') return 'stale';
  if (state === 'OUT_OF_STOCK') return 'out of stock';
  if (state === 'STOCK_UNKNOWN') return 'stock unknown';
  if (state === 'PENDING_MATCH') return 'review match';
  if (state === 'REVIEW_REQUIRED') return 'review required';
  if (state === 'UNNORMALIZED') return 'needs normalization';
  if (state === 'MULTIPACK_REVIEW') return 'pack review';
  if (cell.match_status === 'pending') return 'review match';
  if (cell.scan_status && cell.scan_status !== 'success') return cell.scan_status.replaceAll('_', ' ');
  if (cell.authoritative_eligible === false) return 'not pricing eligible';
  return cell.match_status || 'review';
}

function reviewProductName(row: AIReview) {
  const product = Array.isArray(row.product) ? row.product[0] : row.product;
  return product?.name || 'Product';
}

export default function CompetitorIntelligenceClient() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [latestRun, setLatestRun] = useState<AIRun | null>(null);
  const [aiReviews, setAiReviews] = useState<AIReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('ALL');
  const [brand, setBrand] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: matrix, error: matrixError }, allCompetitors, { data: runRows, error: runError }] = await Promise.all([
        supabase.from('competitor_price_matrix_v').select('*').order('product_name'),
        competitorService.getAllCompetitors(),
        supabase.from('competitor_ai_runs').select('*').order('started_at', { ascending: false }).limit(1),
      ]);
      if (matrixError) throw matrixError;
      if (runError) throw runError;

      const primary = (allCompetitors || [])
        .filter((c: any) => c.is_primary_market === true && c.is_active !== false)
        .sort((a: any, b: any) => Number(a.display_order || 999) - Number(b.display_order || 999));
      setCompetitors(primary);
      setRows((matrix || []) as MatrixRow[]);

      const run = (runRows?.[0] || null) as AIRun | null;
      setLatestRun(run);
      if (run?.id) {
        const { data: reviews, error: reviewError } = await supabase
          .from('competitor_ai_reviews')
          .select('id,run_id,product_id,action,confidence,current_price,cost_price,profit_floor_price,lowest_competitor_price,median_market_price,average_market_price,highest_competitor_price,competitor_count,suggested_price,market_position,reason,risk_flags,competitor_data_age_hours,ai_used,review_status,pricing_suggestion_id,product:products(name,brand,sku)')
          .eq('run_id', run.id)
          .order('confidence', { ascending: false })
          .limit(250);
        if (reviewError) throw reviewError;
        setAiReviews((reviews || []) as unknown as AIReview[]);
      } else {
        setAiReviews([]);
      }
    } catch (e: any) {
      console.error('Competitor intelligence load failed', e);
      setMessage(e?.message || 'Failed to load competitor intelligence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const scan = async (id: string) => {
    setScanning(id);
    setMessage(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Admin session expired. Please sign in again.');

      const { data: result, error: invokeError } = await supabase.functions.invoke('competitor-full-catalog-scan', {
        body: { competitor_id: id },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (invokeError) throw invokeError;
      if (!result?.success) throw new Error(result?.error || 'Full catalogue scan failed');
      setMessage(result.message || `Full catalogue scan completed: ${result.discovered || 0} discovered · ${result.exact_matches || 0} exact · ${result.review_matches || 0} review · ${result.price_rows_refreshed || 0} prices refreshed`);
      await load();
    } catch (e: any) {
      setMessage(e?.message || 'Full catalogue scan failed');
    } finally {
      setScanning(null);
    }
  };

  const runSupervisor = async () => {
    setAnalyzing(true);
    setMessage(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Admin session expired. Please sign in again.');
      const { data: result, error } = await supabase.functions.invoke('competitor-intelligence-agent', {
        body: { action: 'analyze', requested_by: 'competitor-intelligence-ui' },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (!result?.success) throw new Error(result?.error || 'Shruthi market analysis failed');
      setMessage(result.message || 'Shruthi market analysis completed. No prices were changed.');
      await load();
    } catch (e: any) {
      setMessage(e?.message || 'Shruthi market analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const promoteReview = async (review: AIReview) => {
    if (!['REDUCE', 'INCREASE'].includes(review.action) || review.suggested_price == null) return;
    setPromoting(review.id);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('promote_competitor_ai_review_to_pricing_approval', {
        p_review_id: review.id,
        p_requested_by: 'competitor-intelligence-ui',
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) throw new Error(error?.message || result?.error || 'Could not send recommendation to Pricing Approval Centre');
      const quality = result.execution_blocked ? ' It is visible there but blocked until the listed data-quality checks pass.' : ' It is ready for the normal approval checks.';
      setMessage(`${reviewProductName(review)} sent to Pricing Approval Centre. No price changed.${quality}`);
      await load();
    } catch (e: any) {
      setMessage(e?.message || 'Could not promote recommendation');
    } finally {
      setPromoting(null);
    }
  };

  const brands = useMemo(() => Array.from(new Set(rows.map(r => r.brand).filter(Boolean) as string[])).sort(), [rows]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(r => {
      const matchesSearch = !term || [r.product_name, r.sku, r.brand, r.category, r.variant_label].some(v => (v || '').toLowerCase().includes(term));
      const matchesPosition = position === 'ALL' || r.market_position === position;
      const matchesBrand = brand === 'ALL' || r.brand === brand;
      return matchesSearch && matchesPosition && matchesBrand;
    });
  }, [rows, search, position, brand]);

  const metrics = useMemo(() => {
    const withVerified = rows.filter(r => Number(r.valid_competitor_count || 0) > 0).length;
    const cheapest = rows.filter(r => r.market_position === 'WE_ARE_CHEAPEST').length;
    const above = rows.filter(r => r.market_position === 'ABOVE_MARKET').length;
    const within5 = rows.filter(r => r.market_position === 'WITHIN_5_PERCENT').length;
    return { monitored: rows.length, withVerified, cheapest, above, within5 };
  }, [rows]);

  const supervisorReviews = useMemo(() => {
    const rank: Record<string, number> = { REDUCE: 0, INCREASE: 1, INVESTIGATE: 2, KEEP: 3 };
    return [...aiReviews].sort((a, b) => (rank[a.action] ?? 9) - (rank[b.action] ?? 9) || Number(b.confidence) - Number(a.confidence));
  }, [aiReviews]);

  if (loading) return <div className="p-8 text-center text-slate-500 font-black uppercase tracking-widest">Loading competitor price matrix…</div>;

  return (
    <div className="p-4 sm:p-6 max-w-[1900px] mx-auto space-y-5">
      <header className="flex flex-col xl:flex-row xl:items-end gap-4 justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-400 font-black">Pricing → Competitor Intelligence</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Competitor Price Intelligence</h1>
          <p className="text-xs text-slate-500 mt-1">Deterministic catalogue discovery + strict brand/pack/type matching + Shruthi market supervision · no automatic price changes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {competitors.map((c: any) => (
            <button key={c.id} onClick={() => void scan(c.id)} disabled={scanning === c.id}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-black text-slate-200 hover:border-cyan-500 disabled:opacity-50">
              {scanning === c.id ? `Full scanning ${c.name}…` : `Scan ${c.name}`}
            </button>
          ))}
          <button onClick={() => void load()} className="rounded-xl bg-cyan-600 px-4 py-2 text-[11px] font-black text-white">Refresh Matrix</button>
        </div>
      </header>

      {message && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-200">{message}</div>}

      <section className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-slate-950 to-violet-500/5 p-4 sm:p-5 shadow-[0_20px_80px_rgba(0,0,0,.22)]">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-300">Shruthi Market Supervisor</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase text-amber-300">Dry Run</span>
              <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[9px] font-black uppercase text-rose-300">Auto-pricing OFF</span>
              <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 text-[9px] font-black uppercase text-slate-400">6-hour supervisor cycle</span>
            </div>
            <h2 className="mt-2 text-xl font-black text-white">AI supervises the verified market evidence — it does not replace the scanner.</h2>
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-400">The scanner remains the source of raw product, stock, pack-size and price facts. Shruthi checks market coverage, margin floors, outliers, promotions, shipping and ambiguous matches, then recommends Keep / Reduce / Increase / Investigate. A movement can only be sent to Pricing Approval Centre manually.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button onClick={() => void runSupervisor()} disabled={analyzing}
              className="rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">
              {analyzing ? 'Shruthi analysing…' : 'Analyse market now'}
            </button>
            <Link href="/pricing/approval" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-black text-white">Pricing Approval Centre →</Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            ['Reviewed', latestRun?.products_analyzed ?? 0, 'text-white'],
            ['Keep', latestRun?.keep_count ?? 0, 'text-emerald-300'],
            ['Reduce', latestRun?.reduce_count ?? 0, 'text-cyan-300'],
            ['Increase', latestRun?.increase_count ?? 0, 'text-violet-300'],
            ['Investigate', latestRun?.investigate_count ?? 0, 'text-amber-300'],
          ].map(([label, value, cls]) => (
            <div key={String(label)} className="rounded-2xl border border-white/5 bg-slate-950/60 p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`mt-1 text-xl font-black ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {latestRun && <div className="mt-3 text-[10px] text-slate-500">Last supervisor run: {new Date(latestRun.completed_at || latestRun.started_at).toLocaleString()} · {latestRun.ai_reviewed_count || 0} ambiguous cases received an additional AI safety review.</div>}

        <div className="mt-4 grid xl:grid-cols-2 gap-3">
          {supervisorReviews.slice(0, 12).map(review => {
            const movable = ['REDUCE', 'INCREASE'].includes(review.action) && review.suggested_price != null;
            return (
              <article key={review.id} className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${ACTION_STYLE[review.action]}`}>{review.action}</span>
                      <span className="text-[9px] font-black uppercase text-slate-500">{Math.round(Number(review.confidence || 0) * 100)}% confidence</span>
                      {review.ai_used && <span className="text-[9px] font-black uppercase text-violet-300">AI safety reviewed</span>}
                      {review.review_status === 'promoted' && <span className="text-[9px] font-black uppercase text-emerald-300">In Approval Centre</span>}
                    </div>
                    <h3 className="mt-2 font-black text-white">{reviewProductName(review)}</h3>
                  </div>
                  <div className="text-right text-[10px] text-slate-500">{review.competitor_count} verified<br />competitor{review.competitor_count === 1 ? '' : 's'}</div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-[9px] uppercase text-slate-600">Current</p><p className="font-black text-white">{review.current_price == null ? '—' : formatCurrency(Number(review.current_price))}</p></div>
                  <div><p className="text-[9px] uppercase text-slate-600">Market low</p><p className="font-black text-emerald-300">{review.lowest_competitor_price == null ? '—' : formatCurrency(Number(review.lowest_competitor_price))}</p></div>
                  <div><p className="text-[9px] uppercase text-slate-600">Suggested</p><p className="font-black text-cyan-300">{review.suggested_price == null ? '—' : formatCurrency(Number(review.suggested_price))}</p></div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-400">{review.reason}</p>
                {!!review.risk_flags?.length && <div className="mt-3 flex flex-wrap gap-1">{review.risk_flags.slice(0, 4).map(flag => <span key={flag} className="rounded-md border border-amber-500/15 bg-amber-500/5 px-1.5 py-1 text-[8px] font-bold uppercase text-amber-300/80">{flag.replaceAll('_', ' ')}</span>)}</div>}
                {movable && review.review_status === 'pending' && (
                  <button onClick={() => void promoteReview(review)} disabled={promoting === review.id}
                    className="mt-3 w-full rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-50">
                    {promoting === review.id ? 'Sending…' : 'Send to Pricing Approval Centre'}
                  </button>
                )}
              </article>
            );
          })}
          {!supervisorReviews.length && <div className="xl:col-span-2 rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">Run Shruthi market analysis to create the first supervised review set.</div>}
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {[
          ['Products monitored', metrics.monitored],
          ['With verified market price', metrics.withVerified],
          ['We are cheapest', metrics.cheapest],
          ['Within 5% of lowest', metrics.within5],
          ['Above market', metrics.above],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="p-3 border-b border-slate-800 flex flex-col lg:flex-row gap-2 lg:items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, SKU, brand, category or size…"
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
          <select value={brand} onChange={e => setBrand(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
            <option value="ALL">All brands</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={position} onChange={e => setPosition(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
            <option value="ALL">All positions</option>
            <option value="WE_ARE_CHEAPEST">We are cheapest</option>
            <option value="WITHIN_5_PERCENT">Within 5%</option>
            <option value="BELOW_MARKET_AVERAGE">Below market</option>
            <option value="ABOVE_MARKET">Above market</option>
            <option value="NO_VALID_DATA">No verified price</option>
          </select>
          <div className="px-2 text-[10px] font-black uppercase text-slate-500">{filtered.length} rows</div>
        </div>

        <div className="overflow-auto max-h-[72vh]">
          <table className="min-w-[1250px] w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-[9px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-950 p-3 text-left min-w-[300px]">Product</th>
                <th className="p-3 text-left min-w-[110px]">Variant</th>
                <th className="p-3 text-right min-w-[90px]">Ours</th>
                {competitors.map(c => <th key={c.id} className="p-3 text-right min-w-[120px]">{c.name}</th>)}
                <th className="p-3 text-right min-w-[95px]">Lowest</th>
                <th className="p-3 text-right min-w-[95px]">Avg</th>
                <th className="p-3 text-right min-w-[85px]">Index</th>
                <th className="p-3 text-left min-w-[120px]">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map(row => (
                <tr key={row.product_id} className="hover:bg-slate-800/30">
                  <td className="sticky left-0 z-[5] bg-slate-900 p-3">
                    <div className="font-bold text-white">{row.product_name}</div>
                    <div className="mt-1 flex gap-2 text-[9px] uppercase text-slate-500"><span>{row.brand || 'No brand'}</span><span>·</span><span>{row.category || 'No category'}</span>{row.sku && <><span>·</span><span>{row.sku}</span></>}</div>
                  </td>
                  <td className="p-3 text-slate-400">{row.variant_label || '—'}</td>
                  <td className="p-3 text-right font-black text-white">{row.our_price == null ? '—' : formatCurrency(Number(row.our_price))}</td>
                  {competitors.map(c => {
                    const cells = row.competitor_cells || {};
                    const cell = cells[c.id] || Object.values(cells).find(v => v.market_key && v.market_key === (c as any).market_key);
                    const valid = !!cell?.valid_for_pricing;
                    const price = cell?.price == null ? null : Number(cell.price);
                    const state = priceStateLabel(cell);
                    return (
                      <td key={c.id} className="p-3 text-right">
                        {price == null ? <span className="text-slate-700">—</span> : (
                          <div>
                            {cell?.product_url ? <a href={cell.product_url} target="_blank" rel="noreferrer" className={valid ? 'font-black text-cyan-300 hover:underline' : 'font-bold text-slate-500 hover:underline'}>{formatCurrency(price)}</a> : <span className={valid ? 'font-black text-cyan-300' : 'font-bold text-slate-500'}>{formatCurrency(price)}</span>}
                            <div className={`mt-1 text-[8px] uppercase ${valid ? 'text-emerald-400' : 'text-amber-500/80'}`}>{state}</div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-3 text-right font-black text-emerald-300">{row.lowest_competitor_price == null ? '—' : formatCurrency(Number(row.lowest_competitor_price))}</td>
                  <td className="p-3 text-right text-slate-300">{row.average_market_price == null ? '—' : formatCurrency(Number(row.average_market_price))}</td>
                  <td className="p-3 text-right font-bold text-slate-300">{row.market_price_index == null ? '—' : `${Number(row.market_price_index).toFixed(1)}`}</td>
                  <td className="p-3"><span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[9px] font-black uppercase text-slate-300">{POSITION_LABELS[row.market_position || ''] || row.market_position || '—'}</span></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={8 + competitors.length} className="p-12 text-center text-slate-500">No products match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid lg:grid-cols-4 gap-3">
        {competitors.map((c: any) => (
          <div key={c.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3"><p className="font-black text-white">{c.name}</p><span className="text-[9px] font-black uppercase text-slate-500">every {c.scan_frequency || '6 hours'}</span></div>
            <p className="mt-2 text-[10px] text-slate-500">Last successful scan</p>
            <p className="text-xs text-slate-300">{c.last_successful_scan_at ? new Date(c.last_successful_scan_at).toLocaleString() : 'Not yet verified'}</p>
            <p className="mt-2 text-[10px] uppercase font-black text-slate-600">{c.last_scan_status || 'waiting'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
