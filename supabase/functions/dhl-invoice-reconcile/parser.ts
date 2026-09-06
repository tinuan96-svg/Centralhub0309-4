export type CsvRow = Record<string, string>;
export type ParsedCharge = {
  invoice_number: string | null; customer_account: string | null; tax_point: string | null;
  consignment_number: string | null; order_reference: string | null; job_date: string | null;
  service_code: string | null; service_desc: string | null; product_desc: string | null;
  recipient_address: string | null; recipient_postcode: string | null; weight_kg: number | null; items: number | null;
  base_cost_pence: number; fuel_surcharge_pence: number; hgv_surcharge_pence: number;
  other_surcharge_pence: number; net_cost_pence: number; vat_pence: number; gross_cost_pence: number;
  raw_rows: CsvRow[];
};

const money = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const maybeMoney = (v: unknown) => String(v ?? '').trim() === '' ? null : money(v);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
export const normalizePostcode = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const normalizeAddress = (v: unknown) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const normId = (v: unknown) => {
  const s = String(v || '').trim().replace(/\.0+$/, '').replace(/[^0-9A-Za-z-]/g, '');
  return s || null;
};
const date = (v: unknown) => {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const postcode = (outer: unknown, inner: unknown) => {
  const o = String(outer || '').trim().toUpperCase();
  const i = String(inner || '').trim().toUpperCase();
  const combined = `${o}${i}`.replace(/[^A-Z0-9]/g, '');
  return combined ? (i ? `${o} ${i}` : combined) : null;
};

function csvObjects(text: string): CsvRow[] {
  const matrix: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
      continue;
    }
    if (c === ',' && !quoted) { row.push(field); field = ''; continue; }
    if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) matrix.push(row);
      row = []; continue;
    }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) matrix.push(row); }
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(h => h.trim());
  return matrix.slice(1).map(values => Object.fromEntries(
    headers.map((h, i) => [h, (values[i] ?? '').trim()]).filter(([h]) => !!h)
  ));
}

function allocate(total: number, weights: number[]) {
  if (!weights.length) return [];
  if (!total) return weights.map(() => 0);
  const sign = total < 0 ? -1 : 1, abs = Math.abs(total);
  const safe = weights.map(w => Math.max(0, Number(w) || 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  const raw = safe.map(w => sum ? abs * w / sum : abs / safe.length);
  const out = raw.map(Math.floor);
  let remaining = abs - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, f: v - out[i] })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let n = 0; n < remaining; n++) out[order[n % order.length].i]++;
  return out.map(v => v * sign);
}

export function parseDhlInvoice(text: string) {
  const rows = csvObjects(text), charges: ParsedCharge[] = [], extras: CsvRow[] = [];
  let summary: CsvRow | null = null;
  for (const r of rows) {
    const consignment = normId(r['Consignment']);
    const isSummary = String(r['Sub Total'] || '').trim() !== '' || String(r['Amount Due'] || '').trim() !== '';
    if (consignment) {
      const base = money(r['Value']);
      charges.push({
        invoice_number: normId(r['Invoice']), customer_account: String(r['Customer'] || '').trim() || null,
        tax_point: date(r['Tax Point']), consignment_number: consignment,
        order_reference: String(r['Reference'] || '').trim() || null, job_date: date(r['Job Date']),
        service_code: String(r['Service'] || '').replace(/\.0+$/, '').trim() || null,
        service_desc: String(r['Service Desc'] || '').trim() || null,
        product_desc: String(r['Product Desc'] || '').trim() || null,
        recipient_address: String(r['Address'] || '').trim() || null,
        recipient_postcode: postcode(r['Outer'], r['Inner']), weight_kg: num(r['Weight']), items: num(r['Items']),
        base_cost_pence: base, fuel_surcharge_pence: 0, hgv_surcharge_pence: 0, other_surcharge_pence: 0,
        net_cost_pence: base, vat_pence: 0, gross_cost_pence: base, raw_rows: [r],
      });
      continue;
    }
    if (isSummary) { summary = r; continue; }
    if (String(r['Value'] || '').trim() !== '') extras.push(r);
  }

  if (charges.length) {
    const baseWeights = charges.map(c => Math.max(0, Math.abs(c.base_cost_pence)));
    const itemWeights = charges.map(c => Math.max(1, Number(c.items) || 1));
    for (const r of extras) {
      const total = money(r['Value']), desc = String(r['Service Desc'] || '').toLowerCase();
      const allocations = allocate(total, desc.includes('hgv') ? itemWeights : baseWeights);
      charges.forEach((c, i) => {
        const v = allocations[i] || 0;
        if (desc.includes('fuel')) c.fuel_surcharge_pence += v;
        else if (desc.includes('hgv')) c.hgv_surcharge_pence += v;
        else c.other_surcharge_pence += v;
        c.net_cost_pence += v;
        c.raw_rows.push({ ...r, __allocated_pence: String(v) });
      });
    }
    const invoiceVat = maybeMoney(summary?.['VAT Amount']);
    if (invoiceVat !== null) {
      const vat = allocate(invoiceVat, charges.map(c => Math.max(0, Math.abs(c.net_cost_pence))));
      charges.forEach((c, i) => { c.vat_pence = vat[i] || 0; c.gross_cost_pence = c.net_cost_pence + c.vat_pence; });
    }
  }

  return {
    rows, charges,
    invoice_number: charges[0]?.invoice_number || null,
    customer_account: charges[0]?.customer_account || null,
    tax_point: charges[0]?.tax_point || null,
    subtotal_net_pence: maybeMoney(summary?.['Sub Total']),
    vat_pence: maybeMoney(summary?.['VAT Amount']),
    amount_due_pence: maybeMoney(summary?.['Amount Due']),
  };
}
