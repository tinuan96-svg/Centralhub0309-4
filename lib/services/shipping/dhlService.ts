import { ServiceType } from '../../types';
import { supabase } from '../../supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface DHLAddress {
  name: string;
  businessName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
  countryCode: string;
  phone: string;
  email?: string;
}

export interface DHLShipmentRequest {
  sender: DHLAddress;
  recipient: DHLAddress;
  weightGrams: number;
  numberOfItems?: number;
  serviceType: ServiceType;
  reference?: string;
  specialInstructions?: string;
  labelFormat?: string;
}

export interface DHLShipmentResponse {
  success: boolean;
  trackingNumber?: string;
  shipmentNumber?: string;
  labelData?: string;
  labelFormat?: string;
  labelUrl?: string;
  carrierReference?: string;
  estimatedDelivery?: string;
  cost?: number;
  error?: string;
  dhlResponse?: any;
}

export interface DHLTrackingResponse {
  success: boolean;
  status?: string;
  events?: Array<{
    status: string;
    location?: string;
    description: string;
    timestamp: string;
  }>;
  estimatedDelivery?: string;
  actualDelivery?: string;
  error?: string;
}

export interface DHLRateRequest {
  fromPostcode: string;
  toPostcode: string;
  weightGrams: number;
  serviceType: ServiceType;
}

export interface DHLRateResponse {
  success: boolean;
  cost?: number;
  estimatedDays?: number;
  currency?: string;
  error?: string;
}

export interface DHLStatusResponse {
  success: boolean;
  configured: boolean;
  accountNumber?: string;
  pickupAccount?: string;
  environment?: string;
  error?: string;
  warning?: string;
}

async function getAccessToken(): Promise<string> {
  let session = (await supabase.auth.getSession()).data.session;
  const expiresSoon = session?.expires_at ? session.expires_at * 1000 - Date.now() < 60_000 : false;
  if (expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) session = refreshed.data.session;
  }
  const token = session?.access_token;
  if (!token) throw new Error('Your CentralHub session has expired. Sign in again before using DHL.');
  return token;
}

async function callEdgeFunction(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/dhl-ecommerce/${path}`;
  const accessToken = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid response from DHL service: ${text.substring(0, 200)}`);
  }
}

export class DHLService {
  static async getApiStatus(): Promise<DHLStatusResponse> {
    try {
      return await callEdgeFunction('status');
    } catch (error: any) {
      console.error('DHL status check error:', error);
      return { success: false, configured: false, error: error.message };
    }
  }

  static async diagnose(): Promise<any> {
    return callEdgeFunction('diagnose');
  }

  static async createShipment(request: DHLShipmentRequest): Promise<DHLShipmentResponse> {
    try {
      const payload = {
        recipientName: request.recipient.name,
        recipientBusinessName: request.recipient.businessName || '',
        recipientAddress1: request.recipient.addressLine1,
        recipientAddress2: request.recipient.addressLine2 || '',
        recipientCity: request.recipient.city,
        recipientPostcode: request.recipient.postcode,
        recipientCountryCode: request.recipient.countryCode || 'GB',
        recipientPhone: request.recipient.phone || '',
        recipientEmail: request.recipient.email || '',
        senderName: request.sender.name,
        senderBusinessName: request.sender.businessName || '',
        senderAddress1: request.sender.addressLine1,
        senderAddress2: request.sender.addressLine2 || '',
        senderCity: request.sender.city,
        senderPostcode: request.sender.postcode,
        senderPhone: request.sender.phone || '',
        senderEmail: request.sender.email || '',
        weightKg: Math.max(0.1, request.weightGrams / 1000),
        numberOfItems: request.numberOfItems || 1,
        service: 'ND',
        customerReference: request.reference || '',
        specialInstructions: request.specialInstructions || '',
        labelFormat: request.labelFormat || 'PDF',
      };

      const data = await callEdgeFunction('create-shipment', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (data.success) {
        let labelUrl: string | null = null;
        if (data.labelData) {
          const format = (data.labelFormat || 'PDF').toUpperCase();
          const mimeType = format === 'PDF' ? 'application/pdf'
            : format === 'PNG' || format === 'PNG_RAW' ? 'image/png'
            : format === 'JPG' || format === 'JPG_RAW' ? 'image/jpeg'
            : 'application/pdf';
          labelUrl = `data:${mimeType};base64,${data.labelData}`;
        }

        return {
          success: true,
          trackingNumber: data.trackingNumber || data.shipmentNumber || '',
          shipmentNumber: data.shipmentNumber || '',
          labelData: data.labelData || undefined,
          labelFormat: data.labelFormat || 'PDF',
          labelUrl: labelUrl || undefined,
          carrierReference: data.shipmentNumber || undefined,
          estimatedDelivery: undefined,
        };
      }

      console.error('DHL shipment creation failed:', data);
      return {
        success: false,
        error: data.error || 'DHL shipment creation failed',
        dhlResponse: data.dhlResponse,
        rawResponse: data.rawResponse,
        requestPayload: data.requestPayload,
      } as any;
    } catch (error: any) {
      console.error('DHL createShipment error:', error);
      return {
        success: false,
        error: error.message || 'Failed to connect to DHL service',
      };
    }
  }

  static async cancelShipment(shipmentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await callEdgeFunction('cancel-shipment', {
        method: 'POST',
        body: JSON.stringify({ shipmentId }),
      });
    } catch (error: any) {
      console.error('DHL cancelShipment error:', error);
      return {
        success: false,
        error: error.message || 'Failed to connect to DHL service',
      };
    }
  }

