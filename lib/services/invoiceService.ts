import { supabase } from '@/lib/supabase';

export interface SupplierInvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  pack_size: number;
  packs: number;
  line_total: number;
}

export interface SupplierInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  po_draft_id: string | null;
  status: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  shipping_cost: number;
  total_amount: number;
  amount_paid: number;
  currency: string;
  store_id: string | null;
  file_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  supplier_name?: string;
  items: SupplierInvoiceItem[];
}

export interface InvoiceSummary {
  total_outstanding: number;
  total_paid: number;
  total_overdue: number;
  count_draft: number;
  count_received: number;
  count_approved: number;
  count_paid: number;
  count_disputed: number;
}

export const INVOICE_STATUSES = ['draft','received','approved','paid','disputed','cancelled'] as const;

const PAYMENT_TERMS_DAYS: Record<string, number> = {
  'Net 15': 15,
  'Net 30': 30,
  'Net 60': 60,
  'Net 90': 90,
  'Due on Receipt': 0,
};

async function resolvePrivateInvoiceUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const publicMarker = '/storage/v1/object/public/';
      const signedMarker = '/storage/v1/object/sign/';
      if (url.pathname.includes(signedMarker)) return value;
      const idx = url.pathname.indexOf(publicMarker);
      if (idx >= 0) {
        const rest = url.pathname.slice(idx + publicMarker.length);
        const slash = rest.indexOf('/');
        if (slash > 0) {
          const bucket = rest.slice(0, slash);
          const path = decodeURIComponent(rest.slice(slash + 1));
          if (bucket === 'invoices' || bucket === 'supplier-invoices') {
            const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 15);
            if (!error) return data.signedUrl;
          }
        }
      }
    } catch {
      // Fall through to the original URL for legacy external documents.
    }
    return value;
  }

  let bucket = 'supplier-invoices';
  let objectPath = value;
  if (value.startsWith('invoices/')) {
    bucket = 'invoices';
    objectPath = value.slice('invoices/'.length);
  } else if (value.startsWith('supplier-invoices/')) {
    objectPath = value.slice('supplier-invoices/'.length);
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60 * 15);
  if (error) {
    console.warn('[InvoiceService] Could not create signed invoice URL:', error.message);
    return null;
  }
  return data.signedUrl;
}

class InvoiceService {
  async getAllInvoices(statusFilter?: string): Promise<SupplierInvoice[]> {
    let query = supabase
      .from('supplier_invoices')
      .select('*, suppliers!inner(name)')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) { console.error('getAllInvoices error:', error); return []; }
    if (!data) return [];

