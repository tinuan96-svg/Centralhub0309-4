'use client';

import React, { useState } from 'react';
import {
  PageHeader,
  Card,
  StatGrid,
  StatCard,
  Badge,
  Button,
  designTokens,
  getBadgeClasses
} from '@/lib/design-system';

// Mock data
const MOCK_BUDGET = {
  total: 50000,
  spent: 32450,
  remaining: 17550,
  forecasted: 46800,
  burnRate: 1150, // per day
  daysLeft: 12,
  percentageSpent: 64.9,
};

const MOCK_CHANNELS = [
  { id: 1, name: 'Google Ads', allocated: 20000, spent: 14500, status: 'success', roas: 4.2, trend: '+12%' },
  { id: 2, name: 'Meta Ads', allocated: 15000, spent: 11200, status: 'warning', roas: 3.1, trend: '-5%' },
  { id: 3, name: 'TikTok Ads', allocated: 10000, spent: 4200, status: 'info', roas: 5.8, trend: '+24%' },
  { id: 4, name: 'LinkedIn Ads', allocated: 5000, spent: 2550, status: 'pending', roas: 2.4, trend: '0%' },
];

const MOCK_RULES = [
  { id: 1, title: 'Auto-increment budget if ROAS > 5x', enabled: true, description: 'Increases daily budget by 10% if ROAS is above 5 over the last 7 days.' },
  { id: 2, title: 'Pause campaign if CPA > £50', enabled: false, description: 'Automatically pause campaigns where the cost per acquisition exceeds £50.' },
  { id: 3, title: 'Weekend Performance Boost', enabled: true, description: 'Increase bids by 15% on Saturday and Sunday for top 3 ad sets.' },
  { id: 4, title: 'Budget Pacing Guardrail', enabled: true, description: 'Alert if daily spend is 20% higher than average pacing.' },
];

export default function BudgetsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [rules, setRules] = useState(MOCK_RULES);

  const toggleRule = (id: number) => {
    setRules(rules.map(rule =>
      rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <PageHeader
        title="Marketing Budget Manager"
        subtitle="Command center for cross-channel marketing spend and performance optimization."
      />

      {/* Main Stats */}
      <StatGrid columns={4}>
        <StatCard label="Total Monthly Budget" value={formatCurrency(MOCK_BUDGET.total)} icon="💰" />
        <StatCard label="Total Spent" value={formatCurrency(MOCK_BUDGET.spent)} icon="💸" />
        <StatCard label="Remaining Funds" value={formatCurrency(MOCK_BUDGET.remaining)} icon="🏦" />
        <StatCard label="Forecasted Total" value={formatCurrency(MOCK_BUDGET.forecasted)} icon="📊" />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Health & Channels */}
        <div className="lg:col-span-2 space-y-8">

          {/* Budget Health Bar */}
          <Card className="p-6 overflow-hidden relative">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Budget Health</h3>
                <p className="text-sm text-slate-400">Monthly spend vs allocation</p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-white">{MOCK_BUDGET.percentageSpent}%</span>
                <p className="text-xs text-slate-500 uppercase tracking-wider">of total budget used</p>
              </div>
            </div>

            <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-blue-500 transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                style={{ width: `${MOCK_BUDGET.percentageSpent}%` }}
              />
              <div
                className="h-full bg-blue-500/30 transition-all duration-1000 ease-out"
                style={{ width: `${(MOCK_BUDGET.forecasted - MOCK_BUDGET.spent) / MOCK_BUDGET.total * 100}%` }}
              />
            </div>

            <div className="mt-4 flex gap-6 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                <span className="text-slate-300">Spent: {formatCurrency(MOCK_BUDGET.spent)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500/30 rounded-sm"></div>
                <span className="text-slate-300">Forecasted: {formatCurrency(MOCK_BUDGET.forecasted)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-slate-800 rounded-sm"></div>
                <span className="text-slate-300">Remaining: {formatCurrency(MOCK_BUDGET.remaining)}</span>
              </div>
            </div>
          </Card>

          {/* Channel Allocation */}
          <Card className="p-0 overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Channel Allocation</h3>
              <Button variant="secondary" className="text-xs">Adjust Allocation</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-800">
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase">Channel</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase">Allocated</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase">Spent</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase text-center">ROAS</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {MOCK_CHANNELS.map((channel) => (
                    <tr key={channel.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{channel.name}</div>
                        <div className="text-xs text-green-500">{channel.trend} vs last month</div>
                      </td>
                      <td className="px-6 py-4 text-slate-300 font-mono">{formatCurrency(channel.allocated)}</td>
                      <td className="px-6 py-4 text-slate-300 font-mono">{formatCurrency(channel.spent)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-cyan-400">{channel.roas}x</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Badge variant={channel.status as any}>{channel.status.charAt(0).toUpperCase() + channel.status.slice(1)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column: Forecasting & Rules */}
        <div className="space-y-8">

          {/* Budget Forecasting */}
          <Card className="p-6 bg-blue-600/5 border-blue-500/20">
            <div className="flex items-center gap-2 mb-4 text-blue-400">
              <span className="text-xl">🔮</span>
              <h3 className="font-bold uppercase tracking-widest text-xs">Forecasting Engine</h3>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-slate-400 text-xs mb-1 uppercase">Daily Burn Rate</p>
                <div className="text-2xl font-bold text-white">{formatCurrency(MOCK_BUDGET.burnRate)} <span className="text-xs font-normal text-slate-500">/ day</span></div>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <p className="text-slate-400 text-xs mb-1 uppercase">Predicted Month End</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">{formatCurrency(MOCK_BUDGET.forecasted)}</span>
                  <span className="text-xs text-green-500">Under budget by {formatCurrency(MOCK_BUDGET.total - MOCK_BUDGET.forecasted)}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">AI Recommendation</p>
                <p className="text-xs text-slate-300">Based on current ROAS of 4.1x, you can increase TikTok budget by 15% without exceeding monthly limits.</p>
              </div>
            </div>
          </Card>

          {/* Smart Budget Rules */}
          <Card className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">Smart Rules</h3>
              <Badge variant="info">4 Active</Badge>
            </div>

            <div className="space-y-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border transition-all ${rule.enabled ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-900/20 border-slate-800 opacity-60'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className={`text-sm font-bold ${rule.enabled ? 'text-white' : 'text-slate-500'}`}>{rule.title}</h4>
                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${rule.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${rule.enabled ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{rule.description}</p>
                </div>
              ))}

              <Button variant="secondary" className="w-full text-xs py-3 border-dashed bg-transparent border-slate-700 hover:border-slate-500">
                + Create New Rule
              </Button>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
