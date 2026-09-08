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
  let q = await db.from('orders').select('id,order_number,confirmed_order_number,delivery_postcode,shipping_postcode,payment_status').eq('order_number', reference).limit(2);
  if (q.data?.length === 1) return q.data[0];
  q = await db.from('orders').select('id,order_number,confirmed_order_number,delivery_postcode,shipping_postcode,payment_status').eq('confirmed_order_number', reference).limit(2);
  return q.data?.length === 1 ? q.data[0] : null;
}

async function recoverShipmentForExactOrder(db: any, c: ParsedCharge, order: any) {
  if (!order?.id || !c.consignment_number || order.payment_status !== 'paid') return null;

  const existing = await db.from('shipments').select('id,order_id').eq('carrier', 'dhl')
    .or(`tracking_number.eq.${c.consignment_number},carrier_reference.eq.${c.consignment_number}`).limit(2);
  if (existing.error) throw existing.error;
  if (existing.data?.length === 1) return existing.data[0];
  if ((existing.data || []).length > 1) return null;

  const orderRow = await db.from('orders').select('id,order_number,customer_name,customer_email,customer_phone,company_name,delivery_address,delivery_city,delivery_postcode,shipping_address_line1,shipping_city,shipping_postcode,total_weight_kg,payment_status').eq('id', order.id).maybeSingle();
  if (orderRow.error || !orderRow.data || orderRow.data.payment_status !== 'paid') return null;
  const senderRow = await db.from('sender_profiles').select('company_name,name,contact_name,address_line1,city,postcode,phone').eq('is_default', true).limit(1).maybeSingle();
  if (senderRow.error || !senderRow.data) return null;

  const o = orderRow.data, sender = senderRow.data;
  const postcode = String(o.delivery_postcode || o.shipping_postcode || c.recipient_postcode || '').trim();
  if (!postcode) return null;
  if (c.recipient_postcode && normalizePostcode(c.recipient_postcode) !== normalizePostcode(postcode)) return null;
  const bookedAt = c.job_date ? `${String(c.job_date).slice(0, 10)}T12:00:00.000Z` : new Date().toISOString();
  const weightGrams = Math.max(100, Math.round(Number(o.total_weight_kg || 0.5) * 1000));
  const now = new Date().toISOString();

  const inserted = await db.from('shipments').insert({
    order_id: o.id,
    carrier: 'dhl',
    service_type: 'standard',
    tracking_number: c.consignment_number,
    carrier_reference: c.consignment_number,
    shipment_number: `DHL-INV-${c.invoice_number || 'RECOVERED'}-${String(c.consignment_number).slice(-8)}`,
    status: 'label_created',
    shipping_cost: Number(c.net_cost_pence || 0),
    estimated_shipping_cost: null,
    actual_shipping_cost_net: Number(c.net_cost_pence || 0),
    actual_shipping_vat: Number(c.vat_pence || 0),
    actual_shipping_cost_gross: Number(c.gross_cost_pence || 0),
    shipping_cost_source: 'dhl_invoice',
    shipping_cost_reconciled_at: now,
    dhl_invoice_number: c.invoice_number || null,
    dhl_invoice_tax_point: c.tax_point || null,
    dhl_invoice_imported_at: now,
    shipping_cost_match_method: 'order_reference+postcode+invoice_recovered',
    shipping_cost_match_confidence: .98,
    weight_grams: weightGrams,
    sender_name: String(sender.company_name || sender.name || 'CentralHub'),
    sender_address: String(sender.address_line1 || ''),
    sender_city: String(sender.city || ''),
    sender_postcode: String(sender.postcode || ''),
    sender_phone: String(sender.phone || ''),
    recipient_name: String(o.customer_name || 'Customer'),
    recipient_company_name: o.company_name || null,
    recipient_address: String(o.delivery_address || o.shipping_address_line1 || c.recipient_address || ''),
    recipient_city: String(o.delivery_city || o.shipping_city || ''),
    recipient_postcode: postcode,
    recipient_phone: String(o.customer_phone || ''),
    recipient_email: o.customer_email || null,
    booked_at: bookedAt,
    metadata: { source: 'dhl_invoice_recovered', recovered_from_invoice: true, invoice_number: c.invoice_number || null, order_reference: c.order_reference || o.order_number, consignment_number: c.consignment_number, recovered_at: now },
    created_at: bookedAt,
    updated_at: now,
  }).select('id,order_id').single();
  if (inserted.error) {
    console.warn('[dhl-invoice-reconcile] Could not recover shipment for exact order reference', o.order_number, inserted.error.message);
    return null;
  }
  return inserted.data;
}

