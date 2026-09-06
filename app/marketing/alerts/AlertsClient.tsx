'use client';

import React from 'react';
import {
  PageHeader,
  Card,
  StatGrid,
  StatCard,
  Badge,
  Button,
  SectionHeader,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/lib/design-system';
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ShieldAlert,
  Package,
  Wallet,
  Mail,
  MessageSquare,
  Smartphone,
  AppWindow,
  ArrowRight,
  Plus,
  Settings,
  MoreVertical
} from 'lucide-react';

const mockAlerts = [
  {
    id: '1',
    title: 'Meta ROAS dropped 34%',
    description: 'Average ROAS for Meta campaigns has fallen below the target threshold of 2.5 in the last 24 hours.',
    severity: 'danger',
    timestamp: '2 hours ago',
    category: 'Performance'
  },
  {
    id: '2',
    title: '18 Google products rejected',
    description: 'Merchant Center detected policy violations in your feed. Update landing pages to resolve.',
    severity: 'warning',
    timestamp: '5 hours ago',
    category: 'Inventory'
  },
  {
    id: '3',
    title: 'Token expires in 5 days',
    description: 'The API connection for TikTok Ads will expire soon. Re-authenticate to prevent data loss.',
    severity: 'warning',
    timestamp: '1 day ago',
    category: 'System'
  },
  {
    id: '4',
    title: 'Snapchat Pixel firing correctly',
    description: 'All pixel events are being recorded with 98% match rate. Performance is within healthy range.',
    severity: 'success',
    timestamp: '2 days ago',
    category: 'Tracking'
  }
];

const automationTemplates = [
  {
    title: 'ROAS Guard',
    description: 'IF ROAS < X AND Spend > Y THEN Notify Admin',
    icon: <ShieldAlert className="w-6 h-6 text-red-500" />,
    setup: 'Protect your margins by getting notified when campaigns underperform at scale.'
  },
  {
    title: 'Inventory Sync',
    description: 'IF Stock < Threshold THEN Exclude from Campaign',
    icon: <Package className="w-6 h-6 text-blue-500" />,
    setup: 'Automatically pause ads for low-stock items to prevent wasted spend on OOS products.'
  },
  {
    title: 'Budget Watchdog',
    description: 'IF Daily Spend > Limit THEN Pause Campaign',
    icon: <Wallet className="w-6 h-6 text-amber-500" />,
    setup: 'Stay within your monthly budget by setting hard caps on daily campaign spend.'
  }
];

const channels = [
  { name: 'Email Notifications', icon: <Mail className="w-5 h-5" />, enabled: true, description: 'Daily summaries and critical alerts' },
  { name: 'WhatsApp', icon: <MessageSquare className="w-5 h-5" />, enabled: false, description: 'Real-time performance updates' },
  { name: 'Push Notifications', icon: <Smartphone className="w-5 h-5" />, enabled: true, description: 'Mobile app alerts for triggers' },
  { name: 'In-App Dashboard', icon: <AppWindow className="w-5 h-5" />, enabled: true, description: 'Notification center alerts' }
];

export default function AlertsClient({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <PageHeader
        title="Marketing Performance & Automation"
        subtitle="Monitor system health and set up automated rules for your marketing campaigns."
        actions={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </Button>
            <Button variant="primary" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Alert Rule
            </Button>
          </div>
        }
      />

      <StatGrid columns={4}>
        <StatCard
          label="Active Alerts"
          value="4"
          icon={<Bell className="w-6 h-6 text-blue-400" />}
          trend={{ value: 12, isPositive: false }}
        />
        <StatCard
          label="Triggered (24h)"
          value="2"
          icon={<AlertTriangle className="w-6 h-6 text-amber-400" />}
        />
        <StatCard
          label="Critical Issues"
          value="1"
          icon={<ShieldAlert className="w-6 h-6 text-red-400" />}
        />
        <StatCard
          label="System Health"
          value="94%"
          icon={<CheckCircle2 className="w-6 h-6 text-green-400" />}
        />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Alert Feed */}
        <div className="lg:col-span-2 space-y-6">
          <SectionHeader
            title="Active Alert Feed"
            subtitle="Recent performance alerts and system notifications"
          />
          <div className="space-y-4">
            {mockAlerts.map((alert) => (
              <Card key={alert.id} className="hover:border-slate-600 transition-colors group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div className={`mt-1 p-2 rounded-xl ${
                        alert.severity === 'danger' ? 'bg-red-500/10 text-red-500' :
                        alert.severity === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-green-500/10 text-green-500'
                      }`}>
                        {alert.severity === 'danger' ? <ShieldAlert className="w-5 h-5" /> :
                         alert.severity === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                         <CheckCircle2 className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-bold text-white">{alert.title}</h4>
                          <Badge variant={alert.severity as any}>{alert.category}</Badge>
                        </div>
                        <p className="text-sm text-slate-400 mb-2">{alert.description}</p>
                        <span className="text-xs text-slate-500 font-mono">{alert.timestamp}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">Dismiss</Button>
                      <Button variant="ghost" size="sm" className="p-1">
                        <MoreVertical className="w-4 h-4 text-slate-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button variant="ghost" className="w-full text-slate-500 hover:text-white">
            View All Historical Alerts
          </Button>
        </div>

        {/* Configuration Sidebar */}
        <div className="space-y-6">
          <SectionHeader title="Notification Channels" />
          <Card>
            <CardContent className="p-4 space-y-4">
              {channels.map((channel) => (
                <div key={channel.name} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="text-slate-400">{channel.icon}</div>
                    <div>
                      <div className="text-sm font-medium text-white">{channel.name}</div>
                      <div className="text-xs text-slate-500">{channel.description}</div>
                    </div>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${channel.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${channel.enabled ? 'right-1' : 'left-1'}`} />
                  </div>
                </div>
              ))}
              <div className="pt-4 mt-2 border-t border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 px-1">Integrations</p>
                <div className="space-y-2">
                  <Button variant="secondary" className="w-full text-xs py-2 justify-between flex">
                    Slack Webhook
                    <Badge variant="success" className="text-[10px] py-0">Connected</Badge>
                  </Button>
                  <Button variant="secondary" className="w-full text-xs py-2 justify-start">
                    + Add Discord Bot
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-600/10 to-purple-600/10 border-blue-500/20 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Zap className="w-16 h-16 text-blue-500" />
            </div>
            <CardHeader className="border-none pb-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400 fill-blue-400" />
                Automation Power
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Connect your Meta, Google, and TikTok accounts to enable real-time campaign pauses and budget adjustments.
              </p>
              <Button variant="primary" className="w-full text-xs py-2">Enable Automation</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Automation Templates */}
      <div className="space-y-6">
        <SectionHeader
          title="Automation Templates"
          subtitle="Deploy pre-built rules to protect your performance."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {automationTemplates.map((template) => (
            <Card key={template.title} className="group hover:border-blue-500/50 transition-all cursor-pointer flex flex-col">
              <CardHeader>
                <div className="mb-4 p-3 bg-slate-800 w-fit rounded-xl group-hover:scale-110 transition-transform">
                  {template.icon}
                </div>
                <CardTitle>{template.title}</CardTitle>
                <CardDescription className="font-mono text-xs text-blue-400 mt-2">{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <p className="text-sm text-slate-500 mb-6">{template.setup}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                    Use Template <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <Badge variant="info" className="bg-blue-500/5 border-blue-500/20 text-blue-400">Popular</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
