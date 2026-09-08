'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

type Outbound = { id: string; status?: string | null; delivered_at?: string | null; read_at?: string | null; failed_at?: string | null; created_at?: string | null };
type Campaign = { id: string; name: string; status: string; provider_id: string; created_at?: string | null };

export default function WhatsAppMarketing() {
  const { selectedStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [outbound, setOutbound] = useState<Outbound[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contactCount, setContactCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let outboundQuery = supabase.from('whatsapp_outbound_log').select('id,status,delivered_at,read_at,failed_at,created_at').order('created_at', { ascending: false }).limit(5000);
      let contactsQuery = supabase.from('whatsapp_contacts').select('id');
      let campaignsQuery = supabase.from('marketing_campaigns').select('id,name,status,provider_id,created_at').eq('provider_id', 'whatsapp').order('created_at', { ascending: false }).limit(20);
      if (selectedStore?.id) { outboundQuery = outboundQuery.eq('store_id', selectedStore.id); contactsQuery = contactsQuery.eq('store_id', selectedStore.id); campaignsQuery = campaignsQuery.eq('store_id', selectedStore.id); }
      const [outboundResult, contactsResult, campaignsResult] = await Promise.all([outboundQuery, contactsQuery, campaignsQuery]);
      if (outboundResult.error) throw outboundResult.error;
      if (contactsResult.error) throw contactsResult.error;
      if (campaignsResult.error) throw campaignsResult.error;
      setOutbound(outboundResult.data || []); setContactCount((contactsResult.data || []).length); setCampaigns(campaignsResult.data || []);
    } catch (err: any) { setError(err?.message || 'Could not load live WhatsApp marketing data.'); }
    finally { setLoading(false); }
  }, [selectedStore?.id]);

  useEffect(() => { void load(); }, [load]);

  const delivered = outbound.filter(item => item.delivered_at || ['delivered', 'read'].includes(String(item.status || '').toLowerCase())).length;
  const read = outbound.filter(item => item.read_at || String(item.status || '').toLowerCase() === 'read').length;
  const deliveryRate = outbound.length ? `${((delivered / outbound.length) * 100).toFixed(1)}%` : '—';
  const readRate = outbound.length ? `${((read / outbound.length) * 100).toFixed(1)}%` : '—';

  return <div className="p-6 space-y-6 max-w-7xl mx-auto text-white">
    <div className="flex flex-wrap justify-between items-start gap-4"><PageHeader title="WhatsApp Marketing" subtitle="Live outbound delivery data and store-scoped campaign records." /><div className="flex gap-2"><Link href="/marketing/campaigns"><Button>New WhatsApp Campaign</Button></Link><button onClick={() => void load()} className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900">Refresh</button></div></div>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Outbound messages" value={loading ? '…' : outbound.length.toLocaleString('en-GB')} /><Stat label="Delivery rate" value={deliveryRate} /><Stat label="Read rate" value={readRate} /><Stat label="Tracked revenue" value="Not available" /></div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 space-y-6"><Card className="p-6 bg-slate-900/50 border-slate-800"><div className="flex items-center justify-between gap-3 mb-4"><h3 className="text-lg font-bold">Recent WhatsApp Campaigns</h3><Link href="/marketing/campaigns" className="text-xs text-cyan-400">Open Campaign Manager</Link></div>{loading ? <div className="p-10 text-center text-slate-400">Loading…</div> : campaigns.length === 0 ? <Empty text="No WhatsApp campaign records have been created for this scope." /> : <div className="space-y-2">{campaigns.map(c => <div key={c.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div><div className="font-bold">{c.name}</div><div className="text-xs text-slate-500">{c.status}</div></div><div className="text-xs text-slate-500">{c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '—'}</div></div>)}</div>}</Card><Card className="p-6 bg-slate-900/50 border-slate-800"><h3 className="text-lg font-bold mb-2">Approved Templates</h3><p className="text-sm text-slate-400 mb-5">Use the existing Customer Care template management flow for WhatsApp-approved content.</p><Link href="/customer-care/templates"><Button variant="secondary">Manage Templates</Button></Link></Card></div><div className="space-y-6"><Card className="p-6 bg-slate-900/50 border-slate-800"><h3 className="text-lg font-bold mb-4">Reachability</h3><div className="space-y-4 text-sm"><Row label="Reachable contacts" value={contactCount === null ? '—' : contactCount.toLocaleString('en-GB')} /><Row label="Marketing opt-ins" value="Not tracked" /><Row label="Unsubscribe rate" value="Not tracked" /></div><p className="mt-5 pt-5 border-t border-slate-800 text-xs text-slate-500">The current WhatsApp contact schema does not store opt-in or unsubscribe fields, so these values are intentionally not inferred.</p><Link href="/customers" className="block mt-5"><Button variant="ghost" className="w-full border border-slate-700">View Subscribers</Button></Link></Card><div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl"><h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Compliance Note</h4><p className="text-[10px] text-slate-400 leading-relaxed">Ensure promotional messages follow WhatsApp Business Policies and that consent is recorded in the operational customer workflow.</p></div></div></div>
  </div>;
}

function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500 uppercase">{label}</div><div className="text-xl font-black mt-1">{value}</div></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><span className="text-slate-400">{label}</span><span className="font-bold text-white">{value}</span></div>; }
function Empty({ text }: { text: string }) { return <div className="p-10 text-center text-slate-500 italic border border-dashed border-slate-800 rounded-2xl">{text}</div>; }