    return data.map((row: any) => ({
      ...row,
      supplier_name: row.suppliers?.name || 'Unknown',
      items: []
    })) as SupplierInvoice[];
  }

  async getInvoiceById(id: string): Promise<SupplierInvoice | null> {
    const { data, error } = await supabase
      .from('supplier_invoices')
      .select('*, suppliers!inner(name, payment_terms, currency)')
      .eq('id', id)
      .maybeSingle();

    if (error) { console.error('getInvoiceById error:', error); return null; }
    if (!data) return null;

    const [{ data: items, error: itemsError }, signedFileUrl] = await Promise.all([
      supabase.from('supplier_invoice_items').select('*').eq('invoice_id', id).order('created_at', { ascending: true }),
      resolvePrivateInvoiceUrl((data as any).file_url)
    ]);

    if (itemsError) console.error('getInvoiceById items error:', itemsError);

    return {
      ...data,
      supplier_name: (data as any).suppliers?.name || 'Unknown',
      file_url: signedFileUrl,
      items: items || [],
    } as SupplierInvoice;
  }

  async getSummary(): Promise<InvoiceSummary> {
    const { data, error } = await supabase.from('supplier_invoices').select('status, total_amount, amount_paid, due_date');
    if (error) { console.error('getSummary error:', error); return this.emptySummary(); }
    if (!data) return this.emptySummary();

    const summary: InvoiceSummary = {
      total_outstanding: 0,
      total_paid: 0,
      total_overdue: 0,
      count_draft: 0,
      count_received: 0,
      count_approved: 0,
      count_paid: 0,
      count_disputed: 0,
    };
    const today = new Date().toISOString().split('T')[0];

    for (const inv of data as any[]) {
      const outstanding = Number(inv.total_amount) - Number(inv.amount_paid);
      if (inv.status === 'paid') summary.total_paid += Number(inv.total_amount);
      else if (inv.status !== 'cancelled' && inv.status !== 'draft') {
        summary.total_outstanding += outstanding;
        if (inv.due_date && inv.due_date < today) summary.total_overdue += outstanding;
      }
      switch (inv.status) {
        case 'draft': summary.count_draft++; break;
        case 'received': summary.count_received++; break;
        case 'approved': summary.count_approved++; break;
        case 'paid': summary.count_paid++; break;
        case 'disputed': summary.count_disputed++; break;
      }
    }
    return summary;
  }

  private emptySummary(): InvoiceSummary {
    return { total_outstanding: 0, total_paid: 0, total_overdue: 0, count_draft: 0, count_received: 0, count_approved: 0, count_paid: 0, count_disputed: 0 };
  }

  async createInvoice(invoice: {
    invoice_number: string;
    supplier_id: string;
    po_draft_id?: string | null;
    invoice_date?: string;
    due_date?: string | null;
    tax_amount?: number;
    shipping_cost?: number;
    currency?: string;
    store_id?: string | null;
    file_url?: string | null;
    notes?: string;
    items: { product_id?: string | null; product_name: string; quantity: number; unit_cost: number; pack_size?: number; packs?: number }[];
  }): Promise<string | null> {
    const subtotal = invoice.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
    const tax = invoice.tax_amount || 0;
    const shipping = invoice.shipping_cost || 0;
    const total = subtotal + tax + shipping;

    let dueDate = invoice.due_date;
    if (!dueDate) {
      const { data: supplier } = await supabase.from('suppliers').select('payment_terms').eq('id', invoice.supplier_id).maybeSingle();
      const terms = (supplier as any)?.payment_terms || 'Net 30';
      const days = PAYMENT_TERMS_DAYS[terms] ?? 30;
      const baseDate = invoice.invoice_date ? new Date(invoice.invoice_date) : new Date();
      baseDate.setDate(baseDate.getDate() + days);
      dueDate = baseDate.toISOString().split('T')[0];
    }

    const { data: invoiceRow, error: invoiceError } = await supabase
      .from('supplier_invoices')
      .insert({
        invoice_number: invoice.invoice_number,
        supplier_id: invoice.supplier_id,
        po_draft_id: invoice.po_draft_id || null,
        status: 'draft',
        invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
        due_date: dueDate,
        subtotal,
        tax_amount: tax,
        shipping_cost: shipping,
        total_amount: total,
        amount_paid: 0,
        currency: invoice.currency || 'USD',
        store_id: invoice.store_id || null,
        file_url: invoice.file_url || null,
        notes: invoice.notes || null,
      })
      .select()
      .maybeSingle();

    if (invoiceError || !invoiceRow) { console.error('createInvoice error:', invoiceError); return null; }

    const itemsToInsert = invoice.items.map(item => ({
      invoice_id: invoiceRow.id,
      product_id: item.product_id || null,
      product_name: item.product_name,
      quantity: item.quantity,
      received_quantity: 0,
      unit_cost: item.unit_cost,
      pack_size: item.pack_size || 1,
      packs: item.packs || Math.ceil(item.quantity / (item.pack_size || 1)),
      line_total: item.quantity * item.unit_cost,
    }));

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabase.from('supplier_invoice_items').insert(itemsToInsert);
      if (itemsError) {
        console.error('createInvoice items error:', itemsError);
        await supabase.from('supplier_invoices').delete().eq('id', invoiceRow.id);
        return null;
      }
    }
    return invoiceRow.id;
  }

  async updateInvoiceStatus(id: string, status: string): Promise<boolean> {
    const { error } = await supabase.from('supplier_invoices').update({ status }).eq('id', id);
    if (error) { console.error('updateInvoiceStatus error:', error); return false; }
    return true;
  }

  async recordPayment(id: string, amount: number): Promise<boolean> {
    const { data: invoice, error: fetchError } = await supabase.from('supplier_invoices').select('amount_paid, total_amount').eq('id', id).maybeSingle();
    if (fetchError || !invoice) { console.error('recordPayment fetch error:', fetchError); return false; }
    const newPaid = Number((invoice as any).amount_paid) + amount;
    const total = Number((invoice as any).total_amount);
    const updates: any = { amount_paid: newPaid, payment_status: newPaid >= total ? 'paid' : 'partial' };
    if (newPaid >= total) updates.status = 'paid';
    const { error } = await supabase.from('supplier_invoices').update(updates).eq('id', id);
    if (error) { console.error('recordPayment error:', error); return false; }
    return true;
  }

  async updateItemReceivedQty(itemId: string, receivedQty: number): Promise<boolean> {
    const { error } = await supabase.from('supplier_invoice_items').update({ received_quantity: receivedQty }).eq('id', itemId);
    if (error) { console.error('updateItemReceivedQty error:', error); return false; }
    return true;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    const { error } = await supabase.from('supplier_invoices').delete().eq('id', id);
    if (error) { console.error('deleteInvoice error:', error); return false; }
    return true;
  }

  async getPODraftsForSupplier(supplierId: string): Promise<{ id: string; total_amount: number; draft_items: any; trigger_reason: string | null; store_id?: string }[]> {
    const { data, error } = await supabase
      .from('po_drafts')
      .select('id, total_amount, draft_items, trigger_reason, store_id')
      .eq('supplier_id', supplierId)
      .in('status', ['draft', 'pending'])
      .order('created_at', { ascending: false });
    if (error) { console.error('getPODraftsForSupplier error:', error); return []; }
    return data || [];
  }
}

export const invoiceService = new InvoiceService();
