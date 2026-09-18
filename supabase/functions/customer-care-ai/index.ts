import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPPORT_CATEGORIES = ['refund','missing_order','wrong_item','damaged_item','delivery_issue','payment_issue','complaint','account_issue','other'] as const
const OPEN_TICKET_STATUSES = ['open','assigned','in_progress','waiting_customer','waiting_internal']

function isExplicitHumanHandoffRequest(value: unknown) {
  const text = String(value || '').trim().toLowerCase().replace(/[’‘]/g, "'")
  if (!text) return false
  const patterns = [
    /\b(connect|transfer|put|pass)\s+(me\s+)?(to|through\s+to|over\s+to)\s+(an?\s+)?(agent|human|person|representative|advisor|adviser|support\s+agent)\b/i,
    /\b(speak|talk|chat)\s+(to|with)\s+(an?\s+)?(agent|human|real\s+person|representative|advisor|adviser|someone|support\s+agent)\b/i,
    /\b(human|live)\s+(agent|support|advisor|adviser|representative)\b/i,
    /\b(customer\s+(service|support)|support\s+team)\b/i,
    /(?:ഏജന്റ്|മനുഷ്യ\w*\s*(?:ആള|സപ്പോർട്ട്)|കസ്റ്റമർ\s*കെയർ|സപ്പോർട്ട്\s*ടീം)/iu,
  ]
  return patterns.some((pattern) => pattern.test(text))
}

