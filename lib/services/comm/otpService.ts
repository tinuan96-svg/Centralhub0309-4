import { supabase } from '@/lib/supabase';

export interface OTPResponse {
  success: boolean;
  request_id?: string;
  expires_in?: number;
  masked_phone?: string;
  error?: string;
}

export interface OTPVerifyResponse {
  success: boolean;
  session_tokens?: {
    action_link: string;
    email_otp: string;
    hashed_token: string;
    redirect_to: string;
    verification_type: string;
  };
  user?: any;
  error?: string;
}

export const OTPService = {
  async sendOTP(phoneNumber: string, storeId: string): Promise<OTPResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-otp', {
        body: {
          action: 'generate',
          phoneNumber,
          storeId,
          userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        },
      });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('[OTPService.sendOTP] Error:', err.message);
      return { success: false, error: err.message };
    }
  },

  async verifyOTP(requestId: string, otp: string, storeId: string): Promise<OTPVerifyResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-otp', {
        body: {
          action: 'verify',
          requestId,
          otp,
          storeId,
        },
      });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('[OTPService.verifyOTP] Error:', err.message);
      return { success: false, error: err.message };
    }
  },
};
