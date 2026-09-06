'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Card, Button, designTokens, getInputClasses, Badge, SectionHeader } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { marketingService } from '@/lib/services/marketing/marketingService';
import { Campaign } from '@/lib/types/marketing';
import { intelligenceService } from '@/lib/services/marketing/intelligenceService';

// --- MOCK DATA ---
const OBJECTIVES = [
  { id: 'sales', name: 'Sales', description: 'Drive purchases and revenue', icon: '💰' },
  { id: 'traffic', name: 'Traffic', description: 'Get more people to your store', icon: '🚦' },
  { id: 'leads', name: 'Leads', description: 'Collect customer information', icon: '📋' },
  { id: 'awareness', name: 'Awareness', description: 'Reach a broad audience', icon: '📢' },
  { id: 'engagement', name: 'Engagement', description: 'Get more likes and comments', icon: '✨' },
];

const CHANNELS = [
  { id: 'meta', name: 'Meta', icon: '📱', platforms: ['Facebook', 'Instagram'], capabilities: ['sales', 'traffic', 'leads', 'awareness', 'engagement'] },
  { id: 'google', name: 'Google', icon: '🔍', platforms: ['Search', 'Shopping', 'Display'], capabilities: ['sales', 'traffic', 'leads', 'awareness'] },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', platforms: ['Video'], capabilities: ['awareness', 'engagement', 'traffic'] },
  { id: 'youtube', name: 'YouTube', icon: '📺', platforms: ['Video'], capabilities: ['awareness', 'traffic'] },
  { id: 'spotify', name: 'Spotify', icon: '🎧', platforms: ['Audio'], capabilities: ['awareness'] },
  { id: 'pinterest', name: 'Pinterest', icon: '📌', platforms: ['Visual'], capabilities: ['traffic', 'awareness'] },
  { id: 'email', name: 'Email', icon: '📧', platforms: ['Direct'], capabilities: ['sales', 'engagement'] },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬', platforms: ['Direct'], capabilities: ['sales', 'engagement', 'leads'] },
];

const MOCK_PRODUCTS = [
  { id: '1', name: 'Premium Coffee Beans' },
  { id: '2', name: 'Eco-friendly Filter' },
  { id: '3', name: 'Cold Brew Kit' },
  { id: '4', name: 'Espresso Machine Cleaner' },
];

const MOCK_AUDIENCES = [
  { id: '1', name: 'Coffee Enthusiasts', size: '150k' },
  { id: '2', name: 'Past Customers', size: '12k' },
  { id: '3', name: 'Local Residents (London)', size: '800k' },
  { id: '4', name: 'Lookalike: Best Customers', size: '250k' },
];

// --- COMPONENTS ---

interface CampaignBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (data: any) => void;
}

