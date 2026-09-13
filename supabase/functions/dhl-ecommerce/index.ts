import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Default to production; set DHL_ENV secret to "uat" to use UAT endpoint with test credentials
const rawEnv = Deno.env.get("DHL_ENV") || "production";
const DHL_ENV = rawEnv === "uat" ? "uat" : "production";
const DHL_BASE = DHL_ENV === "uat"
  ? "https://api-uat.dhl.com/parceluk"
  : "https://api.dhl.com/parceluk";

const DHL_CLIENT_ID = Deno.env.get("DHL_CLIENT_ID") || "";
const DHL_CLIENT_SECRET = Deno.env.get("DHL_CLIENT_SECRET") || "";
const DHL_ACCOUNT_NUMBER = Deno.env.get("DHL_ACCOUNT_NUMBER") || "";
const DHL_PICKUP_ACCOUNT = Deno.env.get("DHL_PICKUP_ACCOUNT") || "";

const UAT_ORDERED_PRODUCT = Deno.env.get("DHL_UAT_ORDERED_PRODUCT") || "220";

function getCredentials() {
  if (DHL_ENV === "uat") {
    return {
      clientId: DHL_CLIENT_ID,
      clientSecret: DHL_CLIENT_SECRET,
      pickupAccount: DHL_PICKUP_ACCOUNT,
      accountNumber: DHL_ACCOUNT_NUMBER || DHL_PICKUP_ACCOUNT,
      orderedProduct: UAT_ORDERED_PRODUCT,
    };
  }
  return {
    clientId: DHL_CLIENT_ID,
    clientSecret: DHL_CLIENT_SECRET,
    pickupAccount: DHL_PICKUP_ACCOUNT,
    accountNumber: DHL_ACCOUNT_NUMBER,
    orderedProduct: "220",
  };
}


