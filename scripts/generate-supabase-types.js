const fs = require('fs');
const schema = JSON.parse(fs.readFileSync('extracted-schema.json', 'utf8'));

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
    } else if (col.format === 'text[]' || col.format === 'uuid[]') {
       type = col.format === 'text[]' ? 'string[]' : 'string[]';
    }
    ts += `          ${colName}: ${type}${col.nullable ? ' | null' : ''};\n`;
  }
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
    } else if (col.format === 'text[]' || col.format === 'uuid[]') {
       type = col.format === 'text[]' ? 'string[]' : 'string[]';
    }
    ts += `          ${colName}?: ${type}${col.nullable ? ' | null' : ''};\n`;
  }
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
    } else if (col.format === 'text[]' || col.format === 'uuid[]') {
       type = col.format === 'text[]' ? 'string[]' : 'string[]';
    }
    ts += `          ${colName}?: ${type}${col.nullable ? ' | null' : ''};\n`;
  }
  ts += `        };\n`;
  ts += `      };\n`;
}

ts += `    };\n  };\n};\n`;

// Add common type exports
for (const tableName in schema) {
    const singularName = tableName.replace(/s$/, ''); // Very naive singularization
    // Use the actual table name if it's more accurate
}

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
console.log('lib/supabase.ts updated');
