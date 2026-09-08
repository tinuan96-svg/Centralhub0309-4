export interface WhatsAppEvent {
  key: string;
  label: string;
  type: 'AUTHENTICATION' | 'TRANSACTIONAL' | 'MARKETING';
  source: 'ORDER_SERVICE' | 'AUTH_SERVICE' | 'SHIPPING_SERVICE' | 'SYSTEM';
  variables: string[];
}

export const WHATSAPP_EVENTS: Record<string, WhatsAppEvent[]> = {
  AUTHENTICATION: [
    {
      key: 'account.login.otp',
      label: 'Account Login OTP',
      type: 'AUTHENTICATION',
      source: 'AUTH_SERVICE',
      variables: ['otp_code'],
    },
  ],
  ORDERS: [
    {
      key: 'order.received',
      label: 'Order Received',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number', 'order_total'],
    },
    {
      key: 'order.confirmed',
      label: 'Order Confirmed / Payment Confirmed',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number'],
    },
    {
      key: 'order.processing',
      label: 'Order Processing',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number'],
    },
    {
      key: 'order.shipped',
      label: 'Order Shipped',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number', 'tracking_url'],
    },
    {
      key: 'order.delivered',
      label: 'Order Delivered',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number'],
    },
    {
      key: 'order.cancelled',
      label: 'Order Cancelled',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number'],
    },
    {
      key: 'order.refunded',
      label: 'Order Refunded',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number'],
    },
    {
      key: 'order.returned',
      label: 'Order Returned',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number'],
    },
  ],
  FINANCE: [
    {
      key: 'payment.failed',
      label: 'Payment Failed',
      type: 'TRANSACTIONAL',
      source: 'ORDER_SERVICE',
      variables: ['customer_name', 'order_number'],
    },
  ],
  SHIPPING: [
    {
      key: 'shipment.collected',
      label: 'Shipment Collected',
      type: 'TRANSACTIONAL',
      source: 'SHIPPING_SERVICE',
      variables: ['order_number', 'tracking_url'],
    },
    {
      key: 'shipment.in_transit',
      label: 'Shipment In Transit',
      type: 'TRANSACTIONAL',
      source: 'SHIPPING_SERVICE',
      variables: ['order_number', 'tracking_url'],
    },
    {
      key: 'shipment.arrived_depot',
      label: 'Arrived at Depot',
      type: 'TRANSACTIONAL',
      source: 'SHIPPING_SERVICE',
      variables: ['order_number', 'tracking_url'],
    },
    {
      key: 'shipment.out_for_delivery',
      label: 'Out for Delivery',
      type: 'TRANSACTIONAL',
      source: 'SHIPPING_SERVICE',
      variables: ['order_number', 'tracking_url'],
    },
    {
      key: 'shipment.delivery_notification',
      label: 'Delivery Notification',
      type: 'TRANSACTIONAL',
      source: 'SHIPPING_SERVICE',
      variables: ['order_number', 'tracking_url'],
    },
    {
      key: 'shipment.delayed',
      label: 'Shipment Delayed',
      type: 'TRANSACTIONAL',
      source: 'SHIPPING_SERVICE',
      variables: ['order_number', 'tracking_url', 'delay_reason'],
    },
    {
      key: 'shipment.rescheduled',
      label: 'Shipment Rescheduled',
      type: 'TRANSACTIONAL',
      source: 'SHIPPING_SERVICE',
      variables: ['order_number', 'tracking_url', 'new_delivery_date'],
    },
    {
      key: 'shipment.returned',
      label: 'Shipment Returned',
      type: 'TRANSACTIONAL',
      source: 'SHIPPING_SERVICE',
      variables: ['order_number', 'tracking_url'],
    },
  ],
  MARKETING: [
    {
      key: 'marketing.campaign',
      label: 'Marketing Campaign',
      type: 'MARKETING',
      source: 'SYSTEM',
      variables: ['customer_name', 'offer_text', 'store_url'],
    },
  ],
};

export const ALL_EVENTS = Object.values(WHATSAPP_EVENTS).flat();
