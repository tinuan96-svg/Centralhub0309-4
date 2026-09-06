export type AnalyticsEventName =
  | 'page_view'
  | 'session_start'
  | 'first_visit'
  | 'view_item'
  | 'view_item_list'
  | 'select_item'
  | 'search'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'view_cart'
  | 'begin_checkout'
  | 'add_shipping_info'
  | 'add_payment_info'
  | 'purchase'
  | 'refund'
  | 'login'
  | 'sign_up'
  | 'share'
  | 'select_promotion'
  | 'view_promotion'
  | 'custom';

export interface AnalyticsStoreConfig {
  id: string;
  store_id: string;
  ga4_property_id?: string | null;
  ga4_measurement_id?: string | null;
  search_console_property?: string | null;
  google_ads_customer_id?: string | null;
  meta_dataset_id?: string | null;
  public_tracking_enabled: boolean;
  realtime_enabled: boolean;
  ecommerce_tracking_enabled: boolean;
  config: Record<string, unknown>;
  last_ga4_sync_at?: string | null;
  last_search_sync_at?: string | null;
  last_ads_sync_at?: string | null;
  last_meta_sync_at?: string | null;
  last_error?: string | null;
}

export interface AnalyticsRealtimeStore {
  store_id: string;
  active_users: number;
  active_sessions: number;
  page_views: number;
  product_views: number;
  add_to_carts: number;
  checkout_users: number;
  top_page?: string | null;
  top_product?: string | null;
  top_source?: string | null;
}
