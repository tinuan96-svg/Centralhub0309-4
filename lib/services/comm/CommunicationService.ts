import { supabase } from '@/lib/supabase';
import { whatsappService } from '../customer-care/whatsappService';

export type CommEventType =
  | 'ORDER_RECEIVED'
  | 'PAYMENT_CONFIRMED'
  | 'ORDER_PROCESSING'
  | 'ORDER_DISPATCHED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'ORDER_REFUNDED'
  | 'MARKETING_BROADCAST'
  | 'ACCOUNT_LOGIN_OTP';

export interface CommTriggerParams {
  eventType: CommEventType;
  storeId: string;
  customerId?: string;
  phone?: string;
  email?: string;
  variables: Record<string, any>;
  orderId?: string;
  idempotencyKey?: string;
}

export class CommunicationService {
  /**
   * Main entry point for triggering communications based on system events.
   */
  static async triggerEvent(params: CommTriggerParams): Promise<{ success: boolean; message?: string }> {
    const { eventType, storeId, variables, orderId, idempotencyKey } = params;

    try {
      // Map CommEventType to canonical DB event key
      const eventKeyMap: Record<string, string> = {
        'ORDER_RECEIVED': 'order.received',
        'PAYMENT_CONFIRMED': 'order.confirmed',
        'ORDER_PROCESSING': 'order.processing',
        'ORDER_DISPATCHED': 'order.shipped',
        'ORDER_DELIVERED': 'order.delivered',
        'ORDER_CANCELLED': 'order.cancelled',
        'ORDER_REFUNDED': 'order.refunded',
        'MARKETING_BROADCAST': 'marketing.campaign',
        'ACCOUNT_LOGIN_OTP': 'account.login.otp'
      };

      const eventKey = eventKeyMap[eventType] || eventType.toLowerCase().replace('_', '.');

      // 1. Fetch active mapping for this event and store
      const { data: mappings, error: mapError } = await supabase
        .from('whatsapp_event_template_mappings')
        .select('*, template:whatsapp_template_registry(*)')
        .eq('store_id', storeId)
        .eq('event_key', eventKey)
        .eq('enabled', true);

      if (mapError) throw mapError;
      if (!mappings || mappings.length === 0) {
        return { success: true, message: `No enabled mappings found for ${eventKey}` };
      }

      // 2. Idempotency Check
      if (idempotencyKey) {
        const { data: existing, error: idempError } = await supabase
          .from('comm_idempotency_log')
          .select('id')
          .eq('store_id', storeId)
          .eq('event_key', idempotencyKey)
          .maybeSingle();

        if (idempError) {
          console.error('[CommunicationService] Idempotency check error:', idempError.message);
        }

        if (existing) return { success: true, message: 'Duplicate event ignored' };
      }

      // 3. Resolve recipient phone once for all mappings
      let recipientPhone = params.phone;
      if (!recipientPhone && orderId) {
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .select('customer_phone')
          .eq('id', orderId)
          .maybeSingle();
        if (orderErr) console.error('[CommunicationService] Error fetching order phone:', orderErr.message);
        recipientPhone = order?.customer_phone;
      }

      if (!recipientPhone) {
        console.error(`[CommunicationService] No recipient phone for event ${eventKey}, order ${orderId}`);
        await this.logNotification(storeId, orderId, eventKey, '', 'failed', 'Recipient phone number could not be resolved');
        return { success: false, message: 'Recipient phone number could not be resolved.' };
      }

      // 4. Process each mapping
      const results = await Promise.all(mappings.map(async (map) => {
        try {
          const template = map.template;
          if (!template) {
            await this.logNotification(storeId, orderId, eventKey, '', 'failed', 'Template registry record missing');
            return { success: false, error: 'Mapping found but template registry record missing.' };
          }

          // Validate template variables
          const templateVars = Array.isArray(template.variables) ? template.variables : [];
          const missingVars = templateVars.filter((varName: string) =>
            variables[varName] === undefined || variables[varName] === null
          );

          if (missingVars.length > 0) {
            console.warn(`[CommunicationService] Missing template variables for ${eventKey}:`, missingVars);
            await this.logNotification(storeId, orderId, eventKey, template.meta_template_name, 'failed',
              `Missing template variables: ${missingVars.join(', ')}`);
            return { success: false, error: `Missing template variables: ${missingVars.join(', ')}` };
          }

          // 5. Build Meta Template Components
          const components = this.buildMetaTemplateComponents(template, variables, eventType);

          // 6. Create notification log entry (queued)
          const notificationId = await this.logNotification(
            storeId, orderId, eventKey, template.meta_template_name, 'queued', null,
            recipientPhone, map.channel_id
          );

          // 7. Update status to sending
          if (notificationId) {
            await this.updateNotificationStatus(notificationId, 'sending');
          }

          // 8. Send WhatsApp via Service
          const response = await whatsappService.sendMessage({
            to: recipientPhone!,
            type: 'template',
            template: {
              name: template.meta_template_name,
              language: template.language || 'en_GB',
              components
            },
            storeId: storeId,
            conversationId: '',
            notificationId: notificationId || undefined
          });

          // 9. Update notification with Meta response
          if (notificationId && response?.success && response?.data?.message_id) {
            await this.updateNotificationStatus(notificationId, 'sent', null, response.data.message_id);
          } else if (notificationId && !response?.success) {
            const errorMsg = response?.error || 'Unknown send failure';
            await this.updateNotificationStatus(notificationId, 'failed', errorMsg);
            await this.queueRetryIfNeeded(notificationId, errorMsg);
          }

          return { success: response?.success ?? false, response };
        } catch (err: any) {
          console.error(`[CommunicationService] Send failed for mapping ${map.id}:`, err.message);
          await this.logNotification(storeId, orderId, eventKey, '', 'failed', err.message);
          return { success: false, error: err.message };
        }
      }));

      // 10. Log Idempotency (only if at least one send succeeded)
      if (idempotencyKey && results.some(r => r.success)) {
        const { error: insertError } = await supabase.from('comm_idempotency_log').insert({
          store_id: storeId,
          event_key: idempotencyKey,
          provider: 'whatsapp'
        });

        if (insertError) {
          console.error('[CommunicationService] Failed to log idempotency:', insertError.message);
        }
      }

      return { success: results.some(r => r.success) };
    } catch (error: any) {
      console.error(`[CommunicationService] Error:`, error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Logs a notification attempt to order_whatsapp_notifications.
   */
  private static async logNotification(
    storeId: string,
    orderId: string | undefined,
    eventKey: string,
    templateName: string,
    status: string,
    errorMessage: string | null,
    customerPhone?: string,
    channelId?: string
  ): Promise<string | null> {
    try {
      // Fetch order number if not already available
      let orderNumber: string | null = null;
      if (orderId) {
        const { data: order } = await supabase
          .from('orders')
          .select('order_number')
          .eq('id', orderId)
          .maybeSingle();
        orderNumber = order?.order_number || null;
      }

      const { data, error } = await supabase
        .from('order_whatsapp_notifications')
        .insert({
          store_id: storeId,
          order_id: orderId || null,
          order_number: orderNumber,
          customer_phone: customerPhone || null,
          event_key: eventKey,
          template_name: templateName || null,
          channel_id: channelId || null,
          status,
          error_message: errorMessage
        })
        .select('id')
        .single();

      if (error) {
        console.error('[CommunicationService] Failed to log notification:', error.message);
        return null;
      }

      return data?.id || null;
    } catch (e: any) {
      console.error('[CommunicationService] Log notification error:', e.message);
      return null;
    }
  }

  /**
   * Updates a notification's status and optionally the Meta WAMID.
   */
  private static async updateNotificationStatus(
    notificationId: string,
    status: string,
    errorMessage?: string | null,
    waMessageId?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };
      if (errorMessage) updateData.error_message = errorMessage;
      if (waMessageId) {
        updateData.wa_message_id = waMessageId;
        updateData.error_message = null; // Clear error on success
      }

      await supabase
        .from('order_whatsapp_notifications')
        .update(updateData)
        .eq('id', notificationId);
    } catch (e: any) {
      console.error('[CommunicationService] Failed to update notification status:', e.message);
    }
  }

  /**
   * Queues a retry for a failed notification if the error is transient.
   */
  private static async queueRetryIfNeeded(notificationId: string, errorMessage: string): Promise<void> {
    // Only retry transient errors (network, timeout, rate limit)
    const transientErrors = ['timeout', 'network', 'rate limit', 'temporary', '503', '502', '500', '429'];
    const isTransient = transientErrors.some(e => errorMessage.toLowerCase().includes(e));

    if (!isTransient) return;

    try {
      await supabase.from('whatsapp_notification_queue').insert({
        notification_id: notificationId,
        retry_count: 0,
        max_retries: 3,
        next_retry_at: new Date(Date.now() + 60000).toISOString(), // Retry in 1 minute
        status: 'pending',
        last_error: errorMessage
      });
    } catch (e: any) {
      console.error('[CommunicationService] Failed to queue retry:', e.message);
    }
  }

  /**
   * Maps CentralHub variables to Meta Template positional parameters.
   */
  private static buildMetaTemplateComponents(template: any, variables: Record<string, any>, eventType: CommEventType) {
    // Special positional mapping for OTP (usually {{1}} is the code)
    if (eventType === 'ACCOUNT_LOGIN_OTP') {
      const code = variables.otp_code || variables.otp;
      return [
        {
          type: 'body',
          parameters: [{ type: 'text', text: String(code) }]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: 0,
          parameters: [{ type: 'text', text: String(code) }]
        }
      ];
    }

    // Default: use the variables array from registry to map keys to positional slots {{1}}, {{2}}...
    const templateVars = Array.isArray(template.variables) ? template.variables : [];
    const parameters = templateVars.map((varName: string) => ({
      type: 'text',
      text: String(variables[varName] || `[${varName}]`)
    }));

    if (parameters.length === 0) return [];

    return [
      {
        type: 'body',
        parameters
      }
    ];
  }
}
