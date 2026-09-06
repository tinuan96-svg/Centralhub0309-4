'use client';

import React, { useState } from 'react';
import { PageHeader, Card, StatGrid, StatCard, Badge, SectionHeader } from '@/lib/design-system';

// Mock Data for demonstration
const TYPICAL_PATH = [
  { name: 'Google Ad', icon: '🔍', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { name: 'Website', icon: '🌐', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  { name: 'Instagram', icon: '📸', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  { name: 'WhatsApp', icon: '💬', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { name: 'Purchase', icon: '💰', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
];

const ATTRIBUTION_DATA = [
  { channel: 'Google Search', lastClick: 45, firstClick: 30, linear: 38 },
  { channel: 'Instagram Ads', lastClick: 20, firstClick: 40, linear: 30 },
  { channel: 'Email Marketing', lastClick: 25, firstClick: 10, linear: 18 },
  { channel: 'Direct / Organic', lastClick: 10, firstClick: 20, linear: 14 },
];

const TOUCHPOINT_PERFORMANCE = [
  { channel: 'Google Ad', assisted: 142, direct: 84, revenue: '£12,450' },
  { channel: 'Instagram', assisted: 210, direct: 42, revenue: '£8,920' },
  { channel: 'Facebook', assisted: 98, direct: 35, revenue: '£5,600' },
  { channel: 'WhatsApp', assisted: 156, direct: 120, revenue: '£18,200' },
  { channel: 'Email', assisted: 45, direct: 68, revenue: '£9,400' },
];

const RECENT_JOURNEYS = [
  { id: '1', customer: 'John Doe', amount: '£249.00', date: '2 mins ago', sequence: ['Google Ad', 'Website', 'Instagram', 'WhatsApp', 'Purchase'] },
  { id: '2', customer: 'Jane Smith', amount: '£120.00', date: '15 mins ago', sequence: ['Email', 'Website', 'Purchase'] },
  { id: '3', customer: 'Mike Ross', amount: '£580.00', date: '1 hour ago', sequence: ['Instagram', 'Website', 'WhatsApp', 'Purchase'] },
  { id: '4', customer: 'Rachel Zane', amount: '£95.00', date: '3 hours ago', sequence: ['Google Ad', 'Purchase'] },
];

export default function CustomerJourneyClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedModel, setSelectedModel] = useState<'lastClick' | 'firstClick' | 'linear'>('lastClick');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Customer Journey & Attribution"
        subtitle="Analyze multi-touch conversion paths and understand channel contribution."
      />

      <StatGrid columns={4}>
        <StatCard label="Total Conversions" value="1,284" icon="📊" trend="+12% vs last month" />
        <StatCard label="Avg. Touchpoints" value="4.2" icon="📈" trend="-0.5 from last month" />
        <StatCard label="Assisted Revenue" value="£84,250" icon="✨" trend="+18% vs last month" />
        <StatCard label="Top Channel" value="WhatsApp" icon="🎯" />
      </StatGrid>

      {/* 1. Journey Path Visualization */}
      <Card className="p-6 bg-slate-900/50 border-slate-800">
        <SectionHeader title="Typical Multi-Touch Path" />
        <div className="mt-8 flex items-center justify-between overflow-x-auto pb-4 px-4">
          {TYPICAL_PATH.map((step, index) => (
            <React.Fragment key={step.name}>
              <div className="flex flex-col items-center space-y-3 min-w-[120px]">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl border-2 ${step.color} shadow-lg shadow-black/20`}>
                  {step.icon}
                </div>
                <span className="text-sm font-medium text-slate-300">{step.name}</span>
              </div>
              {index < TYPICAL_PATH.length - 1 && (
                <div className="flex-1 min-w-[40px] h-[2px] bg-slate-800 mx-4 relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 border-slate-700 rotate-45" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2. Attribution Model Comparison */}
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <SectionHeader title="Attribution Comparison" />
            <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700">
              {(['lastClick', 'firstClick', 'linear'] as const).map((model) => (
                <button
                  key={model}
                  onClick={() => setSelectedModel(model)}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${
                    selectedModel === model ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {model === 'lastClick' ? 'Last' : model === 'firstClick' ? 'First' : 'Linear'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6 mt-4">
            {ATTRIBUTION_DATA.map((item) => {
              const value = item[selectedModel];
              return (
                <div key={item.channel} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{item.channel}</span>
                    <span className="text-white font-mono">{value}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 3. Touchpoint Analysis */}
        <Card className="p-6 bg-slate-900/50 border-slate-800 overflow-hidden">
          <SectionHeader title="Touchpoint Performance" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="pb-3 font-semibold text-slate-400">Channel</th>
                  <th className="pb-3 font-semibold text-slate-400 text-right">Assisted</th>
                  <th className="pb-3 font-semibold text-slate-400 text-right">Direct</th>
                  <th className="pb-3 font-semibold text-slate-400 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {TOUCHPOINT_PERFORMANCE.map((row) => (
                  <tr key={row.channel} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 text-white font-medium">{row.channel}</td>
                    <td className="py-3 text-right text-indigo-400">{row.assisted}</td>
                    <td className="py-3 text-right text-emerald-400">{row.direct}</td>
                    <td className="py-3 text-right font-mono text-slate-300">{row.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 4. Recent Conversion Journeys */}
      <Card className="p-6 bg-slate-900/50 border-slate-800">
        <SectionHeader title="Recent Conversion Journeys" />
        <div className="mt-6 space-y-4">
          {RECENT_JOURNEYS.map((journey) => (
            <div key={journey.id} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20">
                  {journey.customer[0]}
                </div>
                <div>
                  <div className="text-white font-medium">{journey.customer}</div>
                  <div className="text-xs text-slate-500">{journey.date} • <span className="text-indigo-400">{journey.amount}</span></div>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto py-2">
                {journey.sequence.map((step, i) => (
                  <React.Fragment key={i}>
                    <Badge variant={step === 'Purchase' ? 'success' : 'info'} className="whitespace-nowrap">
                      {step}
                    </Badge>
                    {i < journey.sequence.length - 1 && (
                      <span className="text-slate-600">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
