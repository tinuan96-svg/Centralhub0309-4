import postgres from "npm:postgres@3.4.4";

type IncomingPayload = {
  source: string;
  order: {
    order_number: string;
    order_status?: string | null;
    payment_status?: string | null;
    shipment_number?: string | null;
    status?: string | null;
    carrier?: string | null;
    service_type?: string | null;
    tracking_number?: string | null;
    last_tracking_status?: string | null;
    estimated_delivery?: string | null;
    actual_delivery?: string | null;
    label_printed?: boolean | null;
    updated_at?: string | null;
  };
};

const DB_URL = Deno.env.get("SUPABASE_DB_URL");
const SYNC_WEBHOOK_SECRET = Deno.env.get("SYNC_WEBHOOK_SECRET");

if (!DB_URL) throw new Error("SUPABASE_DB_URL is required");
if (!SYNC_WEBHOOK_SECRET) throw new Error("SYNC_WEBHOOK_SECRET is required");

const sql = postgres(DB_URL, { prepare: false, max: 2 });

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const incomingSecret = req.headers.get("x-sync-secret");
    if (!incomingSecret || incomingSecret !== SYNC_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = (await req.json()) as IncomingPayload;

    if (!payload?.order?.order_number) {
      return new Response("order.order_number is required", { status: 400 });
    }

    const source = payload.source || "malluspices";
    const o = payload.order;

    await sql`
      insert into public.orders (
        order_number,
        order_status,
        payment_status,
        shipment_number,
        status,
        carrier,
        service_type,
        tracking_number,
        last_tracking_status,
        estimated_delivery,
        actual_delivery,
        label_printed,
        sync_origin,
        sync_updated_at,
        updated_at
      )
      values (
        ${o.order_number},
        ${o.order_status ?? null},
        ${o.payment_status ?? null},
        ${o.shipment_number ?? null},
        ${o.status ?? null},
        ${o.carrier ?? null},
        ${o.service_type ?? null},
        ${o.tracking_number ?? null},
        ${o.last_tracking_status ?? null},
        ${o.estimated_delivery ?? null},
        ${o.actual_delivery ?? null},
        ${o.label_printed ?? false},
        ${source},
        now(),
        coalesce(${o.updated_at ?? null}::timestamptz, now())
      )
      on conflict (order_number)
      do update set
        order_status = excluded.order_status,
        payment_status = excluded.payment_status,
        shipment_number = excluded.shipment_number,
        status = excluded.status,
        carrier = excluded.carrier,
        service_type = excluded.service_type,
        tracking_number = excluded.tracking_number,
        last_tracking_status = excluded.last_tracking_status,
        estimated_delivery = excluded.estimated_delivery,
        actual_delivery = excluded.actual_delivery,
        label_printed = excluded.label_printed,
        sync_origin = excluded.sync_origin,
        sync_updated_at = now(),
        updated_at = greatest(public.orders.updated_at, excluded.updated_at)
    `;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});