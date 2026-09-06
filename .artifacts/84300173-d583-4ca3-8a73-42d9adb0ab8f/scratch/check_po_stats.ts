import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: pos } = await supabase.from('po_drafts').select('status');
  const map: any = {};
  pos?.forEach(p => map[p.status] = (map[p.status] || 0) + 1);
  console.log('PO Draft Statuses:', map);

  const { data: invs } = await supabase.from('supplier_invoices').select('status');
  const imap: any = {};
  invs?.forEach(i => imap[i.status] = (imap[i.status] || 0) + 1);
  console.log('Supplier Invoice Statuses:', imap);
}
check();
