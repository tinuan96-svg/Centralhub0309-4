const fs = require('fs');
const schema = JSON.parse(fs.readFileSync('extracted-schema.json', 'utf8'));

// Tables missing from OpenAPI spec but used in code
const missingTables = [
  'whatsapp_automations', 'warehouse_logs', 'order_packing', 'order_packing_items',
  'packing_material_transactions', 'pricing_suggestions', 'cost_history', 'profit_analytics',
  'campaign_opportunities', 'marketing_campaigns', 'marketing_assets',
  'marketing_performance', 'marketing_decisions', 'marketing_approval_queue',
  'marketing_simulation_results', 'marketing_economics', 'marketing_data_quality',
  'box_recommendations', 'purchase_orders', 'purchase_order_items', 'grn', 'grn_items',
  'product_bin_locations', 'payout_reconciliations', 'comm_idempotency_log',
  'kb_articles', 'kb_categories', 'product_price_history', 'competitor_price_history',
  'intelligence_recommendations', 'price_change_audit', 'price_alerts', 'stock_alerts'
];

for (const table of missingTables) {
  if (!schema[table]) {
    schema[table] = {
      columns: {
        id: { type: 'string', format: 'uuid', nullable: false },
        created_at: { type: 'string', format: 'timestamp with time zone', nullable: true },
        updated_at: { type: 'string', format: 'timestamp with time zone', nullable: true }
      }
    };
  }
}

let ts = `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(
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

export type Database = {
  public: {
    Tables: {
`;

for (const tableName in schema) {
  const table = schema[tableName];
  ts += `      ${tableName}: {\n`;
  ts += `        Row: {\n`;
  for (const colName in table.columns) {
    const col = table.columns[colName];
    let type = 'any';
    if (col.type === 'string') {
      type = 'string';
    } else if (col.type === 'integer' || col.type === 'number') {
      type = 'number';
    } else if (col.type === 'boolean') {
      type = 'boolean';
    } else if (col.format === 'jsonb') {
      type = 'any';
    } else if (col.format && (col.format.includes('[]'))) {
       type = 'string[]';
    }
    ts += `          ${colName}: ${type}${col.nullable ? ' | null' : ''};\n`;
  }
  ts += `          [key: string]: any;\n`;
  ts += `        };\n`;
  ts += `        Insert: {\n`;
  for (const colName in table.columns) {
    const col = table.columns[colName];
    let type = 'any';
     if (col.type === 'string') {
      type = 'string';
    } else if (col.type === 'integer' || col.type === 'number') {
      type = 'number';
    } else if (col.type === 'boolean') {
      type = 'boolean';
    } else if (col.format === 'jsonb') {
      type = 'any';
    } else if (col.format && (col.format.includes('[]'))) {
       type = 'string[]';
    }
    ts += `          ${colName}?: ${type}${col.nullable ? ' | null' : ''};\n`;
  }
  ts += `          [key: string]: any;\n`;
  ts += `        };\n`;
  ts += `        Update: {\n`;
  for (const colName in table.columns) {
    const col = table.columns[colName];
    let type = 'any';
     if (col.type === 'string') {
      type = 'string';
    } else if (col.type === 'integer' || col.type === 'number') {
      type = 'number';
    } else if (col.type === 'boolean') {
      type = 'boolean';
    } else if (col.format === 'jsonb') {
      type = 'any';
    } else if (col.format && (col.format.includes('[]'))) {
       type = 'string[]';
    }
    ts += `          ${colName}?: ${type}${col.nullable ? ' | null' : ''};\n`;
  }
  ts += `          [key: string]: any;\n`;
  ts += `        };\n`;
  // Add Relationships stubs to allow joined queries
  ts += `        Relationships: any[];\n`;
  ts += `      };\n`;
}

ts += `    };\n    Views: {\n      [key: string]: any;\n    };\n    Functions: {\n      [key: string]: any;\n    };\n    Enums: {\n      [key: string]: any;\n    };\n  };\n};\n`;

ts += `
export type Product = Database['public']['Tables']['products']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type Store = Database['public']['Tables']['stores']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type CentralInventory = Database['public']['Tables']['central_inventory']['Row'];
export type InventoryMovement = Database['public']['Tables']['inventory_movements']['Row'];
export type Shipment = Database['public']['Tables']['shipments']['Row'];
export type Brand = Database['public']['Tables']['brands']['Row'];
export type Supplier = Database['public']['Tables']['suppliers']['Row'];
export type SupplierInvoice = Database['public']['Tables']['supplier_invoices']['Row'];
export type WhatsAppConversation = Database['public']['Tables']['whatsapp_conversations']['Row'];
export type WhatsAppMessage = Database['public']['Tables']['whatsapp_messages']['Row'];
export type WhatsAppContact = Database['public']['Tables']['whatsapp_contacts']['Row'];
export type SupportTicket = Database['public']['Tables']['support_tickets']['Row'];
`;

fs.writeFileSync('lib/supabase.ts', ts);
console.log('lib/supabase.ts updated v3');
