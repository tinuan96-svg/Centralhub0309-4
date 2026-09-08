import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as XLSX from "npm:xlsx@0.18.5"

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const MEDIA_BUCKET = 'whatsapp-media'
const AI_FILE_LIMIT = 15 * 1024 * 1024
const digits = (v: unknown) => String(v || '').replace(/[^0-9]/g, '')
const n = (v: any) => { if (v === null || v === undefined || v === '') return null; const x = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? Math.round(x * 100) / 100 : null }
const cleanDate = (v: any) => { if (!v) return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
const trimText = (v: any, max = 5000) => String(v || '').trim().slice(0, max)
const clamp01 = (v: any) => Math.max(0, Math.min(1, Number(v || 0)))

async function requireAdminOrService(req: Request, db: any) {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (bearer && serviceRole && bearer === serviceRole) return { mode: 'service' as const }
  if (!bearer) throw new Error('Authorization required')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
  const userClient = createClient(supabaseUrl, publishable, { global: { headers: { Authorization: `Bearer ${bearer}` } } })
  const { data: { user }, error } = await userClient.auth.getUser(bearer)
  if (error || !user) throw new Error('Invalid session')
  const { data: profile } = await db.from('user_profiles').select('profile_role,is_active').eq('id', user.id).maybeSingle()
  if (profile?.profile_role !== 'admin' || profile?.is_active === false) throw new Error('Admin access required')
  return { mode: 'admin' as const, user }
}

function bytesToBase64(bytes: Uint8Array) {
  let out = ''; const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  return btoa(out)
}
async function sha256Hex(bytes: Uint8Array) { const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('') }

async function loadMedia(db: any, item: any) {
  if (!item.media_storage_path) return { bytes: null, textPreview: '', localAnalysis: {} as any }
  const { data, error } = await db.storage.from(MEDIA_BUCKET).download(item.media_storage_path)
  if (error || !data) throw new Error(`Could not load stored WhatsApp media: ${error?.message || 'missing object'}`)
  const bytes = new Uint8Array(await data.arrayBuffer())
  const filename = String(item.media_filename || '').toLowerCase(), mime = String(item.media_mime_type || '').toLowerCase()
  const localAnalysis: any = { byte_size: bytes.byteLength }
  if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || /spreadsheet|excel/.test(mime)) {
    const workbook = XLSX.read(bytes, { type: 'array' }); localAnalysis.sheet_names = workbook.SheetNames
    const sheetName = workbook.SheetNames[0]; const rows = sheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) as any[] : []
    localAnalysis.sheet_name = sheetName || null; localAnalysis.row_count = rows.length; localAnalysis.columns = rows[0] ? Object.keys(rows[0]).slice(0, 60) : []
    localAnalysis.sample_rows = rows.slice(0, 120).map(row => { const clean: Record<string, unknown> = {}; for (const [key, value] of Object.entries(row).slice(0, 40)) clean[String(key).slice(0, 80)] = String(value ?? '').slice(0, 160); return clean })
    return { bytes, textPreview: `Spreadsheet preview:\n${JSON.stringify(localAnalysis).slice(0, 60000)}`, localAnalysis }
  }
  if (filename.endsWith('.csv') || filename.endsWith('.txt') || /^text\//.test(mime)) { const text = new TextDecoder().decode(bytes).slice(0, 90000); localAnalysis.text_chars = text.length; return { bytes, textPreview: text, localAnalysis } }
  return { bytes, textPreview: '', localAnalysis }
}

