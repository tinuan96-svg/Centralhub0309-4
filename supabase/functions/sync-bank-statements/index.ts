import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { google } from "npm:googleapis@140";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type SyncRow = {
  transaction_date: string;
  transaction_time: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  reference: string;
  merchant: string;
  category: string;
  notes: string;
  source_row_hash: string;
};

const norm = (v: unknown) => String(v ?? "").toLowerCase().trim().replace(/[\s_-]+/g, " ");

function parseDate(v: string) {
  const m = v.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid transaction date: ${v}`);
  return d.toISOString().slice(0, 10);
}

function parseAmount(v: string) {
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid transaction amount: ${v}`);
  return n;
}

async function hash(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getGoogleCredentials() {
  const emailEnv = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")?.trim() ?? "";
  const keyEnv = Deno.env.get("GOOGLE_PRIVATE_KEY")?.trim() ?? "";
  const jsonEnv = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")?.trim() ?? "";

  let email = emailEnv;
  let privateKey = keyEnv;

  // Accept a complete service-account JSON document as an alternative to
  // separate email/private-key secrets. This also handles JSON-escaped newlines.
  if (jsonEnv.startsWith("{")) {
    try {
      const parsed = JSON.parse(jsonEnv);
      email = String(parsed.client_email ?? email).trim();
      privateKey = String(parsed.private_key ?? privateKey).trim();
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  privateKey = privateKey
    .replace(/^['\"]|['\"]$/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n")
    .trim();

  if (!email || !privateKey) {
    throw new Error("Missing Google service account configuration");
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
    throw new Error("GOOGLE_PRIVATE_KEY is not a valid PEM private key; use the full -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY----- value");
  }

  return { email, privateKey };
}

async function readSheet(
  id: string,
  sheetName: string,
  rangeConfig: string | null,
): Promise<SyncRow[]> {
  const { email, privateKey } = getGoogleCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const range = rangeConfig?.trim()
    ? rangeConfig
    : `'${sheetName.replace(/'/g, "''")}'!A:Q`;

  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: id, range })).data.values ?? [];
  if (!rows.length) return [];

  const headers = rows[0].map(norm);
  const find = (names: string[]) => names.map(norm).map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;
  const iId = find(["transaction id"]);
  const iDate = find(["date", "transaction date"]);
  const iTime = find(["time"]);
  const iName = find(["name", "merchant", "payee"]);
  const iCat = find(["category"]);
  const iAmt = find(["amount", "value"]);
  const iNotes = find(["notes and #tags", "notes", "memo"]);
  const iDesc = find(["description", "details"]);

  if (iId < 0 || iDate < 0 || iAmt < 0) {
    throw new Error("Monzo sheet is missing Transaction ID, Date, or Amount columns");
  }

  const out: SyncRow[] = [];
  for (const row of rows.slice(1)) {
    if (!row?.length || row.every((c) => !String(c ?? "").trim())) continue;
    const reference = String(row[iId] ?? "").trim();
    const date = String(row[iDate] ?? "").trim();
    if (!reference || !date) continue;

    const signed = parseAmount(String(row[iAmt] ?? ""));
    const merchant = iName >= 0 ? String(row[iName] ?? "").trim() : "";
    const category = iCat >= 0 ? String(row[iCat] ?? "").trim() : "";
    const explicit = iDesc >= 0 ? String(row[iDesc] ?? "").trim() : "";
    const notes = iNotes >= 0 ? String(row[iNotes] ?? "").trim() : "";

    out.push({
      transaction_date: parseDate(date),
      transaction_time: iTime >= 0 ? (String(row[iTime] ?? "00:00:00").trim() || "00:00:00") : "00:00:00",
      description: explicit || merchant || category || "Unknown",
      amount: Math.abs(signed),
      type: signed < 0 ? "debit" : "credit",
      reference,
      merchant,
      category,
      notes,
      source_row_hash: await hash(JSON.stringify(row.slice(0, 17))),
    });
  }

  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST required");

    const url = Deno.env.get("SUPABASE_URL");
    const role = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !role) throw new Error("Missing Supabase service configuration");

    const supabase = createClient(url, role);
    const authorization=req.headers.get("Authorization")||"";
    const bearer=authorization.replace(/^Bearer\s+/i,"").trim();
    const reject=(status:number,error:string)=>new Response(JSON.stringify({success:false,error}),{
      status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}
    });
    if(!/^Bearer\s+\S+$/i.test(authorization)) return reject(401,"Authentication required");

    // Preserve scheduled/service-role bank reconciliation. A caller holding
    // any ordinary authenticated JWT must pass live, trusted authorization.
    const internalServiceCall=Boolean(role)&&bearer===role;
    let roleName="service_role";
    let staffAllStores=false; let staffStoreIds:string[]=[];
    if(!internalServiceCall){
      const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
      if(!anon)return reject(503,"Authentication configuration unavailable");
      const userDb=createClient(url,anon,{
        global:{headers:{Authorization:authorization}},
        auth:{persistSession:false,autoRefreshToken:false}
      });
      const {data:{user},error:userError}=await userDb.auth.getUser(bearer);
      if(userError||!user)return reject(401,"Invalid session");
      const [{data:identity,error:identityError},{data:profile,error:profileError}]=await Promise.all([
        supabase.auth.admin.getUserById(user.id),
        supabase.from("user_profiles").select("is_active,profile_role").eq("id",user.id).maybeSingle()
      ]);
      if(identityError||profileError||!identity.user||!profile||profile.is_active!==true)
        return reject(403,"An active account is required");
      roleName=String(identity.user.app_metadata?.role||"").toLowerCase();
      if(roleName==="admin"){
        if(profile.profile_role!=="admin")return reject(403,"Super Admin access required");
        const {data:staffRecord}=await supabase.from("ch_staff_accounts")
          .select("user_id").eq("user_id",user.id).maybeSingle();
        if(staffRecord)return reject(403,"Staff identities cannot use the Super Admin bank sync");
      }else if(roleName==="staff"){
        if(Deno.env.get("CENTRALHUB_STAFF_ACCESS_VERIFIED")!=="true")
          return reject(403,"Staff bank sync is not yet enabled");
        if(profile.profile_role!=="user"||identity.user.app_metadata?.must_change_password!==false)
          return reject(403,"Staff account is not ready for bank sync");
        const [{data:account,error:accountError},{data:override,error:overrideError},
          {data:stores,error:storeError}]=await Promise.all([
          supabase.from("ch_staff_accounts").select("role_key,status,all_stores")
            .eq("user_id",user.id).maybeSingle(),
          supabase.from("ch_staff_permission_overrides").select("allowed")
            .eq("user_id",user.id).eq("permission_key","finance.reconcile").maybeSingle(),
          supabase.from("ch_staff_store_access").select("store_id").eq("user_id",user.id)
        ]);
        if(accountError||overrideError||storeError||account?.status!=="active")
          return reject(403,"Finance reconciliation permission required");
        const {data:roleGrant,error:grantError}=await supabase.from("ch_staff_permissions")
          .select("permission_key").eq("role_key",account.role_key)
          .eq("permission_key","finance.reconcile").maybeSingle();
        if(grantError||!(override?.allowed??Boolean(roleGrant)))
          return reject(403,"Finance reconciliation permission required");
        staffAllStores=account.all_stores===true;
        staffStoreIds=(stores||[]).map((row:{store_id:string})=>row.store_id);
        if(!staffAllStores&&!staffStoreIds.length)
          return reject(403,"No stores are assigned to this account");
      }else{
        return reject(403,"An authorised CentralHub account is required");
      }
    }

    // Validate Google configuration only after authorization; otherwise
    // unauthorised calls could trigger work or expose configuration errors.
    getGoogleCredentials();

    const body = await req.json().catch(() => ({}));
    const accountId = body.bank_account_id as string | undefined;
    if(roleName==="staff" && body.sync_all && !staffAllStores) throw new Error("All Stores access is required for sync_all");

    let q = supabase
      .from("store_bank_accounts")
      .select("id,bank_name,account_name,store_id,google_sheet_id,google_sheet_name,google_sheet_range")
      .eq("is_active", true);

    if (accountId) q = q.eq("id", accountId);
    else if (!body.sync_all) throw new Error("bank_account_id is required");

    const { data: accounts, error } = await q;
    if (error) throw error;
    if (!accounts?.length) throw new Error("No configured active bank account found");
    if(roleName==="staff" && !staffAllStores && accounts.some((account:any)=>!account.store_id||!staffStoreIds.includes(account.store_id)))
      throw new Error("Bank account is outside the assigned store scope");

    const results = [];
    for (const account of accounts) {
      if (!account.store_id) {
        results.push({ account_id: account.id, success: false, error: "Bank account is not assigned to a store" });
        continue;
      }
      if (!account.google_sheet_id || !account.google_sheet_name) {
        results.push({ account_id: account.id, success: false, error: "Google Sheet is not configured" });
        continue;
      }

      const transactions = await readSheet(account.google_sheet_id, account.google_sheet_name, account.google_sheet_range);
      const { data: syncResult, error: syncError } = await supabase.rpc("sync_bank_transactions", {
        p_bank_account_id: account.id,
        p_transactions: transactions,
      });
      if (syncError) throw syncError;

      results.push({
        account_id: account.id,
        store_id: account.store_id,
        bank_name: account.bank_name,
        account_name: account.account_name,
        sheet_rows: transactions.length,
        ...(syncResult ?? {}),
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Bank sync failed", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
