import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Configuration
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 15000;
const BATCH_SIZE = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

/**
 * Ensures required configuration is present before execution.
 */
function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`CRITICAL CONFIG ERROR: Missing ${name}`);
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders, status: 200 });
  }

  try {
    // 1. Validate Environment Startup
    const SUPABASE_URL = getRequiredEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const CENTRALHUB_API_URL = getRequiredEnv("CENTRALHUB_API_URL");
    const CENTRALHUB_API_KEY = getRequiredEnv("CENTRALHUB_API_KEY");
    const STORE_ID = Deno.env.get("STORE_ID") || "store-primary";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Claim pending jobs (Row-level locking)
    const { data: jobs, error: claimError } = await supabase.rpc("claim_order_sync_jobs", {
      p_batch_size: BATCH_SIZE,
    });

    if (claimError) throw claimError;

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: "Queue empty", processed: 0 }), {
        headers: corsHeaders, status: 200
      });
    }

    const results = [];

    // 3. Process Batch
    for (const job of jobs) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${CENTRALHUB_API_URL}/receive-store-order`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${CENTRALHUB_API_KEY}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": job.id, // UUID string
            "X-Store-Id": STORE_ID,
          },
          body: JSON.stringify(job.payload),
          signal: controller.signal,
        });

        const responseText = await response.text();

        if (response.ok) {
          let chId = null;
          try {
            const resData = JSON.parse(responseText);
            chId = resData.central_id || resData.id;
          } catch {
            console.warn(`[sync] Job ${job.id}: Response not JSON.`);
          }

          // ATOMIC SUCCESS
          const { error: finalizeError } = await supabase.rpc("finalize_order_sync", {
            p_queue_id: job.id,
            p_order_id: job.order_id,
            p_status: "sent",
            p_centralhub_id: chId,
          });

          if (finalizeError) throw finalizeError; // STOP BATCH ON DB FAILURE
          results.push({ id: job.id, status: "success" });

        } else {
          throw new Error(`CentralHub Rejected Request (HTTP ${response.status}): ${responseText}`);
        }
      } catch (err) {
        // 4. ATOMIC FAILURE with True Exponential Backoff
        const currentAttempt = (job.attempts || 0) + 1;
        const isDead = currentAttempt >= MAX_ATTEMPTS;
        const errorMsg = err instanceof Error ? err.message : String(err);

        const backoffMinutes = Math.pow(2, currentAttempt);
        const nextRetry = new Date();
        nextRetry.setMinutes(nextRetry.getMinutes() + backoffMinutes);

        const { error: finalizeError } = await supabase.rpc("finalize_order_sync", {
          p_queue_id: job.id,
          p_order_id: job.order_id,
          p_status: isDead ? "dead_letter" : "pending",
          p_error_msg: errorMsg,
          p_next_retry: isDead ? null : nextRetry.toISOString(),
        });

        if (finalizeError) throw finalizeError; // STOP BATCH ON DB FAILURE

        results.push({ id: job.id, status: "failed", error: errorMsg });
      } finally {
        clearTimeout(timeoutId); // Ensure cleanup in all cases
      }
    }

    return new Response(JSON.stringify({ processed: jobs.length, results }), {
      headers: corsHeaders, status: 200
    });

  } catch (globalErr) {
    const errorMsg = globalErr instanceof Error ? globalErr.message : String(globalErr);
    console.error(`[sync-critical] ${errorMsg}`);
    return new Response(JSON.stringify({ error: errorMsg }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});