function outputText(data: any) { if (typeof data?.output_text === 'string') return data.output_text; const parts: string[] = []; for (const item of data?.output || []) for (const c of item?.content || []) if (typeof c?.text === 'string') parts.push(c.text); return parts.join('\n') }
function parseJsonLoose(text: string) { const raw = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim(); try { return JSON.parse(raw) } catch {}; const start = raw.indexOf('{'), end = raw.lastIndexOf('}'); if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1)); throw new Error('AI returned invalid JSON') }
function deterministicFallback(item: any, localAnalysis: any) {
  const t = `${item.message_text || ''} ${item.media_filename || ''}`.toLowerCase(); let intake_type = 'other', route_section = 'review'
  if (/price.?list|pricelist|stock.?list/.test(t) || localAnalysis?.row_count > 5) { intake_type = 'supplier_price_list'; route_section = 'suppliers_pricing' }
  else if (/credit.?note/.test(t)) { intake_type = 'credit_note'; route_section = 'finance' }
  else if (/payment.?receipt|payment.?confirmation|paid/.test(t)) { intake_type = 'payment_receipt'; route_section = 'finance' }
  else if (/invoice/.test(t)) { intake_type = 'invoice'; route_section = 'finance' }
  else if (/\bbill\b/.test(t)) { intake_type = 'bill'; route_section = 'finance' }
  else if (/receipt/.test(t)) { intake_type = 'receipt'; route_section = 'finance' }
  else if (/statement/.test(t)) { intake_type = 'statement'; route_section = 'finance' }
  else if (/delivery.?note|grn|goods.?received/.test(t)) { intake_type = 'delivery_note'; route_section = 'procurement' }
  else if (item.message_type === 'text' && item.message_text) { intake_type = 'instruction'; route_section = 'review' }
  return { intake_type, route_section, target_store_id: null, supplier_id: null, confidence: 0.35, summary: trimText(item.message_text || item.media_filename || 'WhatsApp admin item', 500), document: {}, accounting: {}, price_list: localAnalysis?.row_count ? { row_count: localAnalysis.row_count, columns: localAnalysis.columns || [] } : {}, instruction: {}, suggested_actions: ['Review manually before posting or applying any changes.'], reason: 'Deterministic fallback used because AI classification was unavailable.' }
}