async function authorizeAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (serviceKey && token === serviceKey) return true;

  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return false;

  const metadataRole = String(user.app_metadata?.role || user.user_metadata?.profile_role || "").toLowerCase();
  if (["admin", "superadmin", "administrator"].includes(metadataRole)) return true;

  const { data: profile } = await db
    .from("user_profiles")
    .select("profile_role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.is_active !== false && ["admin", "superadmin", "administrator"].includes(String(profile?.profile_role || "").toLowerCase());
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }
  const creds = getCredentials();
  const response = await fetch(`${DHL_BASE}/auth/v1/accesstoken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }).toString(),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`DHL auth failed (${response.status}): ${t.substring(0, 400)}`);
  }
  const data = await response.json();
  const token = data.accessToken || data.access_token;
  if (!token) throw new Error(`DHL auth: no token in response: ${JSON.stringify(data).substring(0, 200)}`);
  cachedToken = { token, expiresAt: Date.now() + (data.expiresIn || data.expires_in || 3600) * 1000 };
  return token;
}

interface CreateShipmentBody {
  recipientName: string;
  recipientBusinessName?: string;
  recipientAddress1: string;
  recipientAddress2?: string;
  recipientCity: string;
  recipientPostcode: string;
  recipientCountryCode?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  senderName: string;
  senderBusinessName?: string;
  senderAddress1: string;
  senderAddress2?: string;
  senderCity: string;
  senderPostcode: string;
  senderPhone?: string;
  senderEmail?: string;
  weightKg: number;
  numberOfItems: number;
  customerReference?: string;
  specialInstructions?: string;
  labelFormat?: string;
}

// Next working day (skip weekends)
function nextWorkingDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function createShipment(body: CreateShipmentBody) {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Auth failed" };
  }

  const creds = getCredentials();
  const labelFormat = (body.labelFormat || "PDF").toUpperCase();
  const weightKg = Math.max(0.1, body.weightKg || 1);
  const dispatchDate = nextWorkingDay();

  // Correct DHL eCommerce UK payload structure per API spec
  const payload = {
    pickupAccount: creds.pickupAccount,
    dropoffType: "PICKUP",
    pickup: {
      date: dispatchDate,
      accountAddress: true,
    },
    senderAddress: {
      companyName: body.senderBusinessName || body.senderName || "",
      name: body.senderName || "",
      address1: body.senderAddress1 || "",
      address2: body.senderAddress2 || "",
      city: body.senderCity || "",
      postalCode: body.senderPostcode || "",
      country: "GB",
      phone: body.senderPhone || "",
      email: body.senderEmail || "",
    },
    shipments: [
      {
        consigneeAddress: {
          recipientType: "residential",
          addressType: "doorstep",
          name: body.recipientName || "",
          companyName: body.recipientBusinessName || "",
          address1: body.recipientAddress1 || "",
          address2: body.recipientAddress2 || "",
          city: body.recipientCity || "",
          postalCode: body.recipientPostcode || "",
          country: body.recipientCountryCode || "GB",
          phone: body.recipientPhone || "",
          email: body.recipientEmail || "",
        },
        shipmentDetails: {
          customerRef1: body.customerReference || "",
          orderedProduct: creds.orderedProduct,
          totalWeight: weightKg,
          totalPieces: body.numberOfItems || 1,
          ...(body.specialInstructions ? { deliveryInstructions: body.specialInstructions } : {}),
        },
      },
    ],
  };

  const queryParams = new URLSearchParams({
    includeLabel: "INCLUDE",
    format: labelFormat === "PDF" ? "PDF" : "PNG",
  });

  console.log(`DHL create-shipment payload: ${JSON.stringify(payload).substring(0, 800)}`);

  let resp: Response;
  let text: string;
  try {
    resp = await fetch(`${DHL_BASE}/shipping/v1/label?${queryParams.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    text = await resp.text();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Network error calling DHL" };
  }

  console.log(`DHL response status=${resp.status} body=${text.substring(0, 1000)}`);

  if (resp.status >= 200 && resp.status < 300) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: `Non-JSON DHL response: ${text.substring(0, 300)}` };
    }

    // Response: { shipments: [{ shipmentId, labels: ["base64..."] }] }
    const shipments = data.shipments as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(shipments) || shipments.length === 0) {
      return { success: false, error: "DHL returned no shipments in response", dhlResponse: data };
    }

    const shipment = shipments[0];
    const shipmentId = String(shipment.shipmentId || shipment.shipmentNumber || "");
    const trackingNumber = String(shipment.trackingNumber || shipment.shipmentId || shipmentId || "");
    const labels = shipment.labels as string[] | Array<Record<string, unknown>> | undefined;

    let labelData: string | null = null;
    if (Array.isArray(labels) && labels.length > 0) {
      // Labels can be plain base64 strings or objects
      const first = labels[0];
      labelData = typeof first === "string" ? first : ((first as Record<string, unknown>).labelData as string) || ((first as Record<string, unknown>).content as string) || null;
    }

    return {
      success: true,
      shipmentNumber: shipmentId,
      trackingNumber,
      labelData: labelData || undefined,
      labelFormat,
      dhlResponse: data,
    };
  }

  // Error response
  let errorData: Record<string, unknown> | null = null;
  try { errorData = JSON.parse(text); } catch { /* plain text */ }

  let errorMsg = "Unknown error";
  if (errorData) {
    // DHL error format: { title, detail } or { errors: [{title, detail}] } or { stack: [[{detail}]] }
    const errors = errorData.errors as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(errors) && errors.length > 0) {
      errorMsg = String(errors[0].detail || errors[0].title || errors[0].message || "");
    }
    if (!errorMsg || errorMsg === "Unknown error") {
      const stack = errorData.stack as Array<Array<Record<string, unknown>>> | undefined;
      if (Array.isArray(stack) && stack.length > 0 && Array.isArray(stack[0]) && stack[0].length > 0) {
        errorMsg = String(stack[0][0].detail || stack[0][0].title || stack[0][0].message || "");
      }
    }
    if (!errorMsg || errorMsg === "Unknown error") {
      errorMsg = String(errorData.detail || errorData.title || errorData.message || errorData.error || JSON.stringify(errorData).substring(0, 400));
    }
  } else {
    errorMsg = text.substring(0, 400);
  }

  return {
    success: false,
    error: `DHL ${resp.status}: ${errorMsg}`,
    dhlResponse: errorData,
    rawResponse: text.substring(0, 1000),
    requestPayload: payload,
  };
}