  static async trackShipment(trackingNumber: string): Promise<DHLTrackingResponse> {
    try {
      const data = await callEdgeFunction(`track?trackingNumber=${encodeURIComponent(trackingNumber)}`);

      if (data.success && data.trackingData) {
        const shipments = data.trackingData.shipments || [];
        if (shipments.length > 0) {
          const shipment = shipments[0];
          const events = (shipment.events || []).map((e: any) => ({
            status: e.statusCode || e.status || '',
            location: e.location || '',
            description: e.description || '',
            timestamp: e.timestamp || new Date().toISOString(),
          }));

          return {
            success: true,
            status: shipment.status?.statusCode || shipment.status?.status || 'unknown',
            events,
            estimatedDelivery: shipment.estimatedDeliveryDate?.estimatedDeliveryDate || undefined,
            actualDelivery: shipment.details?.proofOfDelivery?.timestamp || undefined,
          };
        }
      }

      return {
        success: false,
        error: data.error || 'No tracking information found',
      };
    } catch (error: any) {
      console.error('DHL trackShipment error:', error);
      return {
        success: false,
        error: error.message || 'Failed to track shipment',
      };
    }
  }

  static async validateAddress(postcode: string, city: string): Promise<{ success: boolean; valid: boolean; error?: string }> {
    try {
      return await callEdgeFunction('validate-address', {
        method: 'POST',
        body: JSON.stringify({ postcode, city }),
      });
    } catch (error: any) {
      return { success: false, valid: false, error: error.message };
    }
  }

  static async calculateRate(request: DHLRateRequest): Promise<DHLRateResponse> {
    try {
      const data = await callEdgeFunction('calculate-rate', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (data.success) return data;

      const cost = this.calculateEstimatedCost(request.weightGrams, request.serviceType);
      return { success: true, cost, estimatedDays: 1, currency: 'GBP' };
    } catch {
      const cost = this.calculateEstimatedCost(request.weightGrams, request.serviceType);
      return { success: true, cost, estimatedDays: 1, currency: 'GBP' };
    }
  }

  private static calculateEstimatedCost(weightGrams: number, serviceType: ServiceType): number {
    const baseRate = 350;
    const weightRate = Math.ceil(weightGrams / 100) * 25;
    const serviceMultiplier = {
      standard: 1.0,
      priority: 1.3,
      express: 1.6,
    }[serviceType];

    return Math.round((baseRate + weightRate) * serviceMultiplier);
  }

  static isConfigured(): boolean {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  static getStatus(): {
    configured: boolean;
    endpoint: string;
    mockMode: boolean;
  } {
    return {
      configured: this.isConfigured(),
      endpoint: 'DHL eCommerce UK Cloud API (via Edge Function)',
      mockMode: false,
    };
  }
}
