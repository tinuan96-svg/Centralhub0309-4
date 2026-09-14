import { createHash } from 'node:crypto';

type SupabaseLike = any;

type LearningTrack = {
  key: string;
  label: string;
  query: string;
};

type LearningInsight = {
  title: string;
  summary: string;
  why_it_matters?: string;
  recommended_action?: string;
  confidence?: number;
  impact?: 'low' | 'medium' | 'high' | 'critical';
  source_urls?: string[];
  tags?: string[];
};

const TRACKS: LearningTrack[] = [
  {
    key: 'seo_discovery',
    label: 'SEO & Discovery',
    query: 'Latest high-confidence SEO, Google Search, local search, ecommerce structured-data, AI-search and discoverability changes relevant to UK ecommerce and grocery retailers. Focus on changes from authoritative or primary sources and practical improvements that could help MalluSpices, KeralaGrocery, PocketGrocery or TamilRetail.',
  },
  {
    key: 'growth_merchandising',
    label: 'Growth & Merchandising',
    query: 'Recent ecommerce growth, conversion, retention, merchandising, pricing, loyalty, checkout, delivery and customer-experience practices relevant to UK online grocery and South Asian grocery retail. Prioritise evidence-backed changes that can be tested safely.',
  },
  {
    key: 'ai_technology',
    label: 'AI & Technology',
    query: 'Recent AI, automation, analytics, ecommerce, payments, customer-support, mobile, web-performance and developer-platform capabilities that could improve a multi-store UK ecommerce operation using Next.js, Supabase, Netlify, Android, WhatsApp and analytics. Prioritise official product/platform sources.',
  },
  {
    key: 'market_operations',
    label: 'Market & Operations',
    query: 'Recent UK ecommerce grocery, fulfilment, delivery, customer-experience, digital marketing, measurement and operational technology developments that could materially affect a Kerala/South-Indian grocery retailer. Avoid speculative noise and focus on actionable developments.',
  },
];

function outputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chunks: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

function annotationUrls(payload: any) {
  const urls = new Set<string>();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      for (const annotation of Array.isArray(part?.annotations) ? part.annotations : []) {
        const url = annotation?.url || annotation?.url_citation?.url;
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) urls.add(url);
      }
    }
  }
  return [...urls].slice(0, 30);
}

function safeJson(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(clean); } catch {}
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(clean.slice(first, last + 1)); } catch {}
  }
  return null;
}

function normaliseUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim());
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

function domainOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function clampConfidence(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.72;
  return Math.max(0, Math.min(1, n));
}

function fingerprint(track: string, title: string, summary: string) {
  return createHash('sha256').update(`${track}|${title.trim().toLowerCase()}|${summary.trim().toLowerCase().slice(0, 400)}`).digest('hex');
}

