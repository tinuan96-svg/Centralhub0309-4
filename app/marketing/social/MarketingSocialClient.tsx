'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Badge } from '@/lib/design-system';
import { marketingService } from '@/lib/services/marketing/marketingService';
import { MarketingConnection } from '@/lib/types/marketing';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import Link from 'next/link';

export default function SocialMedia({ params, searchParams }: { params: any; searchParams: any }) {
  const { selectedStoreId } = useDashboardFilterStore();
  const [connections, setConnections] = useState<MarketingConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConnections();
  }, [selectedStoreId]);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const data = await marketingService.getConnections(selectedStoreId === 'all' ? undefined : selectedStoreId);
      // Filter for social category providers
      const socialConnections = data.filter(c => c.provider?.category === 'social');
      setConnections(socialConnections);
    } catch (err) {
      console.error('Failed to load social connections:', err);
    } finally {
      setLoading(false);
    }
  };

  const socialPlatforms = [
    { name: 'Instagram', id: 'instagram' },
    { name: 'Facebook', id: 'facebook' },
    { name: 'TikTok', id: 'tiktok' }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader
          title="Social Media"
          subtitle="Plan and publish content across Instagram, Facebook, and TikTok."
        />
        <div className="flex gap-2">
          <Link href="/marketing/integrations?category=social">
            <Button variant="secondary">Manage Integrations</Button>
          </Link>
          <Link href={connections.length > 0 ? '/marketing/calendar' : '/marketing/integrations?category=social'}>
            <Button>{connections.length > 0 ? '+ Create Post' : 'Connect Channels'}</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         <Card className="p-6 bg-slate-900/50 border-slate-800">
            <h3 className="text-lg font-bold text-white mb-4">Channel Health</h3>
            <div className="space-y-4">
               {socialPlatforms.map(platform => {
                 const connection = connections.find(c =>
                    c.provider_id.toLowerCase().includes(platform.id) ||
                    c.provider?.display_name?.toLowerCase().includes(platform.id)
                 );

                 return (
                   <div key={platform.id} className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">{platform.name}</span>
                      {connection ? (
                        <Badge variant={connection.status === 'healthy' ? 'success' : 'warning'}>
                          {connection.status.toUpperCase()}
                        </Badge>
                      ) : (
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-500 uppercase font-bold tracking-widest">
                           Not Connected
                        </span>
                      )}
                   </div>
                 );
               })}
            </div>
            {!loading && connections.length === 0 && (
              <div className="mt-6 pt-6 border-t border-slate-800">
                <Link href="/marketing/integrations?category=social">
                  <Button variant="primary" className="w-full text-xs">Connect Channels</Button>
                </Link>
              </div>
            )}
         </Card>

         <Card className="col-span-full p-20 bg-slate-900/50 border-slate-800 text-center flex flex-col items-center">
            <div className="text-4xl mb-4">📸</div>
            <h3 className="text-xl font-bold text-white mb-2">Social Content Planner</h3>
            <p className="text-sm text-slate-500 mb-8 max-w-md">
               Centralize your social media strategy. Plan posts, track engagement, and analyze which content drives the most store traffic.
            </p>
            {connections.length > 0 ? (
              <Link href="/marketing/calendar"><Button variant="secondary">View Calendar</Button></Link>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-amber-500 bg-amber-500/10 px-4 py-2 rounded-lg border border-amber-500/20">
                  Connect your social media accounts to start planning content.
                </p>
                <Link href="/marketing/integrations?category=social">
                  <Button variant="primary">Go to Integrations</Button>
                </Link>
              </div>
            )}
         </Card>
      </div>
    </div>
  );
}
