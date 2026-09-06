import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-google-pipeline-secret',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}})
const admin=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const secret=(name:string)=>{const v=Deno.env.get(name)?.trim();if(!v)throw new Error(`Missing Edge Function secret: ${name}`);return v}
const b64=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
const unb64=(v:string)=>{const n=v.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-v.length%4)%4);return Uint8Array.from(atob(n),c=>c.charCodeAt(0))}
async function cryptoKey(){const raw=unb64(secret('MARKETING_TOKEN_ENCRYPTION_KEY'));if(raw.length!==32)throw new Error('MARKETING_TOKEN_ENCRYPTION_KEY must decode to 32 bytes');return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])}
async function decrypt(v:string){if(!v?.startsWith('enc:v1:'))throw new Error('Stored Google credential is not encrypted with the current format');const b=unb64(v.slice(7)),iv=b.slice(0,12),c=b.slice(12);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await cryptoKey(),c))}
async function encrypt(v:string){const k=await cryptoKey(),iv=crypto.getRandomValues(new Uint8Array(12));const c=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(v)));const out=new Uint8Array(iv.length+c.length);out.set(iv);out.set(c,iv.length);return`enc:v1:${b64(out)}`}

async function requireAccess(req:Request){
  const db=admin();
  const pipeline=req.headers.get('x-google-pipeline-secret')?.trim();
  if(pipeline){const{data,error}=await db.rpc('verify_integration_cron_secret',{p_name:'google_data_pipeline_cron',p_secret:pipeline});if(!error&&data===true)return{db,mode:'pipeline'}}
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw new Error('Authorization required');
  const{data:auth,error}=await db.auth.getUser(token);if(error||!auth.user)throw new Error('Invalid session');
  const{data:profile}=await db.from('user_profiles').select('profile_role,is_active').eq('id',auth.user.id).maybeSingle();
  if(profile?.profile_role!=='admin'||profile?.is_active===false)throw new Error('Admin access required');
  return{db,mode:'admin'};
}
async function getConnection(db:any,storeId:string){const{data,error}=await db.from('marketing_connections').select('*').eq('store_id',storeId).eq('provider_id','google').maybeSingle();if(error)throw error;if(!data)throw new Error('Google connection is not configured for this store');return data}
async function getConfig(db:any,storeId:string){const{data,error}=await db.from('marketing_provider_configs').select('*').eq('store_id',storeId).eq('provider_id','google').maybeSingle();if(error)throw error;if(!data)throw new Error('Google provider configuration is missing for this store');return data}
async function accessToken(db:any,connection:any,config:any){
  if(!connection.access_token)throw new Error('Google access token is missing; reconnect this store');
  const access=await decrypt(connection.access_token),expires=connection.token_expires_at?new Date(connection.token_expires_at).getTime():0;
  if(!expires||expires>Date.now()+60_000)return access;
  if(!connection.refresh_token)throw new Error('Google authorization expired and no refresh token is available; reconnect this store');
  const refresh=await decrypt(connection.refresh_token),clientSecret=await decrypt(config.encrypted_client_secret);
  const body=new URLSearchParams({client_id:config.client_id,client_secret:clientSecret,refresh_token:refresh,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error(d?.error_description||'Google access token refresh failed');
  const fresh=String(d.access_token),now=new Date().toISOString();
  await db.from('marketing_connections').update({access_token:await encrypt(fresh),token_expires_at:new Date(Date.now()+Number(d.expires_in||3600)*1000).toISOString(),status:'healthy',health_score:100,last_error:null,updated_at:now}).eq('id',connection.id);
  return fresh;
}
async function googleFetch(url:string,access:string,init:RequestInit={}){const h=new Headers(init.headers);h.set('Authorization',`Bearer ${access}`);h.set('Content-Type','application/json');const r=await fetch(url,{...init,headers:h});const t=await r.text();let d:any={};try{d=t?JSON.parse(t):{}}catch{d={raw:t}}if(!r.ok)throw new Error(d?.error?.message||d?.error_description||`Google API ${r.status}`);return d}
function defaultRange(){const end=new Date();end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-6);return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)}}
function validDate(v:string){return/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())}
function domainOfSite(siteUrl:string){if(siteUrl.startsWith('sc-domain:'))return siteUrl.slice(10).toLowerCase().replace(/^www\./,'');try{return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}

async function discover(db:any,storeId:string,access:string,connectionId:string){
  const data=await googleFetch('https://www.googleapis.com/webmasters/v3/sites',access);const sites:any[]=[];const now=new Date().toISOString();
  for(const s of data.siteEntry||[]){const siteUrl=String(s.siteUrl||'');if(!siteUrl)continue;const row={store_id:storeId,connection_id:connectionId,asset_type:'gsc_property',external_id:siteUrl,name:siteUrl,is_assigned:false,status:'active',metadata:{permission_level:s.permissionLevel||null,domain:domainOfSite(siteUrl)},updated_at:now};await db.from('marketing_assets').upsert(row,{onConflict:'store_id,connection_id,asset_type,external_id'});sites.push({siteUrl,permissionLevel:s.permissionLevel||null,domain:domainOfSite(siteUrl)})}
  return sites;
}
async function setProperty(db:any,storeId:string,siteUrl:string){
  const connection=await getConnection(db,storeId),config=await getConfig(db,storeId),access=await accessToken(db,connection,config),sites=await discover(db,storeId,access,connection.id);
  if(!sites.some(s=>s.siteUrl===siteUrl))throw new Error('The selected Search Console property is not accessible by this Google connection');
  const now=new Date().toISOString();const{data:current}=await db.from('analytics_store_configs').select('config').eq('store_id',storeId).maybeSingle();
  const{error}=await db.from('analytics_store_configs').upsert({store_id:storeId,search_console_property:siteUrl,config:{...(current?.config||{}),gsc_property:siteUrl,status:'google_property_selected'},updated_at:now},{onConflict:'store_id'});if(error)throw error;
  await db.from('marketing_assets').update({is_assigned:false,updated_at:now}).eq('store_id',storeId).eq('connection_id',connection.id).eq('asset_type','gsc_property');
  await db.from('marketing_assets').update({is_assigned:true,updated_at:now}).eq('store_id',storeId).eq('connection_id',connection.id).eq('asset_type','gsc_property').eq('external_id',siteUrl);
  return sites.find(s=>s.siteUrl===siteUrl);
}
async function syncStore(db:any,storeId:string,start:string,end:string){
  if(!validDate(start)||!validDate(end))throw new Error('Dates must use YYYY-MM-DD');
  const connection=await getConnection(db,storeId),config=await getConfig(db,storeId),access=await accessToken(db,connection,config);
  const{data:a,error:aerr}=await db.from('analytics_store_configs').select('search_console_property,config').eq('store_id',storeId).maybeSingle();if(aerr)throw aerr;
  const siteUrl=String(a?.search_console_property||'');if(!siteUrl)throw new Error('No Search Console property is selected for this store');
  let startRow=0,rowsImported=0,requests=0,metadata:any=null;const rowLimit=25000;
  while(true){
    const report=await googleFetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,access,{method:'POST',body:JSON.stringify({startDate:start,endDate:end,dimensions:['date','query','page','country','device'],rowLimit,startRow,dataState:'all',aggregationType:'auto'})});requests++;metadata=report.metadata||metadata;const rows=Array.isArray(report.rows)?report.rows:[];
    for(const row of rows){const keys=row.keys||[];const payload={store_id:storeId,metric_date:String(keys[0]||''),query:String(keys[1]||''),page:String(keys[2]||''),country:String(keys[3]||''),device:String(keys[4]||''),search_appearance:'',clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0),data_state:'all',updated_at:new Date().toISOString()};const{error}=await db.from('search_console_daily_metrics').upsert(payload,{onConflict:'store_id,metric_date,query,page,country,device,search_appearance'});if(error)throw error;rowsImported++}
    if(rows.length<rowLimit)break;startRow+=rows.length;if(startRow>=250000)break;
  }
  const now=new Date().toISOString();await db.from('analytics_store_configs').update({last_search_sync_at:now,last_error:null,config:{...(a?.config||{}),last_search_sync:{start,end,rows_imported:rowsImported,requests,metadata,completed_at:now}},updated_at:now}).eq('store_id',storeId);
  await db.from('marketing_connections').update({status:'healthy',health_score:100,last_sync_at:now,last_error:null,updated_at:now}).eq('id',connection.id);
  return{storeId,siteUrl,start,end,rowsImported,requests,metadata,completedAt:now};
}
async function inspectUrl(db:any,storeId:string,url:string){
  const connection=await getConnection(db,storeId),config=await getConfig(db,storeId),access=await accessToken(db,connection,config);const{data:a}=await db.from('analytics_store_configs').select('search_console_property').eq('store_id',storeId).maybeSingle();const siteUrl=String(a?.search_console_property||'');if(!siteUrl)throw new Error('No Search Console property is selected for this store');
  const result=await googleFetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',access,{method:'POST',body:JSON.stringify({inspectionUrl:url,siteUrl,languageCode:'en-GB'})});const idx=result?.inspectionResult?.indexStatusResult||{};const payload={store_id:storeId,inspected_url:url,site_url:siteUrl,verdict:idx.verdict||null,coverage_state:idx.coverageState||null,indexing_state:idx.indexingState||null,robots_txt_state:idx.robotsTxtState||null,page_fetch_state:idx.pageFetchState||null,crawled_as:idx.crawledAs||null,google_canonical:idx.googleCanonical||null,user_canonical:idx.userCanonical||null,last_crawl_time:idx.lastCrawlTime||null,referring_urls:idx.referringUrls||[],sitemap:idx.sitemap||[],raw:result,inspected_at:new Date().toISOString()};const{error}=await db.from('search_console_url_inspections').upsert(payload,{onConflict:'store_id,inspected_url'});if(error)throw error;return payload;
}
async function listSitemaps(db:any,storeId:string){const c=await getConnection(db,storeId),cfg=await getConfig(db,storeId),access=await accessToken(db,c,cfg);const{data:a}=await db.from('analytics_store_configs').select('search_console_property,config').eq('store_id',storeId).maybeSingle();const siteUrl=String(a?.search_console_property||'');if(!siteUrl)throw new Error('No Search Console property is selected for this store');const r=await googleFetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,access);await db.from('analytics_store_configs').update({config:{...(a?.config||{}),gsc_sitemaps:r.sitemap||[],gsc_sitemaps_checked_at:new Date().toISOString()},updated_at:new Date().toISOString()}).eq('store_id',storeId);return r.sitemap||[]}

Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({error:'method_not_allowed'},405);try{const{db,mode}=await requireAccess(req);const body=await req.json().catch(()=>({}));const action=String(body?.action||'sync'),storeId=String(body?.storeId||'').trim();if(action==='cron'){
  if(mode!=='pipeline')throw new Error('Pipeline authorization required');const{data:stores,error}=await db.from('analytics_store_configs').select('store_id,search_console_property').not('search_console_property','is',null);if(error)throw error;const range=defaultRange(),results:any[]=[];for(const s of stores||[]){try{results.push(await syncStore(db,s.store_id,range.start,range.end))}catch(e:any){results.push({storeId:s.store_id,error:e?.message||'Search Console sync failed'})}}return json({success:true,range,results});}
  if(!storeId)return json({error:'storeId is required'},400);const connection=await getConnection(db,storeId),config=await getConfig(db,storeId),access=await accessToken(db,connection,config);
  if(action==='discover'){const sites=await discover(db,storeId,access,connection.id);const{data:store}=await db.from('stores').select('domain').eq('id',storeId).maybeSingle();const domain=String(store?.domain||'').toLowerCase().replace(/^www\./,'');const matches=sites.filter(s=>s.domain===domain);return json({success:true,sites,recommended:matches.length===1?matches[0]:null})}
  if(action==='set_property')return json({success:true,property:await setProperty(db,storeId,String(body?.siteUrl||''))});
  if(action==='sync'){const r=defaultRange();return json({success:true,result:await syncStore(db,storeId,String(body?.startDate||r.start),String(body?.endDate||r.end))})}
  if(action==='inspect'){const url=String(body?.url||'').trim();if(!/^https:\/\//i.test(url))return json({error:'A valid HTTPS url is required'},400);return json({success:true,result:await inspectUrl(db,storeId,url)})}
  if(action==='sitemaps')return json({success:true,sitemaps:await listSitemaps(db,storeId)});
  return json({error:'unsupported_action'},400);
}catch(e:any){const message=e?.message||'Search Console sync failed';console.error('[google-search-console-sync]',message);return json({error:message},/Authorization|session|Admin access|Pipeline authorization/i.test(message)?401:500)}})