async function businessSnapshot(db: SupabaseLike) {
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const [storesRes, ordersRes, productsRes, knowledgeRes] = await Promise.all([
    db.from('stores').select('name,slug,domain').eq('visibility', true),
    db.from('orders').select('store_id,total,total_amount,total_revenue,gross_profit,order_profit,payment_status,created_at').gte('created_at', since30d).limit(1200),
    db.from('products').select('name,brand,category,stock,stock_status,is_active').eq('is_active', true).limit(1200),
    db.from('shruthi_project_knowledge').select('scope,topic,content,priority').eq('active', true).order('priority', { ascending: false }).limit(30),
  ]);

  const orders = ordersRes.data || [];
  const paid = orders.filter((row: any) => String(row.payment_status || '').toLowerCase() === 'paid');
  const totalOf = (row: any) => Number(row.total_revenue ?? row.total_amount ?? row.total ?? 0) || 0;
  const profitOf = (row: any) => Number(row.gross_profit ?? row.order_profit ?? 0) || 0;
  const products = productsRes.data || [];

  return {
    stores: storesRes.data || [],
    last30Days: {
      paidOrders: paid.length,
      revenue: Number(paid.reduce((n: number, row: any) => n + totalOf(row), 0).toFixed(2)),
      grossProfit: Number(paid.reduce((n: number, row: any) => n + profitOf(row), 0).toFixed(2)),
    },
    catalogue: {
      activeProducts: products.length,
      outOfStock: products.filter((p: any) => Number(p.stock ?? 0) <= 0 || String(p.stock_status).toLowerCase() === 'out_of_stock').length,
      lowStock: products.filter((p: any) => Number(p.stock ?? 0) > 0 && Number(p.stock ?? 0) <= 3).length,
      topCategories: Object.entries(products.reduce((acc: Record<string, number>, p: any) => {
        const key = String(p.category || 'Uncategorised');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 12),
    },
    operatingKnowledge: (knowledgeRes.data || []).map((row: any) => ({ scope: row.scope, topic: row.topic, content: row.content })),
  };
}

export async function runShruthiLearning(db: SupabaseLike, options: { source?: 'scheduled' | 'manual'; force?: boolean; track?: string } = {}) {
  const source = options.source || 'scheduled';
  const stateRes = await db.from('shruthi_learning_state').select('*').eq('id', 'primary').maybeSingle();
  const state = stateRes.data || { enabled: true, cadence_hours: 6, total_runs: 0 };
  if (!state.enabled && !options.force) return { success: true, skipped: true, reason: 'learning_paused' };

  const cadenceHours = Math.max(1, Number(state.cadence_hours || 6));
  const lastRun = state.last_run_at ? new Date(state.last_run_at).getTime() : 0;
  if (source === 'scheduled' && !options.force && lastRun && Date.now() - lastRun < cadenceHours * 3600000 * 0.8) {
    return { success: true, skipped: true, reason: 'cadence_guard' };
  }

  const selected = TRACKS.find((track) => track.key === options.track) || TRACKS[Math.max(0, Number(state.total_runs || 0)) % TRACKS.length];
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) throw new Error('OPENAI_API_KEY is not configured for Shruthi Learning.');
  const model = String(process.env.CENTRALHUB_LEARNING_MODEL || process.env.OPENAI_MODEL_FAST || 'gpt-5.6-luna').trim();
  const snapshot = await businessSnapshot(db);

  const { data: run, error: runError } = await db.from('shruthi_learning_runs').insert({
    source,
    track: selected.key,
    query: selected.query,
    model,
    status: 'running',
    metadata: { business_snapshot_at: new Date().toISOString() },
  }).select('id').single();
  if (runError || !run?.id) throw new Error(runError?.message || 'Could not create learning run.');

  await db.from('shruthi_learning_state').update({ current_track: selected.key, last_error: null, updated_at: new Date().toISOString() }).eq('id', 'primary');

  const prompt = `You are the continuous research engine for Shruthi, the executive AI business manager for a UK multi-store South-Indian/Kerala grocery ecommerce operation.\n\nResearch track: ${selected.label}\nResearch goal: ${selected.query}\n\nBusiness context:\n${JSON.stringify(snapshot)}\n\nUse web search. Prefer primary sources, official platform documentation, regulator/industry sources, and strong evidence. Prioritise developments from the last 90 days when the topic changes quickly. Do not repeat generic evergreen advice unless a current change makes it newly relevant. Never claim a change happened unless a source supports it. Ignore low-value SEO spam, affiliate listicles, copied news and unsupported social claims.\n\nReturn JSON only with this shape:\n{\"summary\":\"brief executive learning summary\",\"insights\":[{\"title\":\"short finding\",\"summary\":\"what changed or what was learned\",\"why_it_matters\":\"specific relevance to these stores\",\"recommended_action\":\"safe practical next step, not an automatic consequential action\",\"confidence\":0.0,\"impact\":\"low|medium|high|critical\",\"source_urls\":[\"https://...\"],\"tags\":[\"seo\",\"growth\"]}]}\n\nReturn 0-5 insights. It is better to return no insight than a weak or duplicated one.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: 'low' },
        tools: [{ type: 'web_search' }],
        input: prompt,
        max_output_tokens: 2200,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error?.code || `OpenAI research failed (${response.status})`);

    const text = outputText(payload);
    const parsed = safeJson(text) || { summary: text.slice(0, 1200), insights: [] };
    const fallbackUrls = annotationUrls(payload);
    const rawInsights = Array.isArray(parsed?.insights) ? parsed.insights.slice(0, 5) : [];
    const rows = rawInsights.map((item: LearningInsight) => {
      const title = String(item?.title || '').trim().slice(0, 240);
      const summary = String(item?.summary || '').trim().slice(0, 4000);
      if (!title || !summary) return null;
      const urls = [...new Set([...(Array.isArray(item.source_urls) ? item.source_urls : []), ...fallbackUrls].map(normaliseUrl).filter(Boolean) as string[])].slice(0, 12);
      const domains = [...new Set(urls.map(domainOf).filter(Boolean))];
      return {
        run_id: run.id,
        track: selected.key,
        title,
        summary,
        why_it_matters: String(item?.why_it_matters || '').trim().slice(0, 2500) || null,
        recommended_action: String(item?.recommended_action || '').trim().slice(0, 2500) || null,
        confidence: clampConfidence(item?.confidence),
        impact: ['low','medium','high','critical'].includes(String(item?.impact)) ? item.impact : 'medium',
        source_urls: urls,
        source_domains: domains,
        tags: [...new Set((Array.isArray(item?.tags) ? item.tags : []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 12),
        fingerprint: fingerprint(selected.key, title, summary),
        learned_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
        metadata: { model, source, research_track: selected.label },
      };
    }).filter(Boolean);

    let inserted = 0;
    for (const row of rows) {
      const result = await db.from('shruthi_learning_insights').upsert(row, { onConflict: 'fingerprint', ignoreDuplicates: true });
      if (!result.error) inserted += 1;
    }

    const summary = String(parsed?.summary || `Shruthi reviewed ${selected.label}.`).trim().slice(0, 4000);
    const completedAt = new Date().toISOString();
    const sourcesCount = new Set(rows.flatMap((row: any) => row.source_domains || [])).size;
    await db.from('shruthi_learning_runs').update({
      status: 'completed',
      summary,
      findings_count: rows.length,
      sources_count: sourcesCount,
      completed_at: completedAt,
      metadata: { business_snapshot_at: new Date().toISOString(), inserted_new: inserted, annotation_sources: fallbackUrls.length },
    }).eq('id', run.id);

    const countRes = await db.from('shruthi_learning_insights').select('id', { count: 'exact', head: true }).neq('status', 'dismissed');
    await db.from('shruthi_learning_state').update({
      current_track: selected.key,
      last_run_at: completedAt,
      next_run_at: new Date(Date.now() + cadenceHours * 3600000).toISOString(),
      latest_summary: summary,
      total_runs: Number(state.total_runs || 0) + 1,
      total_insights: countRes.count || 0,
      last_error: null,
      updated_at: completedAt,
    }).eq('id', 'primary');

    return { success: true, run_id: run.id, track: selected.key, summary, findings: rows.length, inserted, sources: sourcesCount, model };
  } catch (error: any) {
    const message = String(error?.message || 'Shruthi learning failed').slice(0, 2000);
    const completedAt = new Date().toISOString();
    await db.from('shruthi_learning_runs').update({ status: 'failed', error: message, completed_at: completedAt }).eq('id', run.id);
    await db.from('shruthi_learning_state').update({ last_error: message, next_run_at: new Date(Date.now() + Math.min(2, cadenceHours) * 3600000).toISOString(), updated_at: completedAt }).eq('id', 'primary');
    return { success: false, run_id: run.id, track: selected.key, error: message };
  }
}