async function matchCharge(db: any, c: ParsedCharge) {
  if (!c.consignment_number) {
    return { status: 'unmatched', shipment_id: null, order_id: null, method: null, confidence: 0, notes: 'DHL charge has no consignment number.' };
  }

  const exact = await db.from('shipments')
    .select('id,order_id,recipient_postcode,recipient_address,booked_at,created_at,tracking_number,carrier_reference')
    .eq('carrier', 'dhl')
    .or(`tracking_number.eq.${c.consignment_number},carrier_reference.eq.${c.consignment_number}`).limit(3);
  if (exact.error) throw exact.error;
  const order = await orderByReference(db, c.order_reference);
  const shipments = exact.data || [];

  if (shipments.length > 1) return { status: 'conflict', shipment_id: null, order_id: order?.id || null, method: 'duplicate_consignment', confidence: 0, notes: 'More than one shipment matched the exact DHL consignment.' };
  if (shipments.length === 1) {
    const s = shipments[0];
    if (order?.id && s.order_id && order.id !== s.order_id) return { status: 'conflict', shipment_id: s.id, order_id: order.id, method: 'consignment_reference_conflict', confidence: 0, notes: 'Exact consignment and DHL order reference point to different orders.' };
    if (c.recipient_postcode && s.recipient_postcode && normalizePostcode(c.recipient_postcode) !== normalizePostcode(s.recipient_postcode)) {
      return { status: 'needs_review', shipment_id: null, order_id: s.order_id || order?.id || null, method: 'exact_consignment_postcode_mismatch', confidence: .75, notes: 'Consignment matched exactly but recipient postcode differs; cost was not auto-written.' };
    }
    const both = !!order?.id && order.id === s.order_id;
    return { status: 'matched', shipment_id: s.id, order_id: s.order_id || order?.id || null, method: both ? 'consignment+order_reference+postcode' : 'consignment+postcode', confidence: 1, notes: 'Exact DHL consignment matched; postcode check passed.' };
  }

  if (order?.id) {
    if (order.payment_status !== 'paid') {
      return { status: 'needs_review', shipment_id: null, order_id: order.id, method: 'order_reference_unpaid', confidence: .9, notes: 'Order reference exists but payment has not been received; no shipping cost was attached.' };
    }
    const orderPostcode = String(order.delivery_postcode || order.shipping_postcode || '');
    if (c.recipient_postcode && orderPostcode && normalizePostcode(c.recipient_postcode) !== normalizePostcode(orderPostcode)) {
      return { status: 'needs_review', shipment_id: null, order_id: order.id, method: 'order_reference_postcode_mismatch', confidence: .7, notes: 'Order reference matched, but postcode differed. Cost was not auto-written.' };
    }

    const q = await db.from('shipments').select('id,order_id,tracking_number,carrier_reference,recipient_postcode,recipient_address,booked_at,created_at').eq('carrier', 'dhl').eq('order_id', order.id).limit(10);
    if (q.error) throw q.error;
    if (!q.data?.length) {
      const recovered = await recoverShipmentForExactOrder(db, c, order);
      if (recovered?.id) return { status: 'matched', shipment_id: recovered.id, order_id: order.id, method: 'order_reference+postcode+invoice_recovered', confidence: .98, notes: 'Exact paid order reference and postcode matched an order with no shipment row; recovered an invoice-backed DHL shipment.' };
    }

    return { status: 'needs_review', shipment_id: null, order_id: order.id, method: 'different_consignment_for_order', confidence: .8, notes: 'Order reference matched but the existing shipment uses a different consignment. Kept separate to prevent unrelated DHL charges being collapsed onto one shipment.' };
  }

  // A DHL consignment is a unique financial identity. Postcode/address/date similarity may suggest a candidate,
  // but is never sufficient to write money onto an existing different consignment.
  if (c.job_date && c.recipient_postcode) {
    const job = new Date(`${c.job_date}T12:00:00Z`), from = new Date(job), to = new Date(job);
    from.setUTCDate(from.getUTCDate() - 7); to.setUTCDate(to.getUTCDate() + 7);
    const q = await db.from('shipments').select('id,order_id,recipient_postcode,recipient_address,booked_at,created_at,tracking_number,carrier_reference').eq('carrier', 'dhl').gte('created_at', from.toISOString()).lte('created_at', to.toISOString()).limit(200);
    if (q.error) throw q.error;
    const ranked = (q.data || []).map((s: any) => ({ s, confidence: score(c, s) })).filter((x: any) => x.confidence >= .8).sort((a: any, b: any) => b.confidence - a.confidence);
    if (ranked.length && (!ranked[1] || ranked[0].confidence - ranked[1].confidence >= .15)) {
      return { status: 'needs_review', shipment_id: null, order_id: ranked[0].s.order_id || null, method: 'similar_address_candidate_only', confidence: ranked[0].confidence, notes: 'Postcode/date/address found a candidate, but consignment differs. Candidate retained for review only; no cost was auto-written.' };
    }
  }

  return { status: 'unmatched', shipment_id: null, order_id: null, method: null, confidence: 0, notes: 'No exact consignment or exact paid order-reference recovery match.' };
}