async function classifyWithAI(db: any, item: any, media: any) {
  const key = Deno.env.get('OPENAI_API_KEY') || ''
  if (!key) return deterministicFallback(item, media.localAnalysis)
  const [{ data: stores }, { data: suppliers }, { data: ledgers }] = await Promise.all([
    db.from('stores').select('id,name,slug,domain').order('name'),
    db.from('suppliers').select('id,name,code,currency').eq('is_active', true).order('name').limit(500),
    db.from('finance_ledger_accounts').select('id,code,name,ledger_type,pnl_class,description').eq('is_active', true).order('code'),
  ])
  const context = { stores: stores || [], suppliers: suppliers || [], ledger_accounts: ledgers || [] }
  const developer = `You are CentralHub's private business-document intake classifier for a UK multi-store grocery operation.
Your job is extraction and routing only. Never execute financial, VAT, stock, pricing, supplier or marketing changes.
Never invent missing values. Use null when evidence is absent or ambiguous.
VAT must NEVER be marked recoverable/confirmed merely because a VAT amount appears. Treat it only as a candidate requiring evidence review.
Use target_store_id, supplier_id and suggested_ledger_account_id only from the provided allowed IDs.
If the billed business/store cannot be identified confidently, target_store_id must be null.
If a supplier cannot be identified confidently, supplier_id must be null.
For multi-period costs, identify possible prepayment/accrual treatment and benefit dates if shown.
For supplier price lists, do not recommend automatic product price updates; route them to supplier pricing review.
For instructions, summarize the requested action and route it; do not claim it has been executed.
Return ONLY valid JSON with exactly this shape:
{"intake_type":"invoice|bill|receipt|payment_receipt|statement|credit_note|order_confirmation|supplier_price_list|delivery_note|instruction|other","route_section":"finance|vat|suppliers_pricing|procurement|inventory|orders|marketing|customer_care|settings|review","target_store_id":string|null,"supplier_id":string|null,"confidence":number,"summary":string,"document":{"invoice_number":string|null,"document_reference":string|null,"payment_reference":string|null,"document_date":"YYYY-MM-DD"|null,"due_date":"YYYY-MM-DD"|null,"paid_date":"YYYY-MM-DD"|null,"currency":string|null,"amount_net":number|null,"vat_amount":number|null,"amount_gross":number|null,"amount_paid":number|null,"supplier_name":string|null,"customer_or_billed_entity":string|null,"supplier_vat_number":string|null},"accounting":{"suggested_ledger_account_id":string|null,"suggested_treatment":string|null,"benefit_start":"YYYY-MM-DD"|null,"benefit_end":"YYYY-MM-DD"|null,"vat_evidence_status":"not_applicable|candidate_only|insufficient|appears_complete","recoverable_vat_candidate":boolean},"price_list":{"row_count":number|null,"columns":array,"supplier_name":string|null,"notes":string|null},"instruction":{"requested_action":string|null,"high_risk":boolean,"notes":string|null},"suggested_actions":array,"reason":string}`
  const userText = `Allowed CentralHub entities:\n${JSON.stringify(context).slice(0, 60000)}\n\nWhatsApp sender: ${item.sender_name || ''} ${item.sender_phone || ''}\nMessage type: ${item.message_type}\nCaption/text: ${item.message_text || ''}\nFilename: ${item.media_filename || ''}\nMIME: ${item.media_mime_type || ''}\nLocal file analysis: ${media.textPreview || JSON.stringify(media.localAnalysis || {})}`
  const content: any[] = [{ type: 'input_text', text: userText }]; const bytes: Uint8Array | null = media.bytes; const mime = String(item.media_mime_type || '').toLowerCase(); const filename = String(item.media_filename || 'document')
  if (bytes && bytes.byteLength <= AI_FILE_LIMIT && !/spreadsheet|excel|csv|text/.test(mime) && !/\.(xlsx?|csv|txt)$/i.test(filename)) {
    const b64 = bytesToBase64(bytes); if (mime.startsWith('image/')) content.push({ type: 'input_image', image_url: `data:${mime || 'image/jpeg'};base64,${b64}`, detail: 'high' }); else if (mime === 'application/pdf' || /\.pdf$/i.test(filename)) content.push({ type: 'input_file', filename, file_data: b64 })
  }
  const model = Deno.env.get('OPENAI_MODEL_DOCUMENTS') || Deno.env.get('OPENAI_MODEL_DEFAULT') || 'gpt-5.6-luna'
  const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: [{ role: 'developer', content: [{ type: 'input_text', text: developer }] }, { role: 'user', content }], max_output_tokens: 2600 }) })
  const raw = await res.text(); let data: any = {}; try { data = raw ? JSON.parse(raw) : {} } catch { data = { raw } }
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI document analysis failed (${res.status})`)
  const parsed = parseJsonLoose(outputText(data)); const storeIds = new Set((stores || []).map((x: any) => x.id)); const supplierIds = new Set((suppliers || []).map((x: any) => x.id)); const ledgerIds = new Set((ledgers || []).map((x: any) => x.id))
  if (!storeIds.has(parsed.target_store_id)) parsed.target_store_id = null; if (!supplierIds.has(parsed.supplier_id)) parsed.supplier_id = null; parsed.accounting = parsed.accounting || {}; if (!ledgerIds.has(parsed.accounting.suggested_ledger_account_id)) parsed.accounting.suggested_ledger_account_id = null; parsed.confidence = clamp01(parsed.confidence); return parsed
}

async function sendAdminReply(db: any, item: any, channel: any, text: string) {
  const token = String(channel?.access_token || '').trim(), phoneNumberId = String(channel?.phone_number_id || '').trim(); if (!token || !phoneNumberId || !item.sender_phone) return null
  const versionRaw = String(Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v23.0').trim(); const version = /^v\d+\.\d+$/.test(versionRaw) ? versionRaw : `v${versionRaw.replace(/^v/i, '')}`
  const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: item.sender_phone, type: 'text', text: { preview_url: false, body: text.slice(0, 3500) } }) })
  const raw = await res.text(); let data: any = {}; try { data = raw ? JSON.parse(raw) : {} } catch {}; const messageId = data?.messages?.[0]?.id || null
  await db.from('whatsapp_admin_intake_items').update({ reply_wa_message_id: messageId, reply_status: res.ok ? 'sent' : 'failed', reply_error_message: res.ok ? null : (data?.error?.message || raw.slice(0, 500)), updated_at: new Date().toISOString() }).eq('id', item.id); return messageId
}
function financeDocumentType(type: string) { return ['invoice','bill','receipt','payment_receipt','statement','credit_note','order_confirmation'].includes(type) ? type : null }

async function createFinanceDocument(db: any, item: any, result: any, hash: string | null) {
  const type = financeDocumentType(result.intake_type); if (!type) return null
  if (hash) { const { data: duplicate } = await db.from('finance_documents').select('id,whatsapp_admin_intake_id').eq('attachment_hash', hash).limit(1).maybeSingle(); if (duplicate) { await db.from('whatsapp_admin_intake_items').update({ status: 'duplicate', duplicate_of_id: duplicate.whatsapp_admin_intake_id || null, finance_document_id: duplicate.id, updated_at: new Date().toISOString() }).eq('id', item.id); return { id: duplicate.id, duplicate: true } } }
  const d = result.document || {}, a = result.accounting || {}
  const payload: any = { store_id: result.target_store_id || null, supplier_id: result.supplier_id || null, source_type: 'whatsapp', document_type: type, sender_name: item.sender_name || null, subject: result.summary || item.message_text || item.media_filename || 'WhatsApp document', filename: item.media_filename || null, mime_type: item.media_mime_type || null, document_date: cleanDate(d.document_date), due_date: cleanDate(d.due_date), paid_date: cleanDate(d.paid_date), invoice_number: trimText(d.invoice_number, 120) || null, document_reference: trimText(d.document_reference, 160) || null, payment_reference: trimText(d.payment_reference, 160) || null, currency: trimText(d.currency || 'GBP', 8) || 'GBP', amount_net: n(d.amount_net), vat_amount: n(d.vat_amount), amount_gross: n(d.amount_gross), amount_paid: n(d.amount_paid), storage_path: item.media_storage_path || null, attachment_hash: hash || null, parse_status: 'needs_review', whatsapp_admin_intake_id: item.id, suggested_ledger_account_id: a.suggested_ledger_account_id || null, suggested_accounting_treatment: trimText(a.suggested_treatment, 2000) || null, classification_confidence: clamp01(result.confidence), extracted_metadata: { source: 'centralhub_whatsapp_admin_intake', intake_id: item.id, sender_phone: item.sender_phone, summary: result.summary || null, ai_result: result, vat_review_required: true, bank_match_review_required: true, no_automatic_posting: true }, updated_at: new Date().toISOString() }
  const { data: doc, error } = await db.from('finance_documents').insert(payload).select('id').single(); if (error) throw error; await db.from('whatsapp_admin_intake_items').update({ finance_document_id: doc.id }).eq('id', item.id); return { id: doc.id, duplicate: false }
}
async function notify(db: any, item: any, result: any) { const { error } = await db.from('system_notifications').insert({ user_id: null, store_id: result.target_store_id || null, title: 'WhatsApp admin intake ready', message: `${result.summary || result.intake_type || 'New item'} · ${Math.round(clamp01(result.confidence) * 100)}% confidence`, severity: result.confidence >= 0.8 ? 'info' : 'warning', category: 'finance', action_url: `/finance/admin-intake?item=${item.id}`, metadata: { source: 'whatsapp_admin_intake', intake_id: item.id, route_section: result.route_section } }); if (error) console.error('[Admin Intake] Notification save failed:', error.message) }

async function processItem(db: any, intakeId: string) {
  const { data: item, error } = await db.from('whatsapp_admin_intake_items').select('*').eq('id', intakeId).maybeSingle(); if (error) throw error; if (!item) throw new Error('Admin intake item not found'); if (item.status === 'rejected') throw new Error('Rejected sender cannot be processed')
  const { data: channel } = await db.from('whatsapp_channels').select('id,phone_number_id,access_token,admin_intake_enabled,authorized_sender_phones').eq('id', item.channel_id).maybeSingle(); if (!channel?.admin_intake_enabled) throw new Error('CentralHub admin intake channel is disabled')
  const allowed = new Set((channel.authorized_sender_phones || []).map((x: string) => digits(x))); if (!allowed.has(digits(item.sender_phone))) throw new Error('Sender is no longer authorised for CentralHub admin intake')
  await db.from('whatsapp_admin_intake_items').update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() }).eq('id', item.id)
  try {
    const media = await loadMedia(db, item); let hash = item.media_sha256 || null; if (!hash && media.bytes) hash = await sha256Hex(media.bytes); if (!hash && item.message_text) hash = await sha256Hex(new TextEncoder().encode(`text:${item.sender_phone}:${item.message_text}`))
    let result: any; try { result = await classifyWithAI(db, item, media) } catch (aiError: any) { console.error('[Admin Intake] AI classification failed:', aiError?.message || aiError); result = deterministicFallback(item, media.localAnalysis); result.ai_error = String(aiError?.message || aiError).slice(0, 1000) }
    const type = String(result.intake_type || 'other'), route = String(result.route_section || 'review'), confidence = clamp01(result.confidence); const ambiguous = !result.target_store_id && ['invoice','bill','receipt','payment_receipt','credit_note','supplier_price_list'].includes(type); const needsReview = ambiguous || confidence < 0.82 || !!result.ai_error
    const finance = await createFinanceDocument(db, item, result, hash); if (finance?.duplicate) { await sendAdminReply(db, item, channel, '♻️ CentralHub found this document already stored. I linked this WhatsApp message to the existing finance record instead of creating a duplicate.'); return { status: 'duplicate', finance_document_id: finance.id } }
    const update: any = { status: needsReview ? 'needs_review' : 'ready', intake_type: type, route_section: route, target_store_id: result.target_store_id || null, supplier_id: result.supplier_id || null, suggested_ledger_account_id: result.accounting?.suggested_ledger_account_id || null, confidence, media_sha256: hash, extracted_data: { ...result, local_file_analysis: media.localAnalysis || {}, review_first: true }, suggested_actions: Array.isArray(result.suggested_actions) ? result.suggested_actions : [], processed_at: new Date().toISOString(), error_message: result.ai_error || null, updated_at: new Date().toISOString() }
    await db.from('whatsapp_admin_intake_items').update(update).eq('id', item.id); await notify(db, item, result)
    const d = result.document || {}, amount = n(d.amount_gross), amountText = amount !== null ? ` · ${d.currency || 'GBP'} ${amount.toFixed(2)}` : '', storeText = result.target_store_id ? ' · store identified' : '', reviewText = needsReview ? 'Needs review before posting.' : 'Ready for review.', routeText = route === 'suppliers_pricing' ? 'Supplier Pricing' : route === 'finance' ? 'Finance' : route.replace(/_/g, ' ')
    await sendAdminReply(db, item, channel, `✅ CentralHub received and analysed this item.\n${result.summary || type}${amountText}${storeText}\nRoute: ${routeText}\n${reviewText}\nNo VAT, accounting, stock or price change has been posted automatically.`)
    return { status: update.status, intake_type: type, route_section: route, finance_document_id: finance?.id || null }
  } catch (error: any) {
    await db.from('whatsapp_admin_intake_items').update({ status: 'error', error_message: String(error?.message || error).slice(0, 1000), processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id)
    try { await sendAdminReply(db, item, channel, '⚠️ CentralHub stored your WhatsApp item but could not complete analysis. It is in the Admin Intake review queue. Nothing was posted automatically.') } catch {}
    throw error
  }
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors }); if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')
  try {
    const auth = await requireAdminOrService(req, db), body = await req.json().catch(() => ({})), action = String(body?.action || 'process'), intakeId = String(body?.intake_id || '').trim(); if (!intakeId) return json({ error: 'intake_id_required' }, 400)
    if (action === 'signed_url') { if (auth.mode !== 'admin') return json({ error: 'admin_access_required' }, 403); const { data: item } = await db.from('whatsapp_admin_intake_items').select('media_storage_path,media_filename,media_mime_type').eq('id', intakeId).maybeSingle(); if (!item?.media_storage_path) return json({ error: 'no_media' }, 404); const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(item.media_storage_path, 900); if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not create signed URL'); return json({ success: true, url: data.signedUrl, filename: item.media_filename, mime_type: item.media_mime_type }) }
    if (action === 'reprocess' && auth.mode !== 'admin') return json({ error: 'admin_access_required' }, 403); if (!['process','reprocess'].includes(action)) return json({ error: 'unsupported_action' }, 400); const result = await processItem(db, intakeId); return json({ success: true, result })
  } catch (error: any) { const msg = String(error?.message || error), status = /Authorization|session|Admin access/i.test(msg) ? 401 : 500; return json({ success: false, error: msg }, status) }
})
