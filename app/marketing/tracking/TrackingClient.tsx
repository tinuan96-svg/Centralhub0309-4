'use client';

import React, { useState, useEffect } from 'react';
import {
  PageHeader,
  Card,
  StatGrid,
  StatCard,
  Badge,
  Button,
  designTokens,
  getCardClasses,
  getBadgeClasses,
  getInputClasses,
  getTableRowClasses,
  getTableCellClasses
} from '@/lib/design-system';

const TRACKING_TOOLS = [
  { name: 'Meta Pixel', status: 'Active', type: 'Browser', lastEvent: '1 min ago', score: '9.2/10' },
  { name: 'Meta Conversions API', status: 'Active', type: 'Server', lastEvent: '30s ago', score: '9.8/10' },
  { name: 'Google Tag', status: 'Active', type: 'Browser', lastEvent: '5 mins ago', score: '8.5/10' },
  { name: 'Google Ads Conversion', status: 'Active', type: 'Server', lastEvent: '12 mins ago', score: '9.0/10' },
  { name: 'Google Enhanced Conversion', status: 'Active', type: 'Server', lastEvent: '12 mins ago', score: '9.5/10' },
  { name: 'GA4', status: 'Active', type: 'Hybrid', lastEvent: '2 mins ago', score: '8.8/10' },
  { name: 'TikTok Pixel', status: 'Inactive', type: 'Browser', lastEvent: '2 days ago', score: 'N/A' },
  { name: 'Pinterest Tag', status: 'Active', type: 'Browser', lastEvent: '45 mins ago', score: '7.2/10' },
  { name: 'LinkedIn Insight Tag', status: 'Active', type: 'Browser', lastEvent: '1 hour ago', score: '7.5/10' },
  { name: 'Snap Pixel', status: 'Inactive', type: 'Browser', lastEvent: 'Never', score: 'N/A' },
];

const MOCK_EVENTS = [
  { id: 1, event: 'purchase', platform: 'Meta CAPI', time: '2 mins ago', value: '$124.50', status: 'Success' },
  { id: 2, event: 'add_to_cart', platform: 'GA4', time: '5 mins ago', value: '$45.00', status: 'Success' },
  { id: 3, event: 'view_item', platform: 'TikTok Pixel', time: '12 mins ago', value: '-', status: 'Pending' },
  { id: 4, event: 'initiate_checkout', platform: 'Meta CAPI', time: '15 mins ago', value: '$89.00', status: 'Success' },
  { id: 5, event: 'purchase', platform: 'Google Ads', time: '18 mins ago', value: '$210.00', status: 'Success' },
];

export default function TrackingClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [utm, setUtm] = useState({
    url: '',
    source: '',
    medium: '',
    campaign: '',
    content: '',
    term: ''
  });

  const [generatedUrl, setGeneratedUrl] = useState('');

  useEffect(() => {
    if (!utm.url) {
      setGeneratedUrl('');
      return;
    }

    try {
      const urlObj = new URL(utm.url.startsWith('http') ? utm.url : `https://${utm.url}`);
      if (utm.source) urlObj.searchParams.set('utm_source', utm.source);
      if (utm.medium) urlObj.searchParams.set('utm_medium', utm.medium);
      if (utm.campaign) urlObj.searchParams.set('utm_campaign', utm.campaign);
      if (utm.content) urlObj.searchParams.set('utm_content', utm.content);
      if (utm.term) urlObj.searchParams.set('utm_term', utm.term);
      setGeneratedUrl(urlObj.toString());
    } catch (e) {
      setGeneratedUrl('Invalid URL');
    }
  }, [utm]);

  return (
    <div className="p-6 space-y-8 bg-[#0D1117] min-h-screen text-slate-300">
      <PageHeader
        title="TRACKING HEALTH CENTER"
        subtitle="Real-time monitoring and diagnostic dashboard for your marketing data signals."
      />

      <StatGrid columns={4}>
        <StatCard label="SIGNAL STRENGTH" value="94%" icon="📡" />
        <StatCard label="CAPI MATCH RATE" value="98.2%" icon="🔗" />
        <StatCard label="DATA DISCREPANCY" value="1.4%" icon="⚖️" />
        <StatCard label="ACTIVE CHANNELS" value="8/10" icon="🔌" />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tracking Status Table */}
        <Card className="lg:col-span-2 overflow-hidden border-slate-800 bg-slate-900/40 backdrop-blur-md">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-black/20">
            <h3 className="text-sm font-black uppercase tracking-tighter text-cyan-400">TRACKING ENGINE STATUS</h3>
            <Badge variant="success">ALL SYSTEMS GO</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-black/40">
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Tool Name</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Status</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Type</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Last Event</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {TRACKING_TOOLS.map((tool) => (
                  <tr key={tool.name} className="hover:bg-cyan-500/5 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-white tracking-tight">{tool.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${tool.status === 'Active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                        <span className={`text-xs font-medium ${tool.status === 'Active' ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {tool.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded border border-slate-700 bg-slate-800/50 text-slate-400 uppercase">
                        {tool.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-400 font-mono">{tool.lastEvent}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold ${parseFloat(tool.score) > 9 ? 'text-cyan-400' : 'text-slate-400'}`}>
                        {tool.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Server-Side Event Log */}
        <div className="space-y-8">
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md">
            <div className="p-4 border-b border-slate-800 bg-black/20">
              <h3 className="text-sm font-black uppercase tracking-tighter text-purple-400">LIVE SERVER EVENT LOG</h3>
            </div>
            <div className="p-4 space-y-4">
              {MOCK_EVENTS.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-slate-800/50 group hover:border-purple-500/30 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-xs font-black uppercase text-white tracking-tight">{event.event}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{event.platform} • {event.time}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-purple-400">{event.value}</div>
                    <div className="text-[9px] font-black text-emerald-500 uppercase">{event.status}</div>
                  </div>
                </div>
              ))}
              <Button variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-purple-400">
                View Full Trace Log
              </Button>
            </div>
          </Card>

          {/* UTM Builder Utility */}
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md">
            <div className="p-4 border-b border-slate-800 bg-black/20">
              <h3 className="text-sm font-black uppercase tracking-tighter text-amber-400">UTM CAMPAIGN ARCHITECT</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Destination</label>
                <input
                  type="text"
                  placeholder="example.com/product"
                  className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-amber-500/50 outline-none transition-colors"
                  value={utm.url}
                  onChange={(e) => setUtm({...utm, url: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Source</label>
                  <input
                    type="text"
                    placeholder="facebook"
                    className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-amber-500/50 outline-none"
                    value={utm.source}
                    onChange={(e) => setUtm({...utm, source: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Medium</label>
                  <input
                    type="text"
                    placeholder="paid_social"
                    className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-amber-500/50 outline-none"
                    value={utm.medium}
                    onChange={(e) => setUtm({...utm, medium: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Campaign Name</label>
                <input
                  type="text"
                  placeholder="summer_sale_2024"
                  className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-amber-500/50 outline-none"
                  value={utm.campaign}
                  onChange={(e) => setUtm({...utm, campaign: e.target.value})}
                />
              </div>

              {generatedUrl && (
                <div className="mt-6 p-3 rounded bg-black border border-amber-500/20">
                  <label className="text-[9px] font-black text-amber-500 uppercase mb-2 block tracking-widest">Generated Link</label>
                  <p className="text-[10px] font-mono break-all text-slate-300 mb-3">{generatedUrl}</p>
                  <Button
                    className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-black uppercase py-1 hover:bg-amber-500/20"
                    onClick={() => navigator.clipboard.writeText(generatedUrl)}
                  >
                    Copy to Clipboard
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