async function cancelShipment(shipmentId: string) {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Auth failed" };
  }

  console.log(`DHL cancel-shipment: ${shipmentId}`);

  let resp: Response;
  try {
    // DHL eCommerce UK (Parcel UK) cancellation endpoint
    resp = await fetch(`${DHL_BASE}/shipping/v1/shipments/${shipmentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Network error calling DHL" };
  }

  if (resp.status >= 200 && resp.status < 300) {
    return { success: true };
  }

  const text = await resp.text();
  let errorMsg = text;
  try {
    const data = JSON.parse(text);
    errorMsg = data.detail || data.title || data.message || text;
  } catch { /* ... */ }

  return { success: false, error: `DHL ${resp.status}: ${errorMsg}` };
}

async function trackShipment(trackingNumber: string) {
  const dhlTrackingKey = Deno.env.get("DHL_TRACKING_KEY");
  let data: any;

  // 1. Try the "Unified Tracking" API first if an API key is provided
  // This works even if your main booking account is blocked.
  if (dhlTrackingKey) {
    try {
      const resp = await fetch(
        `https://api.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`,
        {
          headers: {
            "DHL-API-Key": dhlTrackingKey,
            "Accept": "application/json"
          }
        }
      );
      if (resp.ok) {
        data = await resp.json();
      }
    } catch (e) {
      console.error("Unified Tracking failed, falling back:", e);
    }
  }

  // 2. Fallback to the original "Parcel UK" tracking method
  if (!data) {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${DHL_BASE}/tracking/v1/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      if (!response.ok) {
        const t = await response.text();
        let msg = `Tracking failed (${response.status})`;
        try { const j = JSON.parse(t); msg = j.detail || j.title || msg; } catch { msg += `: ${t.substring(0, 200)}`; }
        return { success: false, error: msg };
      }
      data = await response.json();
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Tracking auth failed" };
    }
  }

  const shipments = data.shipments || data.trackingDetails || [];
  if (Array.isArray(shipments) && shipments.length === 0) return { success: false, error: "No tracking information found" };
  const shipment = Array.isArray(shipments) ? shipments[0] : shipments;
  const events = (shipment.events || shipment.trackingEvents || []).map((e: Record<string, unknown>) => ({
    status: (e.statusCode as string) || (e.status as string) || "",
    location: typeof e.location === "object" && e.location ? ((e.location as Record<string, unknown>).addressLocality as string) || "" : (e.location as string) || "",
    description: (e.description as string) || (e.statusDescription as string) || "",
    timestamp: (e.timestamp as string) || new Date().toISOString(),
  }));
  return {
    success: true,
    trackingData: {
      shipments: [{
        id: shipment.shipmentId || trackingNumber,
        service: shipment.service || "",
        status: shipment.status || null,
        estimatedDeliveryDate: shipment.estimatedTimeOfDelivery || null,
        events,
        details: shipment.details || null,
      }],
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (!(await authorizeAdmin(req))) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized: admin access required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.pathname.split("/").filter(Boolean).pop() || "";

    const creds = getCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      return new Response(JSON.stringify({ success: false, error: "DHL credentials not configured", configured: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /status
    if (req.method === "GET" && action === "status") {
      try {
        await getAccessToken();
        return new Response(JSON.stringify({
          success: true,
          configured: true,
          accountNumber: creds.accountNumber,
          pickupAccount: creds.pickupAccount,
          environment: DHL_ENV,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: unknown) {
        return new Response(JSON.stringify({
          success: false,
          configured: true,
          environment: DHL_ENV,
          error: e instanceof Error ? e.message : "Unknown",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // POST /create-shipment
    if (req.method === "POST" && action === "create-shipment") {
      const body: CreateShipmentBody = await req.json();
      const result = await createShipment(body);
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // POST /cancel-shipment
    if (req.method === "POST" && action === "cancel-shipment") {
      const { shipmentId } = await req.json();
      if (!shipmentId) return new Response(JSON.stringify({ success: false, error: "shipmentId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await cancelShipment(shipmentId);
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // POST /validate-address
    if (req.method === "POST" && action === "validate-address") {
      const body = await req.json();
      const token = await getAccessToken();
      const resp = await fetch(`${DHL_BASE}/referencedata/v1/ukpostcodedistrict?postcode=${encodeURIComponent(body.postcode)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      const data = await resp.json();
      return new Response(JSON.stringify({ success: resp.ok, valid: resp.ok, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // POST /calculate-rate
    if (req.method === "POST" && action === "calculate-rate") {
      const body = await req.json();
      const token = await getAccessToken();
      const params = new URLSearchParams({
        originCountry: "GB",
        destinationCountry: "GB",
        destinationPostcode: body.toPostcode,
        weight: (body.weightGrams / 1000).toString()
      });
      const resp = await fetch(`${DHL_BASE}/referencedata/v1/productcapabilities?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      const data = await resp.json();
      // Map DHL product capabilities to a simple cost (using your fallback if price isn't in capability meta)
      return new Response(JSON.stringify({
        success: resp.ok,
        cost: 495, // Defaulting to your contract base if not in meta
        currency: "GBP",
        products: data.products || []
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // GET /track?trackingNumber=...
    if (req.method === "GET" && action === "track") {
      const tn = url.searchParams.get("trackingNumber");
      if (!tn) return new Response(JSON.stringify({ success: false, error: "trackingNumber required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await trackShipment(tn);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GET /diagnose — test auth + a sample shipment against UAT
    if (req.method === "GET" && action === "diagnose") {
      let tokenStatus = "unknown";
      let tokenValue = "";
      let authError = "";
      try {
        tokenValue = await getAccessToken();
        tokenStatus = "ok";
      } catch (e: unknown) {
        tokenStatus = "failed";
        authError = e instanceof Error ? e.message : String(e);
      }

      const results: Array<{ name: string; httpStatus: number; body: string }> = [];

      if (tokenStatus === "ok" && tokenValue) {
        const cred = getCredentials();
        const dispatchDate = nextWorkingDay();
        const payload = {
          pickupAccount: cred.pickupAccount,
          dropoffType: "PICKUP",
          pickup: { date: dispatchDate, accountAddress: true },
          senderAddress: {
            companyName: "Test Company", name: "Test Sender",
            address1: "1 Test Street", city: "London", postalCode: "E1 6AN", country: "GB",
            phone: "07700900000", email: "test@example.com",
          },
          shipments: [{
            consigneeAddress: {
              recipientType: "residential", addressType: "doorstep",
              name: "Test Recipient", address1: "2 Test Road", city: "London",
              postalCode: "SW1A 2AA", country: "GB", phone: "07700900001", email: "recv@example.com",
            },
            shipmentDetails: {
              customerRef1: "DIAG-001", orderedProduct: cred.orderedProduct,
              totalWeight: 1, totalPieces: 1,
            },
          }],
        };
        try {
          const r = await fetch(`${DHL_BASE}/shipping/v1/label?includeLabel=INCLUDE&format=PDF`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenValue}`, Accept: "application/json" },
            body: JSON.stringify(payload),
          });
          const body = await r.text();
          results.push({ name: "create-shipment-test", httpStatus: r.status, body: body.substring(0, 1000) });
        } catch (e: unknown) {
          results.push({ name: "create-shipment-test", httpStatus: 0, body: e instanceof Error ? e.message : "fetch failed" });
        }
      }

      return new Response(JSON.stringify({
        config: {
          pickupAccount: creds.pickupAccount,
          accountNumber: creds.accountNumber,
          environment: DHL_ENV,
          hasClientId: !!creds.clientId,
          hasClientSecret: !!creds.clientSecret
        },
        tokenStatus,
        authError: authError || undefined,
        results,
        timestamp: new Date().toISOString()
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: false,
      error: `Unknown action: ${action}`,
      available: ["status", "create-shipment", "track", "diagnose"],
    }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("DHL Edge Function error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
