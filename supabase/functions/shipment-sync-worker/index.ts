import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Retry intervals in minutes: 1, 5, 15, 30, 60
const RETRY_INTERVALS = [1, 5, 15, 30, 60, 60, 60, 60, 60, 60];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch items that need retry or are pending
    // We only process items where (now - created_at) > interval based on retry_count
    const { data: queueItems } = await supabase
      .from("shipment_sync_queue")
      .select("*, stores(slug, name)")
      .in("status", ["pending", "retry"])
      .lt("retry_count", 10)
      .order("created_at", { ascending: true })
      .limit(20);

    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const item of queueItems) {
      const waitMinutes = RETRY_INTERVALS[item.retry_count] || 60;
      const createdTime = new Date(item.created_at).getTime();
      const now = Date.now();

      // Skip if not enough time has passed for retry
      if (item.status === 'retry' && now - createdTime < waitMinutes * 60 * 1000) {
        continue;
      }

      // Process using the same logic as the service (we can duplicate or trigger an API)
      // For simplicity in the worker, we'll implement the push here or call a central Hub API.
      // Calling an internal Hub API is safer to keep logic DRY.

      // But for this environment, let's trigger the process logic.
      // Since this is a worker, we'll try to process directly.
      results.push(await processSync(supabase, item));
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      details: results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processSync(supabase: any, item: any) {
  const storeSlug = item.stores?.slug;
  const orderNumber = item.order_number;

  try {
    // 1. Mark processing
    await supabase.from("shipment_sync_queue").update({ status: "processing" }).eq("id", item.id);

    // 2. Get credentials
    const credentials = getStoreCredentials(storeSlug);
    if (!credentials.url || !credentials.key) throw new Error(`Missing credentials for ${storeSlug}`);

    const remoteSupabase = createClient(credentials.url, credentials.key);

    // 3. Find order on remote
    const { data: remoteOrder } = await remoteSupabase
      .from("orders")
      .select("id")
      .or(`order_number.eq."${orderNumber}",confirmed_order_number.eq."${orderNumber}"`)
      .maybeSingle();

    if (!remoteOrder) throw new Error(`Order ${orderNumber} not found on remote ${storeSlug}`);

    // 4. Extract events from payload (they go to a separate table, not orders)
    const payload = { ...item.payload };
    const events = payload.events;
    delete payload.events;

    // 5. Update remote order (shipment fields are stored as columns on orders)
    const { error: updateError } = await remoteSupabase
      .from("orders")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString()
      })
      .eq("id", remoteOrder.id);

    if (updateError) throw updateError;

    // 6. Push tracking events to remote store's shipment_events table
    if (events && Array.isArray(events) && events.length > 0 && payload.tracking_number) {
      try {
        // Find the remote shipment by tracking number
        const { data: remoteShipment } = await remoteSupabase
          .from("shipments")
          .select("id")
          .eq("tracking_number", payload.tracking_number)
          .maybeSingle();

        if (remoteShipment) {
          // Insert events that don't already exist on the remote store
          for (const ev of events) {
            const { data: existing } = await remoteSupabase
              .from("shipment_events")
              .select("id")
              .eq("shipment_id", remoteShipment.id)
              .eq("event_time", ev.event_time)
              .maybeSingle();

            if (!existing) {
              await remoteSupabase.from("shipment_events").insert({
                shipment_id: remoteShipment.id,
                status: ev.status,
                location: ev.location || null,
                description: ev.description,
                event_time: ev.event_time,
              });
            }
          }
        }
      } catch (evErr) {
        // Event sync failures should not fail the whole sync item
        console.error(`[shipment-sync-worker] Event sync failed for ${orderNumber}:`, evErr);
      }
    }

    // 7. Complete
    await supabase.from("shipment_sync_queue").update({
      status: "completed",
      processed_at: new Date().toISOString()
    }).eq("id", item.id);

    return { id: item.id, status: "success" };

  } catch (err: any) {
    const nextStatus = item.retry_count < 9 ? "retry" : "failed";
    await supabase.from("shipment_sync_queue").update({
      status: nextStatus,
      retry_count: item.retry_count + 1,
      error_message: err.message
    }).eq("id", item.id);

    return { id: item.id, status: "error", message: err.message };
  }
}

function getStoreCredentials(slug: string) {
  const s = slug.toLowerCase();
  if (s.includes('malluspices')) return { url: Deno.env.get("MALLUSPICES_SUPABASE_URL"), key: Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY") };
  if (s.includes('pocket')) return { url: Deno.env.get("POCKET_SUPABASE_URL"), key: Deno.env.get("POCKET_SUPABASE_SERVICE_ROLE_KEY") };
  if (s.includes('kerala')) return { url: Deno.env.get("KERALA_SUPABASE_URL") || Deno.env.get("SOURCE3_SUPABASE_URL"), key: Deno.env.get("KERALA_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SOURCE3_SUPABASE_SERVICE_ROLE_KEY") };
  return { url: null, key: null };
}
