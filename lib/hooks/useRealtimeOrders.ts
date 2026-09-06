import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseRealtimeOrdersOptions {
  onOrderCreated?: (order: any) => void;
  onOrderUpdated?: (order: any) => void;
  onOrderDeleted?: (orderId: string) => void;
  onStatusChanged?: (orderId: string, newStatus: string) => void;
  enabled?: boolean;
}

export function useRealtimeOrders(options: UseRealtimeOrdersOptions = {}) {
  const { onOrderCreated, onOrderUpdated, onOrderDeleted, onStatusChanged, enabled = true } = options;
  const previousStatusRef = useRef<Map<string, string>>(new Map());

  const handleInsert = useCallback(
    (payload: RealtimePostgresChangesPayload<any>) => {
      onOrderCreated?.(payload.new as any);
    },
    [onOrderCreated]
  );

  const handleUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<any>) => {
      const updated = payload.new as any;
      const old = payload.old as any;
      if (old?.order_status !== updated?.order_status) {
        onStatusChanged?.(updated?.id, updated?.order_status);
      }
      onOrderUpdated?.(updated);
    },
    [onOrderUpdated, onStatusChanged]
  );

  const handleDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<any>) => {
      onOrderDeleted?.((payload.old as any)?.id);
    },
    [onOrderDeleted]
  );

  useEffect(() => {
  if (!enabled) return;

  // Use a unique channel name per hook instance to avoid collisions in dev mode
  const channelName = `orders-realtime-${Math.random().toString(36).slice(2, 9)}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      handleInsert
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      handleUpdate
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'orders' },
      handleDelete
    );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [enabled, handleInsert, handleUpdate, handleDelete]);
}