function CampaignBuilder({ isOpen, onClose, onLaunch }: CampaignBuilderProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    objective: '',
    channels: [] as string[],
    products: [] as string[],
    audience: '',
    budget: '',
    currency: 'GBP',
    startDate: '',
    endDate: '',
  });

  if (!isOpen) return null;

  const nextStep = () => setStep(s => Math.min(s + 1, 5));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const toggleChannel = (id: string) => {
    setFormData(prev => ({
      ...prev,
      channels: prev.channels.includes(id)
        ? prev.channels.filter(c => c !== id)
        : [...prev.channels, id]
    }));
  };

  const toggleProduct = (id: string) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.includes(id)
        ? prev.products.filter(p => p !== id)
        : [...prev.products, id]
    }));
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <SectionHeader title="Select Campaign Objective" subtitle="What is the primary goal of this campaign?" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {OBJECTIVES.map((obj) => (
                <div
                  key={obj.id}
                  onClick={() => setFormData({ ...formData, objective: obj.id })}
                  className={`p-6 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${
                    formData.objective === obj.id
                      ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/20'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-3xl">{obj.icon}</div>
                  <div>
                    <h4 className="font-bold text-white uppercase tracking-tight">{obj.name}</h4>
                    <p className="text-xs text-slate-500">{obj.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <SectionHeader title="Select Channels" subtitle="Where should your ads appear?" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {CHANNELS.map((channel) => {
                const isCompatible = formData.objective ? channel.capabilities.includes(formData.objective) : true;
                const isSelected = formData.channels.includes(channel.id);

                return (
                  <div
                    key={channel.id}
                    onClick={() => toggleChannel(channel.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col items-center gap-2 text-center relative ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500'
                        : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                    } ${!isCompatible && !isSelected ? 'opacity-50' : ''}`}
                  >
                    {!isCompatible && (
                      <div className="absolute top-2 right-2 group">
                        <span className="text-[10px] cursor-help">⚠️</span>
                        <div className="absolute hidden group-hover:block bg-slate-950 border border-slate-800 p-2 rounded text-[8px] w-32 z-20 -top-10 left-0">
                          This channel may not be optimal for {formData.objective} objective.
                        </div>
                      </div>
                    )}
                    <div className="text-2xl">{channel.icon}</div>
                    <h4 className="text-xs font-bold text-white uppercase">{channel.name}</h4>
                    <p className="text-[8px] text-slate-500 uppercase tracking-widest">{channel.platforms.join(', ')}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <SectionHeader title="Targeting & Products" subtitle="Who are you reaching and what are you promoting?" />
            <div className="space-y-4">
              <div>
                <label className={designTokens.typography.label}>Target Products</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  {MOCK_PRODUCTS.map(p => (
                    <div
                      key={p.id}
                      onClick={() => toggleProduct(p.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        formData.products.includes(p.id)
                        ? 'bg-blue-500/10 border-blue-500 text-white'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400'
                      }`}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className={designTokens.typography.label}>Target Audience</label>
                <select
                  className={`w-full mt-2 ${getInputClasses()}`}
                  value={formData.audience}
                  onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                >
                  <option value="">Select Audience...</option>
                  {MOCK_AUDIENCES.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.size})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <SectionHeader title="Budget & Schedule" subtitle="Define your spend and timeline." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={designTokens.typography.label}>Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. Summer Coffee Promo 2024"
                  className={`w-full mt-2 ${getInputClasses()}`}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                 <div className="col-span-2">
                    <label className={designTokens.typography.label}>Total Budget</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      className={`w-full mt-2 ${getInputClasses()}`}
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    />
                 </div>
                 <div>
                    <label className={designTokens.typography.label}>Currency</label>
                    <select
                      className={`w-full mt-2 ${getInputClasses()}`}
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    >
                      <option value="GBP">GBP (£)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                 </div>
              </div>
              <div>
                <label className={designTokens.typography.label}>Start Date</label>
                <input
                  type="date"
                  className={`w-full mt-2 ${getInputClasses()}`}
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className={designTokens.typography.label}>End Date (Optional)</label>
                <input
                  type="date"
                  className={`w-full mt-2 ${getInputClasses()}`}
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <SectionHeader title="Review Your Campaign" subtitle="Final check before launching." />
            <Card className="bg-slate-900/60 border-slate-800 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Name</p>
                  <p className="text-white font-bold">{formData.name || 'Untitled Campaign'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Objective</p>
                  <Badge variant="info" className="mt-1 uppercase">{formData.objective}</Badge>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Channels</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {formData.channels.map(c => <Badge key={c} variant="secondary" className="text-[8px] uppercase">{c}</Badge>)}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Budget</p>
                  <p className="text-emerald-400 font-black">{formData.currency} {formData.budget}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Targeting</p>
                  <p className="text-slate-300 text-xs">
                    {MOCK_AUDIENCES.find(a => a.id === formData.audience)?.name || 'Broad'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Schedule</p>
                  <p className="text-slate-300 text-xs">{formData.startDate} to {formData.endDate || 'Ongoing'}</p>
                </div>
              </div>
            </Card>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Campaign Builder</h2>
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} className={`h-1 w-8 rounded-full ${s <= step ? 'bg-blue-500' : 'bg-slate-800'}`} />
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-2xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {renderStep()}
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-between items-center bg-slate-900/50">
          <Button variant="ghost" onClick={prevStep} disabled={step === 1} className="disabled:opacity-20 uppercase tracking-widest text-[10px] font-black">
            Back
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} className="uppercase tracking-widest text-[10px] font-black">
              Cancel
            </Button>
            {step < 5 ? (
              <Button onClick={nextStep} className="px-8 uppercase tracking-widest text-[10px] font-black">
                Next Step
              </Button>
            ) : (
              <Button onClick={() => onLaunch(formData)} className="px-10 bg-gradient-to-r from-emerald-500 to-teal-600 uppercase tracking-widest text-[10px] font-black border-0">
                Launch Campaign
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CampaignManagerClient({ params, searchParams }: { params: any; searchParams: any }) {
  const { selectedStore } = useStore();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryHealth, setInventoryHealth] = useState<Record<string, string>>({});
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await marketingService.getCampaigns(selectedStore?.id);
      setCampaigns(data);

      const mockProductIds = ['e173a198-04da-41d8-a4ca-1257b5136108'];
      const health = await intelligenceService.getCampaignInventoryHealth(mockProductIds);
      setInventoryHealth(health);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const handleLaunch = (data: any) => {
    console.log('Launching Campaign:', data);
    setIsBuilderOpen(false);
    loadCampaigns();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHeader
          title="Campaign Manager"
          subtitle="Cross-channel marketing performance."
        />
        <Button
          onClick={() => setIsBuilderOpen(true)}
          className="w-full sm:w-auto px-6 py-2.5 text-[10px] font-black uppercase tracking-widest"
        >
          + Create Campaign
        </Button>
      </div>

      <CampaignBuilder
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onLaunch={handleLaunch}
      />

      <div className="grid gap-4">
        {loading ? (
          <div className="p-10 text-center text-slate-500 font-bold uppercase text-[10px] tracking-widest animate-pulse">Loading Campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="p-20 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
             <div className="text-4xl mb-4">📣</div>
             <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-tight">No marketing campaigns</h3>
             <p className="text-sm text-slate-500 mb-6">Start driving store growth with your first campaign.</p>
             <Button
               onClick={() => setIsBuilderOpen(true)}
               className="px-8 py-3 text-xs font-black uppercase tracking-widest"
             >
               Get Started
             </Button>
          </div>
        ) : (
          campaigns.map((campaign) => (
            <Card key={campaign.id} className="p-5 bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-5 group shadow-lg">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                  {campaign.platform === 'whatsapp' ? '💬' : campaign.platform === 'email' ? '📧' : '📢'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-100 uppercase tracking-tight truncate text-base">{campaign.name}</h3>
                    <span
                      className={`w-2 h-2 rounded-full animate-pulse ${
                        inventoryHealth[Object.keys(inventoryHealth)[0]] === 'CRITICAL' ? 'bg-rose-500' :
                        inventoryHealth[Object.keys(inventoryHealth)[0]] === 'RISK' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="info" className="text-[8px] font-black uppercase tracking-tighter">{campaign.platform}</Badge>
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{campaign.campaign_type}</span>
                    <span className="text-[10px] text-slate-700">•</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">{campaign.start_date ? new Date(campaign.start_date).toLocaleDateString('en-GB') : 'No date'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 md:gap-10 border-t border-slate-800/50 sm:border-0 pt-4 sm:pt-0">
                 <div className="hidden fold-inner:block text-right">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Budget</p>
                    <p className="text-sm font-black text-slate-200">£{(campaign.budget / 100).toFixed(2)}</p>
                 </div>
                 <div className="hidden fold-inner:block text-right">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Revenue</p>
                    <p className="text-sm font-black text-emerald-400">£0.00</p>
                 </div>
                 <Badge variant={campaign.status === 'active' ? 'success' : campaign.status === 'draft' ? 'info' : 'warning'} className="text-[9px] font-black uppercase px-3 py-1">
                   {campaign.status}
                 </Badge>
                 <div className="flex gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <Button variant="secondary" className="text-[9px] font-black h-9 px-4 uppercase tracking-widest border-slate-700">Edit</Button>
                    <Button variant="secondary" className="text-[9px] font-black h-9 px-4 uppercase tracking-widest border-slate-700">Analytics</Button>
                 </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
