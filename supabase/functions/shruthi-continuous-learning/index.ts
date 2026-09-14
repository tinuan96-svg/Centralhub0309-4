import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const headers = { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" };

type Track = { key: string; label: string; query: string };
const TRACKS: Track[] = [
  { key:"seo_discovery", label:"SEO & Discovery", query:"Latest high-confidence SEO, Google Search, ecommerce structured-data, local discovery, AI-search and discoverability changes relevant to UK ecommerce and grocery retailers." },
  { key:"growth_merchandising", label:"Growth & Merchandising", query:"Recent evidence-backed ecommerce growth, conversion, retention, merchandising, pricing, loyalty, checkout, delivery and customer-experience practices relevant to UK online grocery and South Asian grocery retail." },
  { key:"ai_technology", label:"AI & Technology", query:"Recent AI, automation, analytics, ecommerce, payments, customer-support, mobile, web-performance and developer-platform capabilities that could improve a multi-store UK ecommerce operation using Next.js, Supabase, Netlify, Android, WhatsApp and analytics." },
  { key:"market_operations", label:"Market & Operations", query:"Recent UK ecommerce grocery, fulfilment, delivery, customer-experience, digital marketing, measurement and operational technology developments that could materially affect a Kerala/South-Indian grocery retailer." },
];

function respond(status:number, body:Record<string,unknown>) { return new Response(JSON.stringify(body),{status,headers}); }
function textOut(payload:any) {
  if(typeof payload?.output_text==="string") return payload.output_text;
  const chunks:string[]=[];
  for(const item of Array.isArray(payload?.output)?payload.output:[]) for(const part of Array.isArray(item?.content)?item.content:[]) if(typeof part?.text==="string") chunks.push(part.text);
  return chunks.join("\n").trim();
}
function safeJson(text:string) {
  const clean=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  try{return JSON.parse(clean);}catch{}
  const a=clean.indexOf("{"),b=clean.lastIndexOf("}");
  if(a>=0&&b>a) try{return JSON.parse(clean.slice(a,b+1));}catch{}
  return null;
}
function urlsFrom(payload:any) {
  const urls=new Set<string>();
  for(const item of Array.isArray(payload?.output)?payload.output:[]) for(const part of Array.isArray(item?.content)?item.content:[]) for(const ann of Array.isArray(part?.annotations)?part.annotations:[]) {
    const raw=ann?.url||ann?.url_citation?.url;
    if(typeof raw==="string"&&/^https?:\/\//i.test(raw)) { try{const u=new URL(raw);u.hash="";urls.add(u.toString());}catch{} }
  }
  return [...urls].slice(0,30);
}
function normalizeUrls(values:any[]) {
  const out=new Set<string>();
  for(const value of values){try{const u=new URL(String(value||"").trim());if(/^https?:$/.test(u.protocol)){u.hash="";out.add(u.toString());}}catch{}}
  return [...out].slice(0,12);
}
function domain(url:string){try{return new URL(url).hostname.replace(/^www\./,"").toLowerCase();}catch{return "";}}
function confidence(value:any){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0.72;}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");}

async function businessSnapshot(db:any){
  const since30=new Date(Date.now()-30*86400000).toISOString();
  const [storesRes,ordersRes,productsRes,knowledgeRes]=await Promise.all([
    db.from("stores").select("id,name,slug,domain").eq("visibility",true),
    db.from("orders").select("store_id,total,total_amount,total_revenue,gross_profit,order_profit,payment_status,created_at").gte("created_at",since30).limit(1200),
    db.from("products").select("name,brand,category,stock,stock_status,is_active").eq("is_active",true).limit(1200),
    db.from("shruthi_project_knowledge").select("scope,topic,content,priority").eq("active",true).order("priority",{ascending:false}).limit(28),
  ]);
  const orders=ordersRes.data||[],paid=orders.filter((o:any)=>String(o.payment_status||"").toLowerCase()==="paid");
  const amount=(o:any)=>Number(o.total_revenue??o.total_amount??o.total??0)||0, profit=(o:any)=>Number(o.gross_profit??o.order_profit??0)||0;
  const products=productsRes.data||[];
  const cats:Record<string,number>={}; for(const p of products){const k=String(p.category||"Uncategorised");cats[k]=(cats[k]||0)+1;}
  return {
    stores:(storesRes.data||[]).map((s:any)=>({name:s.name,slug:s.slug,domain:s.domain})),
    last30Days:{paidOrders:paid.length,revenue:Number(paid.reduce((n:number,o:any)=>n+amount(o),0).toFixed(2)),grossProfit:Number(paid.reduce((n:number,o:any)=>n+profit(o),0).toFixed(2))},
    catalogue:{activeProducts:products.length,outOfStock:products.filter((p:any)=>Number(p.stock||0)<=0||String(p.stock_status).toLowerCase()==="out_of_stock").length,lowStock:products.filter((p:any)=>Number(p.stock||0)>0&&Number(p.stock||0)<=3).length,topCategories:Object.entries(cats).sort((a:any,b:any)=>b[1]-a[1]).slice(0,12)},
    operatingKnowledge:(knowledgeRes.data||[]).map((r:any)=>({scope:r.scope,topic:r.topic,content:r.content})),
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST") return respond(405,{success:false,error:"method_not_allowed"});
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",openai=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!openai) return respond(500,{success:false,error:"learning_runtime_not_configured"});
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return respond(401,{success:false,error:"missing_auth"});
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const isScheduler=token===service;
  if(!isScheduler){
    const {data,error}=await db.auth.getUser(token);
    if(error||!data.user) return respond(401,{success:false,error:"invalid_auth"});
    if(String(data.user.app_metadata?.role||"").toLowerCase()!=="admin") return respond(403,{success:false,error:"admin_required"});
  }
  const body=await req.json().catch(()=>({}));
  const source=isScheduler?"scheduled":"manual";
  const {data:state}=await db.from("shruthi_learning_state").select("*").eq("id","primary").maybeSingle();
  const current=state||{enabled:true,cadence_hours:6,total_runs:0};
  if(!current.enabled&&!body?.force) return respond(200,{success:true,skipped:true,reason:"learning_paused"});
  const cadence=Math.max(1,Number(current.cadence_hours||6));
  const last=current.last_run_at?new Date(current.last_run_at).getTime():0;
  if(source==="scheduled"&&last&&Date.now()-last<cadence*3600000*0.8) return respond(200,{success:true,skipped:true,reason:"cadence_guard"});
  const selected=TRACKS.find(t=>t.key===String(body?.track||""))||TRACKS[Math.max(0,Number(current.total_runs||0))%TRACKS.length];
  const model=String(Deno.env.get("CENTRALHUB_LEARNING_MODEL")||Deno.env.get("OPENAI_MODEL_FAST")||"gpt-5.6-luna").trim();
  const snapshot=await businessSnapshot(db);
  const {data:run,error:runError}=await db.from("shruthi_learning_runs").insert({source,track:selected.key,query:selected.query,model,status:"running",metadata:{business_snapshot_at:new Date().toISOString()}}).select("id").single();
  if(runError||!run?.id) return respond(500,{success:false,error:runError?.message||"run_create_failed"});
  await db.from("shruthi_learning_state").update({current_track:selected.key,last_error:null,updated_at:new Date().toISOString()}).eq("id","primary");
  const prompt=`You are Shruthi's continuous research engine for a UK multi-store Kerala/South-Indian grocery ecommerce business. Research track: ${selected.label}. Goal: ${selected.query}\nBUSINESS CONTEXT:${JSON.stringify(snapshot)}\nUse web search. Prefer first-party/official platform documentation, regulators, primary industry sources and strong evidence. Prioritise the last 90 days for fast-changing topics. Reject SEO spam, affiliate listicles, copied news, unsupported social claims and generic filler. Connect each finding specifically to this business. Recommendations are advisory only; never claim they were implemented. Return JSON only: {"summary":"executive summary","insights":[{"title":"short title","summary":"what changed/learned","why_it_matters":"business relevance","recommended_action":"safe next step","confidence":0.0,"impact":"low|medium|high|critical","source_urls":["https://..."],"tags":["seo"]}]}. Return 0-5 insights; no insight is better than a weak one.`;
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${openai}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,reasoning:{effort:"low"},tools:[{type:"web_search"}],input:prompt,max_output_tokens:2200})});
    const payload=await response.json().catch(()=>null);
    if(!response.ok) throw new Error(payload?.error?.message||payload?.error?.code||`research_http_${response.status}`);
    const parsed=safeJson(textOut(payload))||{summary:textOut(payload).slice(0,1200),insights:[]};
    const fallback=urlsFrom(payload), raw=Array.isArray(parsed?.insights)?parsed.insights.slice(0,5):[];
    const rows:any[]=[];
    for(const item of raw){
      const title=String(item?.title||"").trim().slice(0,240), summary=String(item?.summary||"").trim().slice(0,4000); if(!title||!summary) continue;
      const sourceUrls=normalizeUrls([...(Array.isArray(item?.source_urls)?item.source_urls:[]),...fallback]);
      const fp=await sha256(`${selected.key}|${title.toLowerCase()}|${summary.toLowerCase().slice(0,400)}`);
      rows.push({run_id:run.id,track:selected.key,title,summary,why_it_matters:String(item?.why_it_matters||"").trim().slice(0,2500)||null,recommended_action:String(item?.recommended_action||"").trim().slice(0,2500)||null,confidence:confidence(item?.confidence),impact:["low","medium","high","critical"].includes(String(item?.impact))?item.impact:"medium",source_urls:sourceUrls,source_domains:[...new Set(sourceUrls.map(domain).filter(Boolean))],tags:[...new Set((Array.isArray(item?.tags)?item.tags:[]).map((t:any)=>String(t).trim().toLowerCase()).filter(Boolean))].slice(0,12),fingerprint:fp,learned_at:new Date().toISOString(),expires_at:new Date(Date.now()+90*86400000).toISOString(),metadata:{model,source,research_track:selected.label}});
    }
    let inserted=0; for(const row of rows){const r=await db.from("shruthi_learning_insights").upsert(row,{onConflict:"fingerprint",ignoreDuplicates:true});if(!r.error) inserted++;}
    const summary=String(parsed?.summary||`Shruthi reviewed ${selected.label}.`).trim().slice(0,4000), completed=new Date().toISOString();
    const sourceDomains=new Set(rows.flatMap((r:any)=>r.source_domains||[]));
    await db.from("shruthi_learning_runs").update({status:"completed",summary,findings_count:rows.length,sources_count:sourceDomains.size,completed_at:completed,metadata:{inserted_new:inserted,annotation_sources:fallback.length}}).eq("id",run.id);
    const countRes=await db.from("shruthi_learning_insights").select("id",{count:"exact",head:true}).neq("status","dismissed");
    await db.from("shruthi_learning_state").update({current_track:selected.key,last_run_at:completed,next_run_at:new Date(Date.now()+cadence*3600000).toISOString(),latest_summary:summary,total_runs:Number(current.total_runs||0)+1,total_insights:countRes.count||0,last_error:null,updated_at:completed}).eq("id","primary");
    return respond(200,{success:true,run_id:run.id,track:selected.key,summary,findings:rows.length,inserted,sources:sourceDomains.size,model});
  }catch(error:any){
    const message=String(error?.message||"learning_failed").slice(0,2000),completed=new Date().toISOString();
    await db.from("shruthi_learning_runs").update({status:"failed",error:message,completed_at:completed}).eq("id",run.id);
    await db.from("shruthi_learning_state").update({last_error:message,next_run_at:new Date(Date.now()+Math.min(2,cadence)*3600000).toISOString(),updated_at:completed}).eq("id","primary");
    return respond(502,{success:false,run_id:run.id,track:selected.key,error:message});
  }
});
