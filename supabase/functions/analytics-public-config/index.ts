import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const cors=(origin:string|null)=>({
  'Access-Control-Allow-Origin':origin||'*',
  'Access-Control-Allow-Methods':'GET, OPTIONS',
  'Access-Control-Allow-Headers':'content-type',
  'Cache-Control':'public, max-age=60, stale-while-revalidate=300',
  'Vary':'Origin',
})
const clean=(v:string|null,max=200)=>v?.trim().slice(0,max)||''
function host(value:string){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
Deno.serve(async(req)=>{
  const origin=req.headers.get('origin')
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)})
  if(req.method!=='GET')return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{...cors(origin),'Content-Type':'application/json'}})
  const url=new URL(req.url),trackingId=clean(url.searchParams.get('tracking_id'))
  if(!trackingId)return new Response(JSON.stringify({error:'tracking_id_required'}),{status:400,headers:{...cors(origin),'Content-Type':'application/json'}})
  const{data:cfg,error}=await supabase.from('analytics_store_tracking_configs').select('store_id,enabled,ga4_measurement_id').eq('public_tracking_id',trackingId).maybeSingle()
  if(error||!cfg?.enabled)return new Response(JSON.stringify({error:'invalid_tracking_id'}),{status:404,headers:{...cors(origin),'Content-Type':'application/json'}})
  const{data:store,error:storeError}=await supabase.from('stores').select('slug,domain').eq('id',cfg.store_id).maybeSingle()
  if(storeError||!store)return new Response(JSON.stringify({error:'store_not_found'}),{status:404,headers:{...cors(origin),'Content-Type':'application/json'}})
  if(origin){const expected=String(store.domain||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');if(expected&&host(origin)!==expected)return new Response(JSON.stringify({error:'origin_not_allowed'}),{status:403,headers:{...cors(origin),'Content-Type':'application/json'}})}
  const measurementId=String(cfg.ga4_measurement_id||'').trim()
  return new Response(JSON.stringify({store:String(store.slug||''),analytics_enabled:true,ga4:{configured:/^G-[A-Z0-9]+$/i.test(measurementId),measurement_id:/^G-[A-Z0-9]+$/i.test(measurementId)?measurementId:null},consent_required:true}),{status:200,headers:{...cors(origin),'Content-Type':'application/json'}})
})