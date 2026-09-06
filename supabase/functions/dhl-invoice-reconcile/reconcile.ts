import { adminDb } from './common.ts';
import { parseDhlInvoice, normalizeAddress, normalizePostcode, type ParsedCharge } from './parser.ts';

const sha256 = async (text: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
};

function similarity(a: unknown, b: unknown) {
  const A = new Set(normalizeAddress(a).split(' ').filter(Boolean));
  const B = new Set(normalizeAddress(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let overlap = 0; for (const x of A) if (B.has(x)) overlap++;
  return overlap / Math.max(A.size, B.size);
}
function dayDistance(a: string | null, b: string | null) {
  if (!a || !b) return 99;
  return Math.abs(new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime()) / 86400000;
}
function score(c: ParsedCharge, s: any) {
  let value = 0;
  if (c.recipient_postcode && normalizePostcode(c.recipient_postcode) === normalizePostcode(s.recipient_postcode)) value += .55;
  const d = dayDistance(c.job_date, s.booked_at || s.created_at);
  if (d <= 3) value += .25; else if (d <= 7) value += .12;
  const a = similarity(c.recipient_address, s.recipient_address);
  if (a >= .8) value += .2; else if (a >= .55) value += .12;
  return Math.min(1, value);
}
async function orderByReference(db: any, reference: string | null) {
  if (!reference) return null;
  let q = await db.from('orders').select('id,order_number,confirmed_order_number').eq('order_number', reference).limit(2);
  if (q.data?.length === 1) return q.data[0];
  q = await db.from('orders').select('id,order_number,confirmed_order_number').eq('confirmed_order_number', reference).limit(2);
  return q.data?.length === 1 ? q.data[0] : null;
}

async function matchCharge(db: any, c: ParsedCharge) {
  const exact = await db.from('shipments')
    .select('id,order_id,recipient_postcode,recipient_address,booked_at,created_at')
    .eq('carrier', 'dhl')
    .or(`tracking_number.eq.${c.consignment_number},carrier_reference.eq.${c.consignment_number}`).limit(3);
  if (exact.error) throw exact.error;
  const order = await orderByReference(db, c.order_reference);
  const shipments = exact.data || [];
  if (shipments.length > 1) return { status: 'conflict', shipment_id: null, order_id: order?.id || null, method: 'duplicate_consignment', confidence: 0, notes: 'More than one shipment matched the consignment.' };
  if (shipments.length === 1) {
    const s = shipments[0];
    if (order?.id && s.order_id && order.id !== s.order_id) return { status: 'conflict', shipment_id: s.id, order_id: order.id, method: 'consignment_reference_conflict', confidence: 0, notes: 'Consignment and DHL order reference point to different orders.' };
    const both = !!order?.id && order.id === s.order_id;
    return { status: 'matched', shipment_id: s.id, order_id: s.order_id || order?.id || null, method: both ? 'consignment+order_reference' : 'consignment', confidence: both ? 1 : .99, notes: 'Exact DHL consignment matched.' };
  }

  if (order?.id) {
    const q = await db.from('shipments').select('id,order_id,recipient_postcode,recipient_address,booked_at,created_at').eq('carrier', 'dhl').eq('order_id', order.id).limit(5);
    if (q.error) throw q.error;
    if (q.data?.length === 1) {
      const samePostcode = !c.recipient_postcode || normalizePostcode(c.recipient_postcode) === normalizePostcode(q.data[0].recipient_postcode);
      if (!samePostcode) return { status: 'needs_review', shipment_id: q.data[0].id, order_id: order.id, method: 'order_reference_postcode_mismatch', confidence: .7, notes: 'Order reference matched, but postcode differed. Cost was not auto-written.' };
      return { status: 'matched', shipment_id: q.data[0].id, order_id: order.id, method: 'order_reference+postcode', confidence: .97, notes: 'Exact order reference and postcode matched.' };
    }
  }

  if (!c.job_date || !c.recipient_postcode) return { status: order ? 'needs_review' : 'unmatched', shipment_id: null, order_id: order?.id || null, method: null, confidence: order ? .6 : 0, notes: 'No safe unique shipment match.' };
  const job = new Date(`${c.job_date}T12:00:00Z`), from = new Date(job), to = new Date(job);
  from.setUTCDate(from.getUTCDate() - 7); to.setUTCDate(to.getUTCDate() + 7);
  const q = await db.from('shipments').select('id,order_id,recipient_postcode,recipient_address,booked_at,created_at').eq('carrier', 'dhl').gte('created_at', from.toISOString()).lte('created_at', to.toISOString()).limit(200);
  if (q.error) throw q.error;
  const ranked = (q.data || []).map((s: any) => ({ s, confidence: score(c, s) })).filter((x: any) => x.confidence >= .8).sort((a: any, b: any) => b.confidence - a.confidence);
  if (ranked.length && (!ranked[1] || ranked[0].confidence - ranked[1].confidence >= .15)) return { status: 'matched', shipment_id: ranked[0].s.id, order_id: ranked[0].s.order_id || order?.id || null, method: 'postcode+date+address', confidence: ranked[0].confidence, notes: 'Unique fallback match using postcode, date and address.' };
  return { status: order ? 'needs_review' : 'unmatched', shipment_id: null, order_id: order?.id || null, method: order ? 'order_reference_without_unique_shipment' : null, confidence: order ? .6 : 0, notes: 'No unique high-confidence shipment match.' };
}

async function reconcileShipment(db: any, shipmentId: string, c: ParsedCharge, match: any, importId: string) {
  const rows = await db.from('dhl_invoice_charges').select('net_cost_pence,vat_pence,gross_cost_pence').eq('matched_shipment_id', shipmentId).eq('match_status', 'matched');
  if (rows.error) throw rows.error;
  const totals = (rows.data || []).reduce((a: any, x: any) => ({ net: a.net + Number(x.net_cost_pence || 0), vat: a.vat + Number(x.vat_pence || 0), gross: a.gross + Number(x.gross_cost_pence || 0) }), { net: 0, vat: 0, gross: 0 });
  const current = await db.from('shipments').select('shipping_cost,estimated_shipping_cost,metadata').eq('id', shipmentId).single();
  if (current.error) throw current.error;
  const now = new Date().toISOString();
  const metadata = { ...(current.data?.metadata || {}), dhl_invoice_reconciliation: { latest_invoice_number: c.invoice_number, latest_import_id: importId, cumulative_net_pence: totals.net, cumulative_vat_pence: totals.vat, cumulative_gross_pence: totals.gross, match_method: match.method, match_confidence: match.confidence, reconciled_at: now } };
  const update = await db.from('shipments').update({
    estimated_shipping_cost: current.data?.estimated_shipping_cost ?? current.data?.shipping_cost ?? 0,
    shipping_cost: totals.net,
    actual_shipping_cost_net: totals.net,
    actual_shipping_vat: totals.vat,
    actual_shipping_cost_gross: totals.gross,
    shipping_cost_source: 'dhl_invoice',
    shipping_cost_reconciled_at: now,
    dhl_invoice_number: c.invoice_number,
    dhl_invoice_tax_point: c.tax_point,
    dhl_invoice_imported_at: now,
    shipping_cost_match_method: match.method,
    shipping_cost_match_confidence: match.confidence,
    metadata,
    updated_at: now,
  }).eq('id', shipmentId);
  if (update.error) throw update.error;
}

export async function ingestCsv(p: any) {
  const db = adminDb(), csv = String(p.csv || ''), filename = String(p.filename || 'dhl-invoice.csv');
  if (!csv.trim()) throw new Error('CSV content is empty');
  const hash = await sha256(csv);
  const previous = await db.from('dhl_invoice_imports').select('*').eq('content_sha256', hash).maybeSingle();
  if (previous.data) return { success: true, duplicate: true, import: previous.data };
  const parsed = parseDhlInvoice(csv);
  if (!parsed.charges.length) throw new Error('No DHL consignment charge rows found');
  const created = await db.from('dhl_invoice_imports').insert({
    gmail_message_id: p.gmailMessageId || null, gmail_attachment_id: p.gmailAttachmentId || null,
    source_mailbox: p.sourceMailbox || null, filename, content_sha256: hash,
    invoice_number: parsed.invoice_number, customer_account: parsed.customer_account, tax_point: parsed.tax_point,
    subtotal_net_pence: parsed.subtotal_net_pence, vat_pence: parsed.vat_pence, amount_due_pence: parsed.amount_due_pence,
    rows_total: parsed.rows.length, status: 'processing', received_at: p.receivedAt || null, metadata: p.metadata || {},
  }).select('*').single();
  if (created.error) throw created.error;

  let matched = 0, unmatched = 0; const results: any[] = [];
  try {
    for (const c of parsed.charges) {
      const match = await matchCharge(db, c);
      const row = await db.from('dhl_invoice_charges').insert({
        import_id: created.data.id, ...c,
        matched_shipment_id: match.shipment_id, matched_order_id: match.order_id,
        match_status: match.status, match_method: match.method, match_confidence: match.confidence, match_notes: match.notes,
      }).select('id').single();
      if (row.error) throw row.error;
      if (match.status === 'matched' && match.shipment_id) { matched++; await reconcileShipment(db, match.shipment_id, c, match, created.data.id); }
      else unmatched++;
      results.push({ chargeId: row.data.id, consignment: c.consignment_number, orderReference: c.order_reference, netPence: c.net_cost_pence, vatPence: c.vat_pence, grossPence: c.gross_cost_pence, match });
    }
    const groupNet = parsed.charges.reduce((a, c) => a + c.net_cost_pence, 0), groupVat = parsed.charges.reduce((a, c) => a + c.vat_pence, 0);
    const reconciliation = { grouped_net_pence: groupNet, invoice_subtotal_pence: parsed.subtotal_net_pence, net_difference_pence: parsed.subtotal_net_pence == null ? null : groupNet - parsed.subtotal_net_pence, grouped_vat_pence: groupVat, invoice_vat_pence: parsed.vat_pence, vat_difference_pence: parsed.vat_pence == null ? null : groupVat - parsed.vat_pence };
    const status = unmatched === 0 ? 'completed' : matched ? 'partial' : 'failed';
    const done = await db.from('dhl_invoice_imports').update({ status, shipments_matched: matched, shipments_unmatched: unmatched, processed_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { ...(p.metadata || {}), reconciliation }, error_message: status === 'failed' ? 'No charges could be safely matched.' : null }).eq('id', created.data.id).select('*').single();
    if (done.error) throw done.error;
    return { success: true, duplicate: false, import: done.data, reconciliation, results };
  } catch (error: any) {
    await db.from('dhl_invoice_imports').update({ status: matched ? 'partial' : 'failed', shipments_matched: matched, shipments_unmatched: Math.max(unmatched, parsed.charges.length - matched), error_message: String(error?.message || error).slice(0, 2000), processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', created.data.id);
    throw error;
  }
}