async function sendExistingCentralHubNotification(notificationId: string) {
  const siteUrl = (Deno.env.get('CENTRALHUB_SITE_URL') || 'https://centralhub.network').replace(/\/$/, '')
  const pushSecret = Deno.env.get('CENTRALHUB_PUSH_API_SECRET') || ''
  if (!pushSecret || !notificationId) return
  try {
    const response = await fetch(`${siteUrl}/api/push/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pushSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId }),
    })
    if (!response.ok) console.error('[AI Escalation] Phone push failed:', response.status, await response.text().catch(() => ''))
  } catch (error: any) {
    console.error('[AI Escalation] Phone push request failed:', error?.message || error)
  }
}

async function notifyAdmin(db: any, p: { storeId:string; title:string; message:string; actionUrl:string; metadata?:any }) {
  const metadata = { ...(p.metadata || {}) }
  if (!metadata.dedupe_key && metadata.ticket_id) metadata.dedupe_key = `AI_ESCALATION:${metadata.ticket_id}`
  const { data: notification, error } = await db.from('system_notifications').insert({
    user_id: null,
    store_id: p.storeId,
    title: p.title,
    message: p.message,
    severity: 'warning',
    category: 'support',
    action_url: p.actionUrl,
    metadata,
  }).select('id').single()
  if (error) {
    if (error.code !== '23505') console.error('[AI Escalation] Notification error:', error.message)
    return
  }
  if (notification?.id) await sendExistingCentralHubNotification(notification.id)
}

async function getLatestInboundMessageId(db: any, conversationId: string) {
  const { data } = await db.from('whatsapp_messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

async function ensureSupportTicket(db:any, p:{
  storeId:string
  conversationId:string
  contactId:string
  category:string
  reason:string
  triggerMessageId?:string|null
  notificationTitle?:string
  notificationType?:string
}) {
  const [{ data: existing }, { data: contact }] = await Promise.all([
    db.from('support_tickets')
      .select('id,status')
      .eq('store_id', p.storeId)
      .eq('conversation_id', p.conversationId)
      .in('status', OPEN_TICKET_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('whatsapp_contacts')
      .select('customer_id,display_name,phone_number')
      .eq('id', p.contactId)
      .maybeSingle(),
  ])

  const triggerMessageId = p.triggerMessageId || await getLatestInboundMessageId(db, p.conversationId)
  const now = new Date().toISOString()

  if (existing) {
    await Promise.all([
      db.from('support_tickets').update({ priority: 'high', updated_at: now }).eq('id', existing.id),
      db.from('whatsapp_conversations').update({ status: 'waiting', handling_mode: 'AI_DRAFT', updated_at: now }).eq('id', p.conversationId),
    ])
    await notifyAdmin(db, {
      storeId: p.storeId,
      title: p.notificationTitle || 'Customer enquiry needs attention',
      message: `${contact?.display_name || contact?.phone_number || 'Customer'} needs human assistance. ${p.reason}`,
      actionUrl: `/customer-care/tickets?ticket=${existing.id}`,
      metadata: {
        type: p.notificationType || 'customer_support_escalation',
        ticket_id: existing.id,
        conversation_id: p.conversationId,
        contact_id: p.contactId,
        message_id: triggerMessageId,
        category: p.category,
        dedupe_key: triggerMessageId ? `AI_ESCALATION_MESSAGE:${triggerMessageId}` : `AI_ESCALATION:${existing.id}`,
      },
    })
    return { ticket: existing, created: false }
  }

  const { data: ticket, error } = await db.from('support_tickets').insert({
    store_id: p.storeId,
    customer_id: contact?.customer_id || null,
    contact_id: p.contactId,
    conversation_id: p.conversationId,
    category: SUPPORT_CATEGORIES.includes(p.category as any) ? p.category : 'other',
    priority: 'high',
    status: 'open',
    subject: p.notificationType === 'customer_human_handoff' ? 'Customer requested a human agent' : `AI escalation: ${p.category}`,
    description: p.reason,
    ai_summary: p.reason,
  }).select('id,status').single()
  if (error) throw error

  await db.from('whatsapp_conversations')
    .update({ status: 'waiting', handling_mode: 'AI_DRAFT', updated_at: now })
    .eq('id', p.conversationId)

  await notifyAdmin(db, {
    storeId: p.storeId,
    title: p.notificationTitle || 'Customer enquiry needs attention',
    message: `${contact?.display_name || contact?.phone_number || 'Customer'} needs human assistance. ${p.reason}`,
    actionUrl: `/customer-care/tickets?ticket=${ticket.id}`,
    metadata: {
      type: p.notificationType || 'customer_support_escalation',
      ticket_id: ticket.id,
      conversation_id: p.conversationId,
      contact_id: p.contactId,
      message_id: triggerMessageId,
      category: p.category,
      dedupe_key: triggerMessageId ? `AI_ESCALATION_MESSAGE:${triggerMessageId}` : `AI_ESCALATION:${ticket.id}`,
    },
  })
  return { ticket, created: true }
}

const PRODUCT_SEARCH_STOP_WORDS = new Set(['a','an','and','any','are','available','can','do','for','have','i','in','is','me','of','please','show','some','the','u','want','we','with','you'])

function normalizeProductSearchText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y'
      if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
      return word
    })
    .join(' ')
}

function productSearchTokens(value: unknown) {
  return normalizeProductSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !PRODUCT_SEARCH_STOP_WORDS.has(token))
}

function productMatchScore(product: any, rawQuery: unknown) {
  const tokens = productSearchTokens(rawQuery)
  if (!tokens.length) return 0
  const name = normalizeProductSearchText(product?.name)
  const brand = normalizeProductSearchText(product?.brand)
  const haystack = `${name} ${brand}`.trim()
  let score = 0
  for (const token of tokens) {
    if (name.includes(token)) score += 5
    else if (brand.includes(token)) score += 3
  }
  if (tokens.every((token) => haystack.includes(token))) score += 20
  const query = normalizeProductSearchText(rawQuery)
  if (query && (name === query || haystack === query)) score += 30
  return score
}

function getStoreProductCredentials(slugValue: unknown) {
  const slug = String(slugValue || '').trim().toLowerCase()
  if (slug === 'malluspices') {
    return {
      url: Deno.env.get('MALLUSPICES_SUPABASE_URL') || '',
      key: Deno.env.get('MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY') || '',
    }
  }
  if (slug === 'pocketgrocery') {
    return {
      url: Deno.env.get('POCKET_SUPABASE_URL') || '',
      key: Deno.env.get('POCKET_SUPABASE_SERVICE_ROLE_KEY') || '',
    }
  }
  if (slug === 'keralagrocery' || slug === 'keralagroceries') {
    return {
      url: Deno.env.get('KERALA_SUPABASE_URL') || Deno.env.get('SOURCE3_SUPABASE_URL') || '',
      key: Deno.env.get('KERALA_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SOURCE3_SUPABASE_SERVICE_ROLE_KEY') || '',
    }
  }
  return { url: '', key: '' }
}

function storefrontCurrentPrice(product: any) {
  for (const value of [product?.discounted_price, product?.selling_price, product?.sale_price, product?.price]) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

function normalizeStorefrontProduct(product: any) {
  const stock = Number(product?.stock_quantity ?? product?.stock ?? 0)
  const currentPrice = storefrontCurrentPrice(product)
  const regularPrice = Number(product?.price)
  return {
    id: product?.id || null,
    centralhub_product_id: product?.centralhub_product_id || null,
    name: product?.name || '',
    brand: product?.brand || null,
    current_price: currentPrice,
    regular_price: Number.isFinite(regularPrice) ? regularPrice : null,
    on_sale: currentPrice !== null && Number.isFinite(regularPrice) && currentPrice < regularPrice,
    stock_quantity: Number.isFinite(stock) ? stock : 0,
    available: product?.in_stock !== false && Number.isFinite(stock) && stock > 0,
    weight: product?.weight ?? null,
    unit: product?.unit ?? null,
    weight_grams: product?.weight_grams ?? null,
    gtin: product?.gtin ?? null,
  }
}

async function searchStorefrontProducts(db: any, params: { storeId: string; storeSlug?: string | null; query: string }) {
  const query = String(params.query || '').trim()
  if (!query) return { source: 'none', authoritative: false, query, products: [], error: 'Product search query is empty.' }

  const creds = getStoreProductCredentials(params.storeSlug)
  if (creds.url && creds.key) {
    try {
      const remote = createClient(creds.url, creds.key)
      const { data, error } = await remote.from('products')
        .select('id,centralhub_product_id,name,brand,price,sale_price,selling_price,discounted_price,stock_quantity,stock,in_stock,is_active,is_deleted,is_published,approval_status,visibility_status,weight,unit,weight_grams,gtin')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .eq('is_published', true)
        .eq('approval_status', 'approved')
        .eq('visibility_status', 'visible')
        .limit(300)

      if (error) throw error

      const products = (data || [])
        .map((product: any) => ({ product, score: productMatchScore(product, query) }))
        .filter((entry: any) => entry.score > 0)
        .sort((a: any, b: any) => b.score - a.score || String(a.product?.name || '').localeCompare(String(b.product?.name || '')))
        .map((entry: any) => normalizeStorefrontProduct(entry.product))
        .filter((product: any) => product.available)
        .slice(0, 10)

      return {
        source: 'storefront_database',
        authoritative: true,
        query,
        count: products.length,
        products,
      }
    } catch (error) {
      console.error('[Product Search] Storefront lookup failed:', error?.message || error)
    }
  }

  const { data: visibility, error: visibilityError } = await db.from('store_product_visibility')
    .select('product_id')
    .eq('store_id', params.storeId)
    .eq('is_visible', true)
    .limit(1000)

  if (visibilityError) {
    return { source: 'centralhub_fallback', authoritative: false, query, products: [], error: visibilityError.message }
  }

  const productIds = (visibility || []).map((row: any) => row.product_id).filter(Boolean)
  if (!productIds.length) {
    return {
      source: 'centralhub_fallback',
      authoritative: false,
      query,
      products: [],
      warning: 'No store-visible product mapping is available. Human confirmation is required.',
    }
  }

  const { data: products, error } = await db.from('products')
    .select('id,name,brand')
    .in('id', productIds)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .limit(500)

  if (error) return { source: 'centralhub_fallback', authoritative: false, query, products: [], error: error.message }

  const ranked = (products || [])
    .map((product: any) => ({ product, score: productMatchScore(product, query) }))
    .filter((entry: any) => entry.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10)
    .map((entry: any) => ({
      id: entry.product.id,
      name: entry.product.name,
      brand: entry.product.brand,
    }))

  return {
    source: 'centralhub_fallback',
    authoritative: false,
    query,
    count: ranked.length,
    products: ranked,
    warning: 'Storefront source-of-truth was unavailable. Do not state exact price or availability; create a support ticket if the customer needs confirmation.',
  }
}


async function getOrCreateWhatsappCart(db: any, p: { storeId: string; conversationId: string; contactId: string }) {
  const now = new Date().toISOString()
  const { data: existing, error: existingError } = await db.from('whatsapp_carts')
    .select('id,status,currency')
    .eq('store_id', p.storeId)
    .eq('conversation_id', p.conversationId)
    .maybeSingle()
  if (existingError) throw existingError

  if (existing) {
    if (existing.status === 'converted' || existing.status === 'abandoned') {
      await db.from('whatsapp_cart_items').delete().eq('cart_id', existing.id)
    }
    const { data: cart, error } = await db.from('whatsapp_carts')
      .update({
        contact_id: p.contactId,
        status: 'active',
        converted_order_id: null,
        updated_at: now,
        last_activity_at: now,
      })
      .eq('id', existing.id)
      .select('id,status,currency')
      .single()
    if (error) throw error
    return cart
  }

  const { data: cart, error } = await db.from('whatsapp_carts').insert({
    store_id: p.storeId,
    conversation_id: p.conversationId,
    contact_id: p.contactId,
    status: 'active',
    currency: 'GBP',
    updated_at: now,
    last_activity_at: now,
  }).select('id,status,currency').single()
  if (error) throw error
  return cart
}

async function readWhatsappCart(db: any, cartId: string) {
  const { data, error } = await db.from('whatsapp_cart_items')
    .select('id,storefront_product_id,centralhub_product_id,variant_id,product_name,brand,quantity,unit_price,regular_price,currency,stock_snapshot,product_url,image_url,created_at')
    .eq('cart_id', cartId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

function whatsappCartSummary(items: any[]) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0)
  return {
    currency: 'GBP',
    distinct_items: items.length,
    item_count: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    subtotal: Number(subtotal.toFixed(2)),
    items: items.map((item) => ({
      line_id: item.id,
      storefront_product_id: item.storefront_product_id,
      centralhub_product_id: item.centralhub_product_id,
      variant_id: item.variant_id,
      name: item.product_name,
      brand: item.brand,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      line_total: Number((Number(item.unit_price || 0) * Number(item.quantity || 0)).toFixed(2)),
      product_url: item.product_url,
    })),
    note: 'Delivery and any final offer adjustments are calculated and revalidated on the storefront at checkout.',
  }
}

async function getStorefrontProductForCart(params: { storeSlug?: string | null; storeDomain?: string | null; productId: string; variantId?: string | null }) {
  const creds = getStoreProductCredentials(params.storeSlug)
  if (!creds.url || !creds.key) return { error: 'This store is not enabled for WhatsApp cart checkout yet.' }

  const remote = createClient(creds.url, creds.key)
  const { data: product, error } = await remote.from('products')
    .select('id,centralhub_product_id,name,slug,brand,price,sale_price,selling_price,discounted_price,stock_quantity,stock,in_stock,is_active,is_deleted,is_published,approval_status,visibility_status,product_type,backorder_enabled,weight,unit,weight_grams,gtin,image_url,images')
    .eq('id', params.productId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .eq('is_published', true)
    .eq('approval_status', 'approved')
    .eq('visibility_status', 'visible')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!product) return { error: 'That product is no longer available on the storefront.' }

  const domain = String(params.storeDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const productUrl = domain && product.slug ? `https://${domain}/product/${product.slug}` : null

  if (product.product_type === 'variable') {
    const { data: variants, error: variantError } = await remote.from('product_variants')
      .select('id,label,variant_name,price,sale_price,discounted_price,stock_quantity,stock,in_stock,is_active,backorder_enabled,weight,unit,weight_grams')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (variantError) return { error: variantError.message }

    const availableVariants = (variants || []).filter((variant: any) => {
      const stock = Number(variant.stock_quantity ?? variant.stock ?? 0)
      return variant.backorder_enabled === true || (variant.in_stock !== false && stock > 0)
    }).map((variant: any) => {
      const currentPrice = storefrontCurrentPrice(variant)
      return {
        id: variant.id,
        label: variant.label || variant.variant_name || 'Option',
        current_price: currentPrice,
        regular_price: Number(variant.price),
        stock_quantity: Number(variant.stock_quantity ?? variant.stock ?? 0),
        backorder_enabled: variant.backorder_enabled === true,
        weight: variant.weight,
        unit: variant.unit,
      }
    })

    if (!params.variantId) {
      return {
        requires_variant: true,
        product: { id: product.id, name: product.name, brand: product.brand, product_url: productUrl },
        variants: availableVariants,
      }
    }

    const selected = (variants || []).find((variant: any) => variant.id === params.variantId)
    if (!selected) return { error: 'That product option is not available.' }

    const stock = Number(selected.stock_quantity ?? selected.stock ?? 0)
    const backorder = selected.backorder_enabled === true
    if (!backorder && (selected.in_stock === false || stock <= 0)) return { error: 'That product option is out of stock.' }

    const currentPrice = storefrontCurrentPrice(selected)
    if (currentPrice === null) return { error: 'Current price could not be confirmed.' }

    return {
      id: product.id,
      centralhub_product_id: product.centralhub_product_id || null,
      variant_id: selected.id,
      variant_name: selected.label || selected.variant_name || null,
      name: product.name,
      brand: product.brand || null,
      current_price: currentPrice,
      regular_price: Number(selected.price),
      stock_quantity: stock,
      max_quantity: backorder ? 99 : stock,
      backorder_enabled: backorder,
      product_url: productUrl,
      image_url: product.image_url || (Array.isArray(product.images) ? product.images[0] : null) || null,
    }
  }

  const stock = Number(product.stock_quantity ?? product.stock ?? 0)
  const backorder = product.backorder_enabled === true
  if (!backorder && (product.in_stock === false || stock <= 0)) return { error: 'That product is out of stock.' }

  const currentPrice = storefrontCurrentPrice(product)
  if (currentPrice === null) return { error: 'Current price could not be confirmed.' }

  return {
    id: product.id,
    centralhub_product_id: product.centralhub_product_id || null,
    variant_id: null,
    variant_name: null,
    name: product.name,
    brand: product.brand || null,
    current_price: currentPrice,
    regular_price: Number(product.price),
    stock_quantity: stock,
    max_quantity: backorder ? 99 : stock,
    backorder_enabled: backorder,
    product_url: productUrl,
    image_url: product.image_url || (Array.isArray(product.images) ? product.images[0] : null) || null,
  }
}

function encodeWhatsappCartPayload(items: any[]) {
  const payload = {
    v: 1,
    i: items.map((item) => ({
      p: item.storefront_product_id,
      q: Number(item.quantity),
      ...(item.variant_id ? { v: item.variant_id } : {}),
    })),
  }
  const raw = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const BASE_PROMPT = `You are the AI Sales & Customer Support Assistant for CentralHub stores.
You are speaking directly with a real customer on WhatsApp. Be professional, friendly, calm, helpful and concise. Never sound robotic, defensive or overly formal.
- Reply in the same language the customer uses, including Malayalam when appropriate.
- Customer service comes first. For complaints, payment problems, refunds, damaged/wrong/missing orders or other support issues, do not upsell.
- Never invent price, stock, order status, tracking, delivery timing, refund status or policy details. Use tools when current data is required.
- For order/tracking questions, use the supplied customer phone number or order number.
- For product questions, always use search_products before stating current price or availability. Treat only results with authoritative=true as customer-facing truth.
- For broad catalogue questions (for example pickles, rice, masalas), show several relevant in-stock options returned by search_products instead of choosing one arbitrary item.
- For short confirmations such as “yes”, “that one” or “this”, resolve the referenced product from the conversation and re-check that exact product with search_products before answering.
- Quote current_price from search_products as the current selling price. If on_sale=true and regular_price is higher, you may mention the regular price too.
- You can manage a store-scoped WhatsApp shopping cart with get_cart, add_to_cart, update_cart_item, remove_from_cart, clear_cart and create_checkout_link.
- Only add an item when the customer clearly chooses it. A short reply such as “yes” counts as consent when your immediately previous message clearly asked whether to add that exact product to the cart.
- After a cart change, briefly confirm what changed and give the current cart subtotal. Ask whether the customer wants to continue shopping or checkout.
- If a product requires a variant/size, use the options returned by add_to_cart and ask the customer which one they want before adding it.
- When the customer asks to checkout, pay, or complete the purchase, call create_checkout_link and send the returned checkout_url. The website revalidates live price, stock, offers, delivery and payment.
- Never claim the order is placed, paid, or confirmed from the WhatsApp cart itself. The order is only created by the storefront checkout flow.
- If the requested product/data cannot be found, or you do not have enough reliable information to answer, escalate to a human using create_support_ticket. Do not simply tell the customer to contact the store without creating the ticket.
- If the customer asks for something outside your available capabilities, requires a human decision, or reports a problem that cannot be resolved with the available tools, you MUST use create_support_ticket.
- Explicit requests to speak to a human/agent are handled deterministically before this prompt is called.
- After a ticket is created, tell the customer clearly that their request has been passed to the team and avoid promising an exact response time unless the knowledge base provides one.
- Never say a request was passed to the team, escalated, or ticketed unless create_support_ticket returned a ticket_id in this conversation turn.
- Do not claim an action was completed unless a tool confirms it.
- When the incoming message starts with [MEDIA_EVENT], acknowledge receipt and use its caption if present. Never claim to have viewed, heard or interpreted the media contents unless those contents are explicitly provided.
- Keep replies short enough for WhatsApp and make the next step obvious.`

serve(async(req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { message, conversationId, storeId, contactId, customerPhone } = await req.json()
    if (!message || !conversationId || !storeId || !contactId) throw new Error('message, conversationId, storeId and contactId are required')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const db = createClient(supabaseUrl, serviceRoleKey)
    const triggerMessageId = await getLatestInboundMessageId(db, conversationId)

    if (isExplicitHumanHandoffRequest(message)) {
      const reason = 'Customer explicitly requested to speak with a human support agent.'
      const tr = await ensureSupportTicket(db, {
        storeId, conversationId, contactId, category: 'other', reason, triggerMessageId,
        notificationTitle: 'Customer requested an agent',
        notificationType: 'customer_human_handoff',
      })
      return new Response(JSON.stringify({
        reply: 'I’ve passed your request to our support team. An agent will assist you as soon as possible.',
        escalated: true,
        ticket_id: tr.ticket.id,
        ticket_created: tr.created,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) throw new Error('OPENAI_API_KEY is not configured')

    const [{data:store},{data:settings},{data:history},{data:kbArticles}] = await Promise.all([
      db.from('stores').select('name,slug,domain').eq('id',storeId).maybeSingle(),
      db.from('customer_care_settings').select('ai_enabled,custom_knowledge').eq('store_id',storeId).maybeSingle(),
      db.from('whatsapp_messages').select('direction,message_text,created_at').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(20),
      db.from('kb_articles').select('title,content').eq('store_id',storeId).eq('is_published',true).order('updated_at',{ascending:false}).limit(25),
    ])
    if (settings?.ai_enabled === false) return new Response(JSON.stringify({ reply: null, disabled: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const recentMessages = (history || []).reverse().filter((m:any)=>m.message_text).map((m:any)=>({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.message_text }))
    const knowledge = (kbArticles || []).map((a:any)=>`- ${a.title}: ${a.content}`).join('\n')
    const context = [
      `STORE: ${store?.name || 'CentralHub store'}`,
      store?.domain ? `STORE WEBSITE: https://${String(store.domain).replace(/^https?:\/\//, '')}` : '',
      customerPhone ? `CUSTOMER WHATSAPP PHONE: ${customerPhone}` : '',
      settings?.custom_knowledge ? `STORE CUSTOM KNOWLEDGE:\n${settings.custom_knowledge}` : '',
      knowledge ? `STORE KNOWLEDGE BASE:\n${knowledge}` : '',
    ].filter(Boolean).join('\n\n')

    const tools = [
      {name:'get_latest_order',description:'Get the most recent order for this customer by phone number.',parameters:{type:'object',properties:{phone:{type:'string'}},required:['phone']}},
      {name:'get_tracking_status',description:'Get delivery tracking for an order number.',parameters:{type:'object',properties:{order_number:{type:'string'}},required:['order_number']}},
      {name:'search_products',description:'Search the CURRENT STORE storefront source-of-truth for customer-visible, approved, published, in-stock products and current selling prices. Use this for every product availability or price statement. Broad queries can return multiple options.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query']}},
      {name:'get_cart',description:'Get the current WhatsApp shopping cart for this conversation.',parameters:{type:'object',properties:{}}},
      {name:'add_to_cart',description:'Add a confirmed storefront product to the WhatsApp cart. Use storefront_product_id from search_products. For variable products, pass variant_id after the customer chooses an option.',parameters:{type:'object',properties:{storefront_product_id:{type:'string'},quantity:{type:'integer',minimum:1,maximum:99},variant_id:{type:'string'}},required:['storefront_product_id']}},
      {name:'update_cart_item',description:'Set the quantity of an item already in the WhatsApp cart.',parameters:{type:'object',properties:{storefront_product_id:{type:'string'},quantity:{type:'integer',minimum:1,maximum:99},variant_id:{type:'string'}},required:['storefront_product_id','quantity']}},
      {name:'remove_from_cart',description:'Remove a product or selected variant from the WhatsApp cart.',parameters:{type:'object',properties:{storefront_product_id:{type:'string'},variant_id:{type:'string'}},required:['storefront_product_id']}},
      {name:'clear_cart',description:'Empty the WhatsApp cart. Only use after the customer clearly asks to clear/remove everything.',parameters:{type:'object',properties:{}}},
      {name:'create_checkout_link',description:'Create the independent storefront cart/checkout handoff link for the current WhatsApp cart. Use when the customer wants to checkout or pay.',parameters:{type:'object',properties:{}}},
      {name:'get_sales_recommendations',description:'Get relevant cross-sell recommendations for a product.',parameters:{type:'object',properties:{current_product_id:{type:'string'},intent_type:{type:'string',enum:['PRODUCT_SEARCH','REPEAT_PURCHASE','GENERAL_INQUIRY']}}}},
      {name:'create_support_ticket',description:'MANDATORY for requests the AI cannot reliably solve, including unsupported requests, unresolved product/data questions, complaints, refunds, payment problems, damaged/wrong/missing orders, delivery issues or human decisions. Creates or refreshes a ticket and alerts the admin.',parameters:{type:'object',properties:{category:{type:'string',enum:SUPPORT_CATEGORIES},reason:{type:'string'}},required:['category','reason']}},
      {name:'track_customer_interest',description:'Record product interest.',parameters:{type:'object',properties:{product_id:{type:'string'},interest_type:{type:'string',enum:['asked_about','recommended']}},required:['product_id','interest_type']}},
      {name:'analyze_basket_opportunities',description:'Check free-delivery threshold and bundle opportunity.',parameters:{type:'object',properties:{current_total:{type:'number'}},required:['current_total']}},
    ]

    const model = Deno.env.get('OPENAI_MODEL_CUSTOMER_CARE') || Deno.env.get('OPENAI_MODEL_DEFAULT') || 'gpt-4o'
      const messages = [{ role:'system', content:`${BASE_PROMPT}\n\n${context}` }, ...recentMessages]
      if (!recentMessages.length || recentMessages[recentMessages.length - 1]?.content !== message) messages.push({ role:'user', content:message })
    
      const openAiTools = tools.map((f)=>({type:'function',function:f}))
      let aiMessage = null
      let confirmedTicketId = null
      let lastToolCalls = []
      const MAX_TOOL_ROUNDS = 5
    
      async function runToolCall(call) {
        const name = call.function.name
        let args = {}
        try { args = JSON.parse(call.function.arguments || '{}') } catch {}
        let result = { error:'Unknown tool' }
    
        if (name === 'get_latest_order') {
          const phone = args.phone || customerPhone
          if (!phone) result = { error:'Customer phone number is unavailable' }
          else {
            const cleanPhone = String(phone).replace(/\s+/g,'').replace(/^\+/,'')
            const {data:order} = await db.from('orders')
              .select('order_number,order_status,total,created_at,tracking_number,last_tracking_status')
              .eq('store_id',storeId)
              .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%${phone}%`)
              .order('created_at',{ascending:false}).limit(1).maybeSingle()
            result = order || { error:'No order found for this customer' }
          }
        } else if (name === 'get_tracking_status') {
          const {data:order} = await db.from('orders')
            .select('order_number,order_status,tracking_number,last_tracking_status,carrier')
            .eq('store_id',storeId).eq('order_number',args.order_number).maybeSingle()
          result = order || { error:'Order not found' }
        } else if (name === 'search_products') {
          result = await searchStorefrontProducts(db, {
            storeId,
            storeSlug: store?.slug || null,
            query: String(args.query || ''),
          })
        } else if (name === 'get_cart') {
          try {
            const cart = await getOrCreateWhatsappCart(db, { storeId, conversationId, contactId })
            const items = await readWhatsappCart(db, cart.id)
            result = whatsappCartSummary(items)
          } catch (e:any) {
            result = { error: e?.message || 'Unable to load cart' }
          }
        } else if (name === 'add_to_cart') {
          try {
            const productId = String(args.storefront_product_id || '')
            const quantity = Math.max(1, Math.min(99, Number(args.quantity || 1)))
            if (!productId) throw new Error('Storefront product ID is required')
            const live = await getStorefrontProductForCart({
              storeSlug: store?.slug || null,
              storeDomain: store?.domain || null,
              productId,
              variantId: args.variant_id ? String(args.variant_id) : null,
            })
            if (live?.error || live?.requires_variant) {
              result = live
            } else if (!live?.id) {
              result = { error: 'Unable to confirm that product.' }
            } else if (!live.backorder_enabled && quantity > Number(live.max_quantity || 0)) {
              result = { error: `Only ${live.max_quantity} available right now.`, available_quantity: live.max_quantity }
            } else {
              const cart = await getOrCreateWhatsappCart(db, { storeId, conversationId, contactId })
              let existingQuery = db.from('whatsapp_cart_items')
                .select('id,quantity')
                .eq('cart_id', cart.id)
                .eq('storefront_product_id', live.id)
              existingQuery = live.variant_id ? existingQuery.eq('variant_id', live.variant_id) : existingQuery.is('variant_id', null)
              const { data: existing } = await existingQuery.maybeSingle()
              const targetQty = Math.min(99, Number(existing?.quantity || 0) + quantity)
              if (!live.backorder_enabled && targetQty > Number(live.max_quantity || 0)) {
                result = { error: `Only ${live.max_quantity} available right now.`, available_quantity: live.max_quantity }
              } else {
                const lineData = {
                  cart_id: cart.id,
                  storefront_product_id: live.id,
                  centralhub_product_id: live.centralhub_product_id || null,
                  variant_id: live.variant_id || null,
                  product_name: live.variant_name ? `${live.name} — ${live.variant_name}` : live.name,
                  brand: live.brand || null,
                  quantity: targetQty,
                  unit_price: Number(live.current_price),
                  regular_price: Number.isFinite(Number(live.regular_price)) ? Number(live.regular_price) : null,
                  currency: 'GBP',
                  stock_snapshot: Number(live.stock_quantity || 0),
                  product_url: live.product_url || null,
                  image_url: live.image_url || null,
                  updated_at: new Date().toISOString(),
                }
                if (existing?.id) {
                  const { error } = await db.from('whatsapp_cart_items').update(lineData).eq('id', existing.id)
                  if (error) throw error
                } else {
                  const { error } = await db.from('whatsapp_cart_items').insert(lineData)
                  if (error) throw error
                }
                await db.from('whatsapp_carts').update({ status:'active', updated_at:new Date().toISOString(), last_activity_at:new Date().toISOString() }).eq('id', cart.id)
                const items = await readWhatsappCart(db, cart.id)
                result = { added: true, product: { id: live.id, name: live.name, variant: live.variant_name || null, quantity: targetQty, unit_price: live.current_price }, cart: whatsappCartSummary(items) }
              }
            }
          } catch (e:any) {
            result = { error: e?.message || 'Unable to add item to cart' }
          }
        } else if (name === 'update_cart_item') {
          try {
            const productId = String(args.storefront_product_id || '')
            const quantity = Math.max(1, Math.min(99, Number(args.quantity || 1)))
            const variantId = args.variant_id ? String(args.variant_id) : null
            const cart = await getOrCreateWhatsappCart(db, { storeId, conversationId, contactId })
            let lineQuery = db.from('whatsapp_cart_items').select('id').eq('cart_id', cart.id).eq('storefront_product_id', productId)
            lineQuery = variantId ? lineQuery.eq('variant_id', variantId) : lineQuery.is('variant_id', null)
            const { data: line } = await lineQuery.maybeSingle()
            if (!line) {
              result = { error: 'That item is not currently in the cart.' }
            } else {
              const live = await getStorefrontProductForCart({ storeSlug: store?.slug || null, storeDomain: store?.domain || null, productId, variantId })
              if (live?.error || live?.requires_variant) result = live
              else if (!live.backorder_enabled && quantity > Number(live.max_quantity || 0)) result = { error: `Only ${live.max_quantity} available right now.`, available_quantity: live.max_quantity }
              else {
                const { error } = await db.from('whatsapp_cart_items').update({
                  quantity,
                  unit_price: Number(live.current_price),
                  regular_price: Number.isFinite(Number(live.regular_price)) ? Number(live.regular_price) : null,
                  stock_snapshot: Number(live.stock_quantity || 0),
                  updated_at: new Date().toISOString(),
                }).eq('id', line.id)
                if (error) throw error
                const items = await readWhatsappCart(db, cart.id)
                result = { updated: true, cart: whatsappCartSummary(items) }
              }
            }
          } catch (e:any) {
            result = { error: e?.message || 'Unable to update cart item' }
          }
        } else if (name === 'remove_from_cart') {
          try {
            const productId = String(args.storefront_product_id || '')
            const variantId = args.variant_id ? String(args.variant_id) : null
            const cart = await getOrCreateWhatsappCart(db, { storeId, conversationId, contactId })
            let deleteQuery = db.from('whatsapp_cart_items').delete().eq('cart_id', cart.id).eq('storefront_product_id', productId)
            deleteQuery = variantId ? deleteQuery.eq('variant_id', variantId) : deleteQuery.is('variant_id', null)
            const { error } = await deleteQuery
            if (error) throw error
            const items = await readWhatsappCart(db, cart.id)
            result = { removed: true, cart: whatsappCartSummary(items) }
          } catch (e:any) {
            result = { error: e?.message || 'Unable to remove cart item' }
          }
        } else if (name === 'clear_cart') {
          try {
            const cart = await getOrCreateWhatsappCart(db, { storeId, conversationId, contactId })
            const { error } = await db.from('whatsapp_cart_items').delete().eq('cart_id', cart.id)
            if (error) throw error
            result = { cleared: true, cart: whatsappCartSummary([]) }
          } catch (e:any) {
            result = { error: e?.message || 'Unable to clear cart' }
          }
        } else if (name === 'create_checkout_link') {
          try {
            const cart = await getOrCreateWhatsappCart(db, { storeId, conversationId, contactId })
            const items = await readWhatsappCart(db, cart.id)
            if (!items.length) {
              result = { error: 'The cart is empty.' }
            } else if (String(store?.slug || '').toLowerCase() !== 'malluspices') {
              result = { error: 'WhatsApp storefront handoff is not enabled for this store yet.' }
            } else {
              const domain = String(store?.domain || 'malluspices.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
              const payload = encodeWhatsappCartPayload(items)
              const checkoutUrl = `https://${domain}/whatsapp-cart?c=${encodeURIComponent(payload)}`
              const now = new Date().toISOString()
              await db.from('whatsapp_carts').update({ status:'checkout_started', checkout_link_created_at:now, updated_at:now, last_activity_at:now }).eq('id', cart.id)
              result = { checkout_url: checkoutUrl, cart: whatsappCartSummary(items), note: 'The storefront will revalidate price, stock, offers, delivery and payment before the order is created.' }
            }
          } catch (e:any) {
            result = { error: e?.message || 'Unable to create checkout link' }
          }
        } else if (name === 'get_sales_recommendations') {
          let recommendations = []
          if (args.current_product_id) {
            const {data:affinity} = await db.from('product_affinity').select('product_b_id,co_purchase_count').eq('product_a_id',args.current_product_id).order('co_purchase_count',{ascending:false}).limit(3)
            if (affinity?.length) {
              const ids = affinity.map((a:any)=>a.product_b_id)
              const {data:products} = await db.from('products').select('id,name,price,brand,image_url').in('id',ids).eq('is_active',true)
              recommendations = products?.map((p:any)=>({ ...p, recommendation_type:'cross_sell', reason:'Frequently bought together' })) || []
            }
          }
          for (const rec of recommendations) await db.from('sales_recommendations').upsert({ conversation_id:conversationId, product_id:rec.id, recommendation_type:rec.recommendation_type, reason:rec.reason, status:'suggested' }, { onConflict:'conversation_id, product_id' })
          result = recommendations
        } else if (name === 'analyze_basket_opportunities') {
          const gap = Math.max(0, 50 - Number(args.current_total || 0))
          result = gap > 0 ? { free_delivery_gap:gap } : { free_delivery_qualified:true }
        } else if (name === 'create_support_ticket') {
          try {
            const tr = await ensureSupportTicket(db, { storeId, conversationId, contactId, category:args.category || 'other', reason:args.reason || 'Customer request requires human assistance.', triggerMessageId })
            confirmedTicketId = tr.ticket.id
            result = { ticket_id:tr.ticket.id, status:tr.ticket.status, created:tr.created }
          } catch (e:any) {
            result = { error:e?.message || 'Unable to create support ticket' }
          }
        } else if (name === 'track_customer_interest') {
          const {data:contact} = await db.from('whatsapp_contacts').select('customer_id').eq('id',contactId).maybeSingle()
          const {error} = await db.from('customer_product_interest').insert({ customer_id:contact?.customer_id, store_id:storeId, product_id:args.product_id, conversation_id:conversationId, interest_type:args.interest_type })
          result = error ? { error:error.message } : { success:true }
        }
    
        return { name, result }
      }
    
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const start = Date.now()
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method:'POST',
          headers:{ Authorization:`Bearer ${openaiKey}`, 'Content-Type':'application/json' },
          body:JSON.stringify({ model, messages, tools:openAiTools, tool_choice:'auto', reasoning_effort:'none' }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error?.message || 'OpenAI request failed')
        aiMessage = data.choices?.[0]?.message
        if (!aiMessage) throw new Error('OpenAI returned no message')
    
        await db.from('ai_usage_logs').insert({
          feature:'customer_care',
          model,
          request_type: round === 0 ? 'initial_intent' : `tool_round_${round}`,
          prompt_tokens:data.usage?.prompt_tokens,
          completion_tokens:data.usage?.completion_tokens,
          total_tokens:data.usage?.total_tokens,
          duration_ms:Date.now()-start,
          status:'success',
        })
    
        messages.push(aiMessage)
        lastToolCalls = aiMessage.tool_calls || []
        if (!lastToolCalls.length) break
    
        for (const call of lastToolCalls) {
          const executed = await runToolCall(call)
          messages.push({
            role:'tool',
            tool_call_id:call.id,
            name:executed.name,
            content:JSON.stringify(executed.result),
          })
        }
      }
    
      if (lastToolCalls.length) {
        throw new Error('AI exceeded the maximum tool-call rounds')
      }
    
      let reply = aiMessage?.content || null
      if (reply && !confirmedTicketId) {
        const falseHandoffClaim = /\b(passed|escalated|forwarded)\b.{0,60}\b(team|support|agent|human)\b|\b(ticket|case)\b.{0,30}\b(created|opened|raised)\b/i.test(reply)
        if (falseHandoffClaim) {
          console.error('[AI Guardrail] Suppressed unverified human-handoff claim')
          reply = 'I could not complete that handoff yet. Please ask me to connect you to a human agent and I’ll create the support request properly.'
        }
      }
    
      return new Response(JSON.stringify({ reply, tool_calls:[], ticket_id:confirmedTicketId }), { status:200, headers:{ ...corsHeaders, 'Content-Type':'application/json' } })
  } catch(error:any) {
    console.error('[AI Error]', error?.message || error)
    return new Response(JSON.stringify({ error:error?.message || 'AI request failed' }), { status:500, headers:{ ...corsHeaders, 'Content-Type':'application/json' } })
  }
})