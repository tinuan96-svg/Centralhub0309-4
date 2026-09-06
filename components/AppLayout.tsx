'use client';

import { ReactNode, useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { supabase } from '@/lib/supabase';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // 1. Trigger background sync from MalluSpices on load
    console.log('AppLayout: Starting background sync...');
    supabase.functions.invoke('sync-orders').catch(err => console.error('Auto-sync failed:', err));

    // 2. Listen for order changes in CentralHub
    const channelId = Math.random().toString(36).substring(2, 11);
    const channel = supabase.channel(`app_layout_orders_${channelId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders'
      }, (payload) => {
        console.log('AppLayout: Order update received:', payload);
      })
      .subscribe();

    return () => {
      console.log('AppLayout: Cleaning up realtime channel...');
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex h-screen bg-[#0D1117] overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-[#0D1117] pb-16 lg:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}
