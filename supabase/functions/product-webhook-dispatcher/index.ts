import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const malluUrl = Deno.env.get("MALLUSPICES_SUPABASE_URL") ?? "";
    const malluKey = Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const malluClient = createClient(malluUrl, malluKey);
    const payload = await req.json();
    const productId = payload?.data?.id ?? payload?.record?.id ?? payload?.data?.old_record?.id ?? "";
    const productName = payload?.data?.name ?? payload?.record?.name ?? "";
    const eventType = payload?.event ?? payload?.type ?? "UPDATE";
    if (eventType === "DELETE") {
      const { error: delError } = await malluClient.from("centralhub_products_raw").delete().eq("centralhub_id", productId);
      try { await supabase.from("webhook_logs").insert({ event_type:eventType, product_id:productId, product_name:productName, attempt:1, status_code:delError?500:200, response_body:delError?delError.message:"deleted", success:!delError, status:delError?"failed":"delivered", response:JSON.stringify({method:"direct_delete"}) }); } catch {}
      return new Response(JSON.stringify({ ok: !delError }), { headers:{...corsHeaders,"Content-Type":"application/json"} });
    }
    const { data: product, error: fetchError } = await supabase.from("products").select("id, name, slug, brand, price, sale_price, cost_price, stock, unit, weight, weight_kg, weight_grams, is_active, is_published, is_archived, is_deleted, gtin, sku, pack_size, pack_unit, main_category, sub_category, category, subcategory, department, product_type, warehouse_location, backorder, allow_backorder, image_url, image_main, gallery_images, description").eq("id", productId).maybeSingle();
    if (fetchError || !product) return new Response(JSON.stringify({ok:false,error:"Product not found"}), {status:404,headers:{...corsHeaders,"Content-Type":"application/json"}});
    const { data: inv } = await supabase.from("central_inventory").select("stock_quantity").eq("product_id",productId).maybeSingle();
    const availableStock = inv ? inv.stock_quantity : (product.stock || 0);
    const mapped: Record<string,any> = { centralhub_id:product.id,name:product.name,slug:product.slug || (product.name ? product.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""):""),price:product.price,stock:availableStock,product_type:product.product_type||"simple",brand:product.brand,warehouse_location:product.warehouse_location,weight:product.weight || (product.weight_kg ? product.weight_kg.toString():""),gtin:product.gtin,unit:product.unit,main_category:product.main_category,sub_category:product.sub_category,category:product.category,subcategory:product.subcategory,department:product.department,cost_price:product.cost_price,weight_grams:product.weight_grams,sku:product.sku,pack_size:product.pack_size,pack_unit:product.pack_unit,is_active:product.is_active??true,is_published:product.is_published??true,is_archived:product.is_archived??false,is_deleted:product.is_deleted??false,backorder:product.allow_backorder??false,description:product.description,sale_price:product.sale_price,synced_at:new Date().toISOString() };
    if (product.image_url) mapped.image_url=product.image_url;
    if (product.image_main) mapped.image_main=product.image_main;
    if (product.gallery_images) mapped.gallery_images=product.gallery_images;
    const { error: upsertError } = await malluClient.from("centralhub_products_raw").upsert(mapped,{onConflict:"centralhub_id"});
    return new Response(JSON.stringify({ok:!upsertError,error:upsertError?.message}),{status:upsertError?500:200,headers:{...corsHeaders,"Content-Type":"application/json"}});
  } catch (err) { return new Response(JSON.stringify({ok:false,error:(err as Error).message}),{status:500,headers:{...corsHeaders,"Content-Type":"application/json"}}); }
});
