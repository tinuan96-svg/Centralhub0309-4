import { supabase } from '../../supabase';
import {
  Shipment,
  ShipmentEvent,
  SenderProfile,
  CreateShipmentRequest,
  ShippingRate,
  Carrier,
  ServiceType,
  ShipmentStatus,
  ShippingDashboardStats,
} from '../../types';
import { DHLService } from './dhlService';
import { ShipmentSyncService } from './shipmentSyncService';
import { DHLRateCalculatorService } from './dhlRateCalculatorService';
import { analyzePostcode, isLondonCongestionZone } from '../../utils/postcodeUtils';
import { pushOrderStatusToStore } from '../../utils/orderStatusSync';
import { CommunicationService } from '../comm/CommunicationService';

export class ShippingService {
  /**
   * Generate unique shipment number
   */
  private static generateShipmentNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `SHIP-${timestamp}-${random}`;
  }

  static async createShipment(request: CreateShipmentRequest): Promise<{ success: boolean; shipment?: Shipment; error?: string }> {
    try {
      const weightKg = request.weight_grams / 1000;
      if (weightKg < 0.1) return { success: false, error: 'Parcel weight must be at least 0.1 kg' };
      if (weightKg > 30) return { success: false, error: 'Parcel weight must not exceed 30 kg (DHL limit)' };

      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('id', request.order_id)
        .single();

      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      const result = await this.createManualShipment({
        recipient_name: request.recipient_name,
        recipient_company_name: request.recipient_company_name,
        recipient_address: request.recipient_address,
        recipient_city: request.recipient_city,
        recipient_postcode: request.recipient_postcode,
        recipient_phone: request.recipient_phone,
        recipient_email: request.recipient_email,
        weight_grams: request.weight_grams,
        service_type: request.service_type || 'standard',
        reference: order.order_number,
        sender_profile_id: request.sender_profile_id,
        order_id: request.order_id
      });

      return result;
    } catch (error: any) {
      console.error('Error creating shipment:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  static async createManualShipment(params: {
    recipient_name: string;
    recipient_company_name?: string;
    recipient_address: string;
    recipient_city: string;
    recipient_postcode: string;
    recipient_phone: string;
    recipient_email?: string;
    weight_grams: number;
    service_type: ServiceType;
    reference?: string;
    special_instructions?: string;
    sender_profile_id?: string;
    order_id?: string;
  }): Promise<{ success: boolean; shipment?: Shipment; error?: string }> {
    try {
      let senderProfile: SenderProfile | null = null;

      if (params.sender_profile_id) {
        const { data, error } = await supabase
          .from('sender_profiles')
          .select('*')
          .eq('id', params.sender_profile_id)
          .maybeSingle();
        if (error) {
          console.error('Error fetching specific sender profile:', error);
          return { success: false, error: `Database error: ${error.message}` };
        }
        senderProfile = data;
      } else {
        const { data, error } = await supabase
          .from('sender_profiles')
          .select('*')
          .eq('is_default', true)
          .maybeSingle();
        if (error) {
          if (error.message.includes('schema cache')) {
            return { success: false, error: 'The sender_profiles table is missing from your database. Please run the migration SQL.' };
          }
          console.error('Error fetching default sender profile:', error);
          return { success: false, error: `Database error: ${error.message}` };
        }
        senderProfile = data;
      }

      if (!senderProfile) {
        return { success: false, error: 'No sender profile found. Please configure a default sender profile in Settings.' };
      }

      const dhlRequest = {
        sender: {
          name: senderProfile.contact_name || senderProfile.company_name,
          businessName: senderProfile.company_name,
          addressLine1: senderProfile.address_line1,
          addressLine2: senderProfile.address_line2 || undefined,
          city: senderProfile.city,
          postcode: senderProfile.postcode,
          countryCode: senderProfile.country || 'GB',
          phone: senderProfile.phone,
          email: senderProfile.email,
        },
        recipient: {
          name: params.recipient_name,
          businessName: params.recipient_company_name || '',
          addressLine1: params.recipient_address,
          city: params.recipient_city,
          postcode: params.recipient_postcode,
          countryCode: 'GB',
          phone: params.recipient_phone,
          email: params.recipient_email,
        },
        weightGrams: params.weight_grams,
        serviceType: params.service_type,
        reference: params.reference,
        specialInstructions: params.special_instructions,
      };

      const dhlResponse = await DHLService.createShipment(dhlRequest);

      if (!dhlResponse.success) {
        return {
          success: false,
          error: dhlResponse.error || 'DHL shipment creation failed',
        };
      }

      console.log('DHL shipment created successfully:', dhlResponse.trackingNumber);

      const shipmentNumber = this.generateShipmentNumber();

      // Calculate shipping cost if API didn't return it
      let finalCostPence = dhlResponse.cost || 0;
      if (finalCostPence === 0) {
        try {
          const analysis = analyzePostcode(params.recipient_postcode);
          const isCongestion = isLondonCongestionZone(params.recipient_postcode);

          // Get dimensions from order items if possible
          let dimensions = { length: 30, width: 30, height: 30 };
          if (params.order_id) {
            const { data: orderItems } = await supabase
              .from('order_items')
              .select('product_id, quantity')
              .eq('order_id', params.order_id);

            if (orderItems && orderItems.length > 0) {
              const productIds = orderItems.map(i => i.product_id).filter(Boolean);
              const { data: products } = await supabase
                .from('products')
                .select('id, length_cm, width_cm, height_cm')
                .in('id', productIds);

              if (products && products.length > 0) {
                let totalVolume = 0;
                let maxL = 0, maxW = 0, maxH = 0;

                orderItems.forEach(item => {
                  const p = products.find(prod => prod.id === item.product_id);
                  if (p) {
                    const l = p.length_cm || 10;
                    const w = p.width_cm || 10;
                    const h = p.height_cm || 10;
                    totalVolume += (l * w * h) * (item.quantity || 1);
                    maxL = Math.max(maxL, l);
                    maxW = Math.max(maxW, w);
                    maxH = Math.max(maxH, h);
                  }
                });

                // Simple cube-root estimation for dimensions based on volume, but keeping max constraints
                const side = Math.max(Math.pow(totalVolume, 1/3), 20);
                dimensions = {
                  length: Math.round(Math.max(side, maxL)),
                  width: Math.round(Math.max(side, maxW)),
                  height: Math.round(Math.max(side, maxH))
                };
              }
            }
          }

          const calcResult = DHLRateCalculatorService.calculateLegacy({
            shipmentDate: new Date(),
            zone: analysis.zone,
            numParcels: 1,
            weightPerParcel: params.weight_grams / 1000,
            dimensions,
            timedService: 'none',
            isIsleOfWight: analysis.isIsleOfWight,
            isCongestionZone: isCongestion,
          });

          finalCostPence = Math.round(calcResult.totalEstimatedCost * 100);
          console.log(`Calculated automated shipping cost: £${(finalCostPence / 100).toFixed(2)} (Zone ${analysis.zone}, Dim: ${dimensions.length}x${dimensions.width}x${dimensions.height})`);
        } catch (calcErr) {
          console.error('Error calculating automated shipping cost:', calcErr);
        }
      }

      const { data: shipment, error } = await supabase
        .from('shipments')
        .insert({
          order_id: params.order_id || null,
          shipment_number: shipmentNumber,
          carrier: 'dhl',
          service_type: params.service_type,
          tracking_number: dhlResponse.trackingNumber || null,
          label_url: dhlResponse.labelUrl || null,
          status: 'label_created',
          shipping_cost: finalCostPence,
          weight_grams: params.weight_grams,
          sender_name: senderProfile.company_name,
          sender_address: senderProfile.address_line1,
          sender_city: senderProfile.city,
          sender_postcode: senderProfile.postcode,
          sender_phone: senderProfile.phone,
          recipient_name: params.recipient_name,
          recipient_company_name: params.recipient_company_name || null,
          recipient_address: params.recipient_address,
          recipient_city: params.recipient_city,
          recipient_postcode: params.recipient_postcode,
          recipient_phone: params.recipient_phone,
          recipient_email: params.recipient_email || null,
          carrier_reference: dhlResponse.carrierReference || null,
          estimated_delivery: dhlResponse.estimatedDelivery || null,
        })
        .select()
        .single();

      if (error || !shipment) {
        console.error('Error saving shipment to database:', error);
        return { success: false, error: `Database Error: ${error?.message || 'Failed to save record'}` };
      }

      await this.addShipmentEvent(shipment.id, 'ready_to_ship', 'Shipment created and ready for pickup', null);

      if (params.order_id) {
        console.log('Updating order status for order:', params.order_id);

        // 1. Primary update (all columns)
        const { error: primaryError } = await supabase
          .from('orders')
          .update({
            order_status: 'shipment_booked',
            warehouse_status: 'dispatched',
            fulfillment_status: 'shipment_booked',
            updated_at: new Date().toISOString()
          })
          .eq('id', params.order_id);

        if (primaryError) {
          console.warn('Fulfillment status update failed, attempting fallback:', primaryError.message);

          // 2. Fallback update (remove fulfillment_status if it doesn't exist)
          const { error: fallbackError } = await supabase
            .from('orders')
            .update({
              order_status: 'shipped',
              warehouse_status: 'dispatched',
              updated_at: new Date().toISOString()
            })
            .eq('id', params.order_id);

          if (fallbackError) {
            console.error('Final fallback update failed:', fallbackError.message);
          }
        }

        // Log to order history as well
        await supabase.from('order_status_history').insert([{
          order_id: params.order_id,
          new_status: 'shipped',
          notes: `Shipment ${shipmentNumber} created via DHL. Tracking: ${dhlResponse.trackingNumber}`,
          inventory_action: 'commit',
          inventory_action_completed: true
        }]);

        // 3. Queue synchronization to remote store
        const { data: orderData } = await supabase
          .from('orders')
          .select('order_number, store_id')
          .eq('id', params.order_id)
          .single();

        if (orderData) {
          await ShipmentSyncService.queueSync({
            eventType: 'CREATED',
            shipment: shipment as any,
            orderNumber: orderData.order_number,
            storeId: orderData.store_id
          });
        }

        pushOrderStatusToStore(params.order_id, 'shipment_booked', `Shipment ${shipmentNumber} created`);
      }

      return { success: true, shipment };
    } catch (error: any) {
      console.error('Error in createManualShipment:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  static async calculateShipping(params: {
    carrier: Carrier;
    serviceType: ServiceType;
    fromPostcode: string;
    toPostcode: string;
    weightGrams: number;
  }): Promise<ShippingRate | null> {
    try {
      const cacheKey = `${params.carrier}-${params.serviceType}-${params.fromPostcode}-${params.toPostcode}-${params.weightGrams}`;
      const now = new Date().toISOString();

      const { data: cached } = await supabase
        .from('shipping_rates_cache')
        .select('*')
        .eq('carrier', params.carrier)
        .eq('service_type', params.serviceType)
        .eq('from_postcode', params.fromPostcode)
        .eq('to_postcode', params.toPostcode)
        .eq('weight_grams', params.weightGrams)
        .gt('expires_at', now)
        .maybeSingle();

      if (cached) {
        return {
          carrier: params.carrier,
          service_type: params.serviceType,
          cost: cached.cost,
          estimated_days: 3,
          currency: 'GBP',
        };
      }

      let rate: ShippingRate | null = null;

      if (params.carrier === 'dhl') {
        const dhlRate = await DHLService.calculateRate({
          fromPostcode: params.fromPostcode,
          toPostcode: params.toPostcode,
          weightGrams: params.weightGrams,
          serviceType: params.serviceType,
        });

        if (dhlRate.success && dhlRate.cost) {
          rate = {
            carrier: params.carrier,
            service_type: params.serviceType,
            cost: dhlRate.cost,
            estimated_days: dhlRate.estimatedDays || 3,
            currency: dhlRate.currency || 'GBP',
          };

          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          await supabase.from('shipping_rates_cache').insert({
            carrier: params.carrier,
            service_type: params.serviceType,
            from_postcode: params.fromPostcode,
            to_postcode: params.toPostcode,
            weight_grams: params.weightGrams,
            cost: dhlRate.cost,
            expires_at: expiresAt.toISOString(),
          });
        }
      }

      return rate;
    } catch (error) {
      console.error('Error calculating shipping:', error);
      return null;
    }
  }

  static async trackShipment(shipmentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: shipment } = await supabase
        .from('shipments')
        .select('*')
        .eq('id', shipmentId)
        .single();

      if (!shipment) {
        return { success: false, error: 'Shipment not found' };
      }

      let costUpdated = false;

      // 1. Recalculate cost from Order data (Always run this on refresh if cost is 0 or needs update)
      if (shipment.order_id) {
        console.log(`[ShippingService] Refreshing cost for ${shipment.shipment_number} from order data...`);
        try {
          // Fetch latest order data (Weight and Postcode)
          const { data: order } = await supabase
            .from('orders')
            .select('total_weight_kg, delivery_postcode, order_number')
            .eq('id', shipment.order_id)
            .single();

          if (order) {
            const postcode = order.delivery_postcode || shipment.recipient_postcode;
            const weightKg = order.total_weight_kg || (shipment.weight_grams / 1000) || 1;

            const analysis = analyzePostcode(postcode);
            const isCongestion = isLondonCongestionZone(postcode);

            // Get dimensions from order items
            let dimensions = { length: 30, width: 30, height: 30 };
            const { data: orderItems } = await supabase
              .from('order_items')
              .select('product_id, quantity')
              .eq('order_id', shipment.order_id);

            if (orderItems && orderItems.length > 0) {
              const productIds = orderItems.map(i => i.product_id).filter(Boolean);
              const { data: products } = await supabase
                .from('products')
                .select('id, length_cm, width_cm, height_cm')
                .in('id', productIds);

              if (products && products.length > 0) {
                let totalVolume = 0;
                let maxL = 0, maxW = 0, maxH = 0;
                orderItems.forEach(item => {
                  const p = products.find(prod => prod.id === item.product_id);
                  if (p) {
                    const l = p.length_cm || 10;
                    const w = p.width_cm || 10;
                    const h = p.height_cm || 10;
                    totalVolume += (l * w * h) * (item.quantity || 1);
                    maxL = Math.max(maxL, l); maxW = Math.max(maxW, w); maxH = Math.max(maxH, h);
                  }
                });
                const side = Math.max(Math.pow(totalVolume, 1/3), 20);
                dimensions = { length: Math.round(Math.max(side, maxL)), width: Math.round(Math.max(side, maxW)), height: Math.round(Math.max(side, maxH)) };
              }
            }

            const calcResult = DHLRateCalculatorService.calculateLegacy({
              shipmentDate: shipment.created_at ? new Date(shipment.created_at) : new Date(),
              zone: analysis.zone,
              numParcels: 1,
              weightPerParcel: weightKg,
              dimensions,
              timedService: (shipment.service_type === 'express' ? 'noon' : 'none') as any,
              isIsleOfWight: analysis.isIsleOfWight,
              isCongestionZone: isCongestion,
            });

            const newCostPence = Math.round(calcResult.totalEstimatedCost * 100);

            // Sync shipment record with order data (in case weight/postcode changed)
            await supabase
              .from('shipments')
              .update({
                shipping_cost: newCostPence,
                weight_grams: Math.round(weightKg * 1000),
                recipient_postcode: postcode,
                updated_at: new Date().toISOString()
              })
              .eq('id', shipmentId);

            costUpdated = true;
            console.log(`[ShippingService] Updated ${shipment.shipment_number}: £${(newCostPence / 100).toFixed(2)} (Zone ${analysis.zone}, Weight ${weightKg}kg)`);
          }
        } catch (calcErr) {
          console.error('[ShippingService] Error recalculating cost:', calcErr);
        }
      }

      // 2. Refresh tracking status from carrier
      if (shipment.tracking_number && shipment.carrier === 'dhl') {
        const tracking = await DHLService.trackShipment(shipment.tracking_number);

        if (tracking.success && tracking.events) {
          for (const event of tracking.events) {
            const { data: existingEvent } = await supabase
              .from('shipment_events')
              .select('id')
              .eq('shipment_id', shipmentId)
              .eq('event_time', event.timestamp)
              .maybeSingle();

            if (!existingEvent) {
              await supabase.from('shipment_events').insert({
                shipment_id: shipmentId,
                status: event.status,
                location: event.location || null,
                description: event.description,
                event_time: event.timestamp,
              });
            }
          }

          const newStatus = this.mapCarrierStatusToInternal(tracking.status || 'unknown');
          const isDelivered = newStatus === 'delivered';

          await supabase
            .from('shipments')
            .update({
              status: newStatus,
              actual_delivery: tracking.actualDelivery || shipment.actual_delivery,
              updated_at: new Date().toISOString(),
            })
            .eq('id', shipmentId);

          // Queue sync to remote store if status changed
          if (newStatus !== shipment.status) {
            const { data: orderData } = await supabase
              .from('orders')
              .select('id, order_number, store_id, customer_name')
              .eq('id', shipment.order_id)
              .single();

            if (orderData) {
              const finalOrderStatus = isDelivered ? 'completed' : (newStatus as any);

              await supabase
                .from('orders')
                .update({
                  order_status: finalOrderStatus,
                  fulfillment_status: newStatus as any,
                  updated_at: new Date().toISOString()
                })
                .eq('id', orderData.id);

              await supabase.from('order_status_history').insert([{
                order_id: orderData.id,
                new_status: finalOrderStatus,
                notes: isDelivered
                  ? `Order fulfilled successfully. DHL tracking: Delivered.`
                  : `Shipment status updated via DHL tracking: ${newStatus.replace(/_/g, ' ')}`,
                inventory_action: 'none'
              }]);

              pushOrderStatusToStore(orderData.id, finalOrderStatus, `DHL tracking: ${newStatus.replace(/_/g, ' ')}`);

              // Trigger WhatsApp delivered notification when DHL reports delivery
              if (isDelivered) {
                CommunicationService.triggerEvent({
                  eventType: 'ORDER_DELIVERED',
                  storeId: orderData.store_id,
                  orderId: orderData.id,
                  variables: {
                    customer_name: orderData.customer_name || 'Customer',
                    order_number: orderData.order_number
                  },
                  idempotencyKey: `order_delivered:${orderData.id}`
                }).catch(err => console.error('Failed to trigger ORDER_DELIVERED comm from DHL tracking:', err));
              }

              const { data: updatedShipment } = await supabase.from('shipments').select('*').eq('id', shipmentId).single();
              if (updatedShipment) {
                await ShipmentSyncService.queueSync({
                  eventType: 'STATUS_UPDATE',
                  shipment: updatedShipment as any,
                  orderNumber: orderData.order_number,
                  storeId: orderData.store_id
                });
              }
            }
          }

          return { success: true };
        }
      }

      // Return success if cost was updated, even if tracking failed
      return { success: costUpdated, error: costUpdated ? undefined : 'Tracking failed' };
    } catch (error: any) {
      console.error('Error tracking shipment:', error);
      return { success: false, error: error.message };
    }
  }

  private static mapCarrierStatusToInternal(carrierStatus: string): ShipmentStatus {
    const status = carrierStatus.toUpperCase();

    const statusMap: Record<string, ShipmentStatus> = {
      // API Status Codes
      'PU': 'collected',
      'PL': 'in_transit',
      'IT': 'in_transit',
      'WC': 'ready_for_collection',
      'DF': 'out_for_delivery',
      'OK': 'delivered',
      'DL': 'delivered',
      'RD': 'returned',
      'CA': 'cancelled',
      'AX': 'delivery_attempted',
      'RE': 'delivery_rescheduled',
      'AD': 'at_local_depot',

      // Text Statuses
      'LABEL_CREATED': 'label_created',
      'COLLECTED': 'collected',
      'IN_TRANSIT': 'in_transit',
      'ARRIVED_AT_DEPOT': 'in_transit',
      'ARRIVED_AT_DELIVERY_DEPOT': 'at_local_depot',
      'OUT_FOR_DELIVERY': 'out_for_delivery',
      'DELIVERED': 'delivered',
      'FAILED': 'failed',
      'CANCELLED': 'cancelled',
      'RETURNED': 'returned',
      'DELIVERY_ATTEMPTED': 'delivery_attempted',
      'READY_FOR_COLLECTION': 'ready_for_collection',
      'DELIVERY_REARRANGED': 'delivery_rescheduled'
    };

    return statusMap[status] || 'in_transit';
  }

  private static async addShipmentEvent(
    shipmentId: string,
    status: string,
    description: string,
    location: string | null
  ): Promise<void> {
    await supabase.from('shipment_events').insert({
      shipment_id: shipmentId,
      status,
      description,
      location,
      event_time: new Date().toISOString(),
    });
  }

  static async getShipments(filters?: {
    status?: ShipmentStatus;
    carrier?: Carrier;
    orderId?: string;
  }): Promise<Shipment[]> {
    try {
      let query = supabase.from('shipments').select('*, orders(order_number, customer_name)').order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.carrier) {
        query = query.eq('carrier', filters.carrier);
      }

      if (filters?.orderId) {
        query = query.eq('order_id', filters.orderId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching shipments:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getShipments:', error);
      return [];
    }
  }

  static async getShipmentEvents(shipmentId: string): Promise<ShipmentEvent[]> {
    try {
      const { data, error } = await supabase
        .from('shipment_events')
        .select('*')
        .eq('shipment_id', shipmentId)
        .order('event_time', { ascending: false });

      if (error) {
        console.error('Error fetching shipment events:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getShipmentEvents:', error);
      return [];
    }
  }

  static async getDashboardStats(): Promise<ShippingDashboardStats> {
    try {
      const { data: shipments } = await supabase.from('shipments').select('status, shipping_cost');

      if (!shipments) {
        return {
          total_shipments: 0,
          not_shipped: 0,
          in_transit: 0,
          delivered: 0,
          failed: 0,
          total_cost: 0,
          average_cost: 0,
        };
      }

      const total_cost = shipments.reduce((sum, s) => sum + s.shipping_cost, 0);

      return {
        total_shipments: shipments.length,
        not_shipped: shipments.filter(s => s.status === 'not_shipped').length,
        in_transit: shipments.filter(s => s.status === 'in_transit' || s.status === 'out_for_delivery').length,
        delivered: shipments.filter(s => s.status === 'delivered').length,
        failed: shipments.filter(s => s.status === 'failed').length,
        total_cost,
        average_cost: shipments.length > 0 ? Math.round(total_cost / shipments.length) : 0,
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return {
        total_shipments: 0,
        not_shipped: 0,
        in_transit: 0,
        delivered: 0,
        failed: 0,
        total_cost: 0,
        average_cost: 0,
      };
    }
  }

  static async getSenderProfiles(): Promise<SenderProfile[]> {
    try {
      const { data, error } = await supabase
        .from('sender_profiles')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) {
        console.error('Error fetching sender profiles:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getSenderProfiles:', error);
      return [];
    }
  }

  static async updateShipmentStatus(shipmentId: string, status: ShipmentStatus): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('shipments')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipmentId);

      if (error) {
        console.error('Error updating shipment status:', error);
        return false;
      }

      await this.addShipmentEvent(shipmentId, status, `Status updated to ${status}`, null);

      const { data: shipment } = await supabase
        .from('shipments')
        .select('*, orders(order_number, store_id)')
        .eq('id', shipmentId)
        .single();

      if (shipment?.order_id) {
        pushOrderStatusToStore(shipment.order_id, status, `Shipment status: ${status}`);
      }

      if (shipment && shipment.orders) {
        await ShipmentSyncService.queueSync({
          eventType: 'STATUS_UPDATE',
          shipment: shipment as any,
          orderNumber: shipment.orders.order_number,
          storeId: shipment.orders.store_id
        });
      }

      return true;
    } catch (error) {
      console.error('Error in updateShipmentStatus:', error);
      return false;
    }
  }

  static async markLabelPrinted(shipmentId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('shipments')
        .update({
          label_printed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipmentId);

      if (!error) {
        await this.addShipmentEvent(shipmentId, 'label_printed', 'Shipping label printed', 'Warehouse Printer');

        // Queue sync to remote store
        const { data: shipment } = await supabase
          .from('shipments')
          .select('*, orders(order_number, store_id)')
          .eq('id', shipmentId)
          .single();

        if (shipment && shipment.orders) {
          await ShipmentSyncService.queueSync({
            eventType: 'LABEL_PRINTED',
            shipment: shipment as any,
            orderNumber: shipment.orders.order_number,
            storeId: shipment.orders.store_id
          });
        }
      }

      return !error;
    } catch (error) {
      console.error('Error marking label as printed:', error);
      return false;
    }
  }

  static async bulkCreateShipments(requests: CreateShipmentRequest[]): Promise<{
    success: number;
    failed: number;
    results: Array<{ orderId: string; success: boolean; error?: string; shipment?: Shipment }>;
  }> {
    let success = 0;
    let failed = 0;
    const results: Array<{ orderId: string; success: boolean; error?: string; shipment?: Shipment }> = [];

    for (const request of requests) {
      const result = await this.createShipment(request);

      if (result.success) {
        success++;
        results.push({
          orderId: request.order_id,
          success: true,
          shipment: result.shipment,
        });
      } else {
        failed++;
        results.push({
          orderId: request.order_id,
          success: false,
          error: result.error,
        });
      }
    }

    return { success, failed, results };
  }

  static async deleteShipment(shipmentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Fetch shipment details to check carrier and order
      const { data: shipment } = await supabase
        .from('shipments')
        .select('*')
        .eq('id', shipmentId)
        .single();

      if (!shipment) {
        return { success: false, error: 'Shipment not found' };
      }

      // 2. If it's a DHL shipment, try to void it in their system
      if (shipment.carrier === 'dhl' && shipment.shipment_number) {
        console.log(`[ShippingService] Attempting to void DHL shipment: ${shipment.shipment_number}`);
        const dhlCancel = await DHLService.cancelShipment(shipment.shipment_number);

        if (!dhlCancel.success) {
          console.warn(`[ShippingService] DHL void failed: ${dhlCancel.error}. Proceeding with local deletion.`);
          // Note: We often proceed with local deletion even if DHL void fails
          // (e.g. if the shipment was already cancelled or manifest closed)
          // but we should probably alert the user.
        }
      }

      // 3. Delete locally
      const { error } = await supabase
        .from('shipments')
        .delete()
        .eq('id', shipmentId);

      if (error) {
        console.error('Error deleting shipment record:', error);
        return { success: false, error: 'Failed to delete shipment record' };
      }

      // 4. If linked to an order, revert order status back to 'ready_to_ship' or 'packed'
      if (shipment.order_id) {
         await supabase
           .from('orders')
           .update({
             order_status: 'ready_to_ship',
             warehouse_status: 'ready_to_ship',
             fulfillment_status: 'ready_to_ship',
             updated_at: new Date().toISOString()
           })
           .eq('id', shipment.order_id);

         await supabase.from('order_status_history').insert([{
           order_id: shipment.order_id,
           new_status: 'ready_to_ship',
           notes: `Shipment ${shipment.shipment_number} was deleted/voided. Order reverted to Ready to Ship.`,
         }]);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error in deleteShipment:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  static async recordExternalShipment(params: {
    order_id?: string;
    order_number?: string;
    tracking_number: string;
    carrier?: string;
    service_type?: string;
    weight_grams?: number;
    recipient_name?: string;
    recipient_address?: string;
    recipient_city?: string;
    recipient_postcode?: string;
    shipping_cost?: number;
    notes?: string;
  }): Promise<{ success: boolean; shipment?: Shipment; error?: string }> {
    try {
      let senderProfile: SenderProfile | null = null;
      const { data: sp } = await supabase
        .from('sender_profiles')
        .select('*')
        .eq('is_default', true)
        .maybeSingle();
      senderProfile = sp;

      const shipmentNumber = this.generateShipmentNumber();

      const insertPayload: any = {
        shipment_number: shipmentNumber,
        carrier: params.carrier || 'dhl',
        service_type: params.service_type || 'standard',
        tracking_number: params.tracking_number,
        label_url: null,
        status: 'in_transit',
        shipping_cost: params.shipping_cost || 0,
        weight_grams: params.weight_grams || 1000,
        recipient_name: params.recipient_name || 'N/A',
        recipient_address: params.recipient_address || 'N/A',
        recipient_city: params.recipient_city || 'N/A',
        recipient_postcode: params.recipient_postcode || 'N/A',
        recipient_phone: '',
        metadata: { source: 'external', notes: params.notes || null },
      };

      if (params.order_id) {
        insertPayload.order_id = params.order_id;
      }
      if (params.order_number) {
        insertPayload.order_number = params.order_number;
      }
      if (senderProfile) {
        insertPayload.sender_name = senderProfile.company_name;
        insertPayload.sender_address = senderProfile.address_line1;
        insertPayload.sender_city = senderProfile.city;
        insertPayload.sender_postcode = senderProfile.postcode;
        insertPayload.sender_phone = senderProfile.phone;
      }

      const { data: shipment, error } = await supabase
        .from('shipments')
        .insert(insertPayload)
        .select()
        .single();

      if (error || !shipment) {
        console.error('Error saving external shipment:', error);
        return { success: false, error: error?.message || 'Failed to save shipment' };
      }

      await this.addShipmentEvent(shipment.id, 'in_transit', 'External shipment recorded manually', null);

      if (params.order_id) {
        await supabase
          .from('orders')
          .update({
            order_status: 'shipped',
            warehouse_status: 'dispatched',
            fulfillment_status: 'shipped',
            updated_at: new Date().toISOString()
          })
          .eq('id', params.order_id);

        await supabase.from('order_status_history').insert([{
          order_id: params.order_id,
          new_status: 'shipped',
          notes: `External shipment recorded. Tracking: ${params.tracking_number}`,
        }]);

        pushOrderStatusToStore(params.order_id, 'shipped', `External shipment: ${params.tracking_number}`);

        const { data: orderData } = await supabase
          .from('orders')
          .select('order_number, store_id')
          .eq('id', params.order_id)
          .single();

        if (orderData) {
          await ShipmentSyncService.queueSync({
            eventType: 'CREATED',
            shipment: shipment as any,
            orderNumber: orderData.order_number,
            storeId: orderData.store_id
          });
        }
      }

      return { success: true, shipment };
    } catch (error: any) {
      console.error('Error in recordExternalShipment:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  static async recreateShipment(shipmentId: string, request: CreateShipmentRequest): Promise<{ success: boolean; shipment?: Shipment; error?: string }> {
    try {
      const deleteResult = await this.deleteShipment(shipmentId);

      if (!deleteResult.success) {
        return { success: false, error: deleteResult.error };
      }

      const createResult = await this.createShipment(request);

      return createResult;
    } catch (error: any) {
      console.error('Error recreating shipment:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  static async getShippingCostEstimate(params: {
    fromPostcode: string;
    toPostcode: string;
    weightGrams: number;
    serviceType: ServiceType;
  }): Promise<{ success: boolean; cost?: number; estimatedDays?: number; currency?: string; error?: string }> {
    try {
      const rate = await this.calculateShipping({
        carrier: 'dhl',
        serviceType: params.serviceType,
        fromPostcode: params.fromPostcode,
        toPostcode: params.toPostcode,
        weightGrams: params.weightGrams,
      });

      if (rate) {
        return {
          success: true,
          cost: rate.cost,
          estimatedDays: rate.estimated_days,
          currency: rate.currency,
        };
      } else {
        return {
          success: false,
          error: 'Unable to calculate shipping cost',
        };
      }
    } catch (error: any) {
      console.error('Error getting shipping cost estimate:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }
}
