import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Client initialized with missing environment variables. Features requiring database access will fail.');
}

export const supabase = createClient<any>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export type Database = any;

// Authoritative Types (reconciled with live schema and application needs)
export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  sku: string | null;
  brand: string | null;
  category_id: string | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface Order {
  id: string;
  order_number: string;
  payment_status: string;
  order_status: string;
  total: number;
  store_id: string | null;
  created_at: string;
  [key: string]: any;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  [key: string]: any;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  [key: string]: any;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  [key: string]: any;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  [key: string]: any;
}

export interface Shipment {
  id: string;
  order_id: string | null;
  status: string;
  tracking_number: string | null;
  [key: string]: any;
}

export type CentralInventory = any;
export type InventoryMovement = any;
export type Supplier = any;
export type SupplierInvoice = any;
export type WhatsAppConversation = any;
export type WhatsAppMessage = any;
export type WhatsAppContact = any;
export type SupportTicket = any;
export type ResolvedProduct = any;