async function reconcileShipment(db: any, shipmentId: string, c: ParsedCharge, match: any, importId: string) {
  const shipment = await db.from('shipments').select('tracking_number,carrier_reference,shipping_cost,estimated_shipping_cost,metadata').eq('id', shipmentId).single();
  if (shipment.error) throw shipment.error;
  const tracking = String(shipment.data?.tracking_number || '');
  const carrierRef = String(shipment.data?.carrier_reference || '');
  if (!tracking && !carrierRef) throw new Error('Cannot reconcile a DHL cost onto a shipment without a consignment/tracking identity');

  const rows = await db.from('dhl_invoice_charges')
    .select('consignment_number,net_cost_pence,vat_pence,gross_cost_pence')
    .eq('matched_shipment_id', shipmentId)
    .eq('match_status', 'matched');
  if (rows.error) throw rows.error;

  const exactRows = (rows.data || []).filter((x: any) => {
    const consignment = String(x.consignment_number || '');
    return !!consignment && (consignment === tracking || consignment === carrierRef);
  });
  if (!exactRows.length) throw new Error('No exact-consignment DHL charge exists for the shipment; refusing to write shipping cost');

  const totals = exactRows.reduce((a: any, x: any) => ({ net: a.net + Number(x.net_cost_pence || 0), vat: a.vat + Number(x.vat_pence || 0), gross: a.gross + Number(x.gross_cost_pence || 0) }), { net: 0, vat: 0, gross: 0 });
  const now = new Date().toISOString();
  const metadata = { ...(shipment.data?.metadata || {}), dhl_invoice_reconciliation: { latest_invoice_number: c.invoice_number, latest_import_id: importId, exact_consignment: tracking || carrierRef, exact_charge_rows: exactRows.length, cumulative_net_pence: totals.net, cumulative_vat_pence: totals.vat, cumulative_gross_pence: totals.gross, match_method: match.method, match_confidence: match.confidence, reconciled_at: now } };
  const update = await db.from('shipments').update({
    estimated_shipping_cost: shipment.data?.estimated_shipping_cost ?? shipment.data?.shipping_cost ?? 0,
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

async function refreshImportStatus(db: any, importId: string) {
  const rows = await db.from('dhl_invoice_charges').select('match_status').eq('import_id', importId);
  if (rows.error) throw rows.error;
  const values = rows.data || [];
  const matched = values.filter((r: any) => r.match_status === 'matched').length;
  const unmatched = values.length - matched;
  const status = unmatched === 0 ? 'completed' : matched ? 'partial' : 'failed';
  const update = await db.from('dhl_invoice_imports').update({ shipments_matched: matched, shipments_unmatched: unmatched, status, processed_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: status === 'failed' ? 'No charges could be safely matched.' : null }).eq('id', importId);
  if (update.error) throw update.error;
}

export async function retryUnmatched(limit = 250) {
  const db = adminDb();
  const capped = Math.max(1, Math.min(Number(limit || 250), 1000));
  const rows = await db.from('dhl_invoice_charges').select('*').in('match_status', ['unmatched', 'needs_review']).order('created_at', { ascending: true }).limit(capped);
  if (rows.error) throw rows.error;

  let matched = 0; let stillUnmatched = 0; const touchedImports = new Set<string>(); const results: any[] = [];
  for (const row of rows.data || []) {
    const c = row as ParsedCharge;
    const match = await matchCharge(db, c);
    touchedImports.add(String(row.import_id));
    const update = await db.from('dhl_invoice_charges').update({ matched_shipment_id: match.shipment_id, matched_order_id: match.order_id, match_status: match.status, match_method: match.method, match_confidence: match.confidence, match_notes: match.notes, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (update.error) throw update.error;
    if (match.status === 'matched' && match.shipment_id) {
      matched++;
      await reconcileShipment(db, match.shipment_id, c, match, row.import_id);
    } else stillUnmatched++;
    results.push({ chargeId: row.id, consignment: c.consignment_number, orderReference: c.order_reference, status: match.status, method: match.method, confidence: match.confidence });
  }
  for (const importId of touchedImports) await refreshImportStatus(db, importId);
  return { examined: (rows.data || []).length, matched, stillUnmatched, results };
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
