import { supabase } from '@/lib/supabase';

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  category: string;
  action_url?: string;
  store_id?: string | null;
  metadata?: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export class NotificationService {
  static async getNotifications(limit: number = 20): Promise<SystemNotification[]> {
    try {
      const { data, error } = await supabase
        .from('system_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('relation "public.system_notifications" does not exist')) {
          return [];
        }
        throw error;
      }
      return data || [];
    } catch (e) {
      console.error('[NotificationService] Error fetching notifications:', e);
      return [];
    }
  }

  static async markAsRead(id: string): Promise<void> {
    await supabase
      .from('system_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
  }

  static async markAllAsRead(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('system_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false)
      .or(`user_id.eq.${user.id},user_id.is.null`);
  }

  static subscribeToNotifications(onNotification: (notif: SystemNotification) => void) {
    return supabase
      .channel('system_notifications_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_notifications' }, payload => {
        onNotification(payload.new as SystemNotification);
      })
      .subscribe();
  }
}
