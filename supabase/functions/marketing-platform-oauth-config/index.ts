import { createClient } from 'npm:@supabase/supabase-js@2'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}})
const admin=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const env=(name:string)=>{const value=Deno.env.get(name)?.trim();if(!value)throw new Error(`Missing Edge Function secret: ${name}`);return value}
const b64=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
const unb64=(value:string)=>{const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0))}
async function key(){const raw=unb64(env('MARKETING_TOKEN_ENCRYPTION_KEY'));if(raw.length!==32)throw new Error('MARKETING_TOKEN_ENCRYPTION_KEY must decode to 32 bytes');return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt'])}
async function encrypt(value:string){const k=await key(),iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(value)));const out=new Uint8Array(iv.length+cipher.length);out.set(iv);out.set(cipher,iv.length);return`enc:v1:${b64(out)}`}
async function requireAdmin(req:Request){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!token)throw new Error('Authorization required');const db=admin();const{data:auth,error}=await db.auth.getUser(token);if(error||!auth.user)throw new Error('Invalid session');const{data:profile}=await db.from('user_profiles').select('profile_role,is_active').eq('id',auth.user.id).maybeSingle();if(profile?.profile_role!=='admin'||profile?.is_active===false)throw new Error('Admin access required');return db}
function safe(row:any){return{provider_id:row?.provider_id||'google',configured:Boolean(row&&row.status==='configured'&&row.client_id&&row.encrypted_client_secret),client_id_hint:row?.client_id?`${String(row.client_id).slice(0,10)}…`:null,redirect_uri:row?.redirect_uri||null,app_label:row?.app_label||null,status:row?.status||'not_configured',developer_token_stored:Boolean(row?.encrypted_developer_token),login_customer_id:row?.login_customer_id||null,ads_api_ready:Boolean(row?.encrypted_developer_token),updated_at:row?.updated_at||null}}
async function seedStoreConfig(db:any,storeId:string,platform:any){
  const payload:any={store_id:storeId,provider_id:'google',client_id:platform.client_id,encrypted_client_secret:platform.encrypted_client_secret,redirect_uri:platform.redirect_uri,app_label:platform.app_label||'CentralHub Google',status:'configured',public_config:{managed_by:'centralhub',one_account_per_store:true,login_customer_id:platform.login_customer_id||''},encrypted_secrets:{client_secret:platform.encrypted_client_secret},updated_at:new Date().toISOString()}
  if(platform.encrypted_developer_token){payload.encrypted_developer_token=platform.encrypted_developer_token;payload.encrypted_secrets.developer_token=platform.encrypted_developer_token}
  if(platform.login_customer_id)payload.login_customer_id=platform.login_customer_id
  const{data,error}=await db.from('marketing_provider_configs').upsert(payload,{onConflict:'store_id,provider_id'}).select('id,status,redirect_uri,app_label,login_customer_id').single();if(error)throw error;return data
}
async function seedAllStores(db:any,platform:any){const{data:stores,error}=await db.from('stores').select('id');if(error)throw error;for(const store of stores||[])await seedStoreConfig(db,store.id,platform);return(stores||[]).length}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({error:'method_not_allowed'},405)
  try{
    const db=await requireAdmin(req),body=await req.json().catch(()=>({})),action=String(body?.action||'get'),providerId=String(body?.providerId||'google').trim()
    if(providerId!=='google')return json({error:'Managed one-click OAuth is currently enabled for Google only'},400)
    const redirectUri=`${Deno.env.get('SUPABASE_URL')}/functions/v1/google-marketing-oauth`
    if(action==='get'){
      const{data,error}=await db.from('marketing_platform_oauth_apps').select('*').eq('provider_id',providerId).maybeSingle();if(error)throw error
      return json({success:true,config:safe(data),required_redirect_uri:redirectUri})
    }
    if(action==='save'){
      const requestedClientId=String(body?.clientId||'').trim(),clientSecret=String(body?.clientSecret||'').trim(),developerToken=String(body?.developerToken||'').trim(),loginCustomerId=String(body?.loginCustomerId||'').replace(/-/g,'').trim(),appLabel=String(body?.appLabel||'CentralHub Google').trim()
      if(loginCustomerId&&!/^\d{10}$/.test(loginCustomerId))return json({error:'Google Ads Manager Customer ID must contain 10 digits'},400)
      const{data:old}=await db.from('marketing_platform_oauth_apps').select('*').eq('provider_id',providerId).maybeSingle()
      const clientId=requestedClientId||old?.client_id||''
      if(!clientId)return json({error:'Google OAuth Client ID is required'},400)
      if(!clientSecret&&!old?.encrypted_client_secret)return json({error:'Google OAuth Client Secret is required for the initial setup'},400)
      const payload:any={provider_id:providerId,client_id:clientId,redirect_uri:redirectUri,app_label:appLabel||old?.app_label||'CentralHub Google',status:'configured',metadata:{...(old?.metadata||{}),mode:'centralhub_managed_oauth',one_account_per_store:true,ads_billing_visibility:Boolean(developerToken||old?.encrypted_developer_token)},updated_at:new Date().toISOString(),encrypted_client_secret:clientSecret?await encrypt(clientSecret):old.encrypted_client_secret,encrypted_developer_token:developerToken?await encrypt(developerToken):(old?.encrypted_developer_token||null),login_customer_id:loginCustomerId||old?.login_customer_id||null}
      const{data,error}=await db.from('marketing_platform_oauth_apps').upsert(payload,{onConflict:'provider_id'}).select('*').single();if(error)throw error
      return json({success:true,config:safe(data),required_redirect_uri:redirectUri,stores_prepared:await seedAllStores(db,data)})
    }
    if(action==='save_ads'){
      const developerToken=String(body?.developerToken||'').trim(),loginCustomerId=String(body?.loginCustomerId||'').replace(/-/g,'').trim()
      if(loginCustomerId&&!/^\d{10}$/.test(loginCustomerId))return json({error:'Google Ads Manager Customer ID must contain 10 digits'},400)
      const{data:old,error:oldError}=await db.from('marketing_platform_oauth_apps').select('*').eq('provider_id',providerId).maybeSingle();if(oldError)throw oldError
      if(!old||old.status!=='configured')return json({error:'Complete the one-time CentralHub Google OAuth setup first'},400)
      if(!developerToken&&!old.encrypted_developer_token)return json({error:'Google Ads Developer Token is required to enable Ads and billing visibility'},400)
      const{data,error}=await db.from('marketing_platform_oauth_apps').update({encrypted_developer_token:developerToken?await encrypt(developerToken):old.encrypted_developer_token,login_customer_id:loginCustomerId||old.login_customer_id||null,metadata:{...(old.metadata||{}),ads_billing_visibility:true},updated_at:new Date().toISOString()}).eq('provider_id',providerId).select('*').single();if(error)throw error
      return json({success:true,config:safe(data),stores_prepared:await seedAllStores(db,data)})
    }
    if(action==='prepare_store'){
      const storeId=String(body?.storeId||'').trim();if(!storeId)return json({error:'storeId is required'},400)
      const[{data:store},{data:platform,error:platformError}]=await Promise.all([db.from('stores').select('id,name').eq('id',storeId).maybeSingle(),db.from('marketing_platform_oauth_apps').select('*').eq('provider_id',providerId).eq('status','configured').maybeSingle()])
      if(platformError)throw platformError;if(!store)return json({error:'Store not found'},404);if(!platform)return json({error:'CentralHub Google connection service has not been set up yet'},400)
      return json({success:true,ready:true,config:await seedStoreConfig(db,storeId,platform),ads_api_ready:Boolean(platform.encrypted_developer_token)})
    }
    if(action==='disable'){
      const{data,error}=await db.from('marketing_platform_oauth_apps').update({status:'disabled',updated_at:new Date().toISOString()}).eq('provider_id',providerId).select('*').maybeSingle();if(error)throw error
      return json({success:true,config:safe(data)})
    }
    return json({error:'unsupported_action'},400)
  }catch(e:any){const message=e?.message||'Platform OAuth configuration failed';return json({success:false,error:message},/Authorization|session|Admin access/i.test(message)?401:400)}
})
