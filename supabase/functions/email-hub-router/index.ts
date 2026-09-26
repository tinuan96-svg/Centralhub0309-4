import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const key=()=>Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||''}catch{return''}})();
const db=()=>createClient(Deno.env.get('SUPABASE_URL')!,key(),{auth:{persistSession:false}});
const norm=(v:unknown)=>String(v||'').toLowerCase();
function classify(m:any){
 const from=norm(m.from_address),s=norm(m.subject),b=norm(m.body_text).slice(0,50000),t=s+'\n'+b;
 let category='other',route='email/review',priority='normal',approval=true,confidence=.65,sub:string|null=null;
 if(/@.*dhl|dhl\.com|dhl parcel|dhl ecommerce/.test(from+' '+t)&&/(invoice|billing|statement|consignment|shipment)/.test(t)){category='dhl';route='shipping/dhl-reconciliation';approval=false;confidence=.98}
 else if(/hmrc|hm revenue|gov\.uk/.test(from+' '+t)){category=/\bvat\b|value added tax/.test(t)?'vat':/\bpaye\b|pay as you earn/.test(t)?'paye':/corporation tax/.test(t)?'corporation_tax':'hmrc';route='finance/tax-compliance';priority='high';confidence=.95}
 else if(/solicitor|law firm|legal notice|court|county court|claim form|summons|breach notice|letter before action/.test(t)){category='legal';route='legal-compliance';priority='critical';confidence=.92}
 else if(/supplier|purchase order|proforma|credit note|invoice|statement/.test(t)){category='supplier';route='procurement/supplier-invoices';confidence=.78}
 else if(/refund|return|complaint|where is my order|delivery problem|order #|order number/.test(t)){category='customer';route='customer-care';confidence=.78}
 else if(/bank|card payment|chargeback|dispute|settlement|merchant/.test(t)){category='banking';route='finance/reconciliation';priority='high';confidence=.8}
 else if(/payroll|employee|right to work|visa|absence|holiday/.test(t)){category='hr';route='hr-payroll';confidence=.75}
 const deadline=t.match(/(?:deadline|due(?:\s+date)?|respond by|pay by|before)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i)?.[1]||null;
 const amount=t.match(/(?:£|gbp\s*)([0-9][0-9,]*\.\d{2})/i)?.[1]||null;
 const summary=(m.subject?String(m.subject)+'. ':'')+(m.body_text?String(m.body_text).replace(/\s+/g,' ').slice(0,420):'No plain-text body stored.');
 return{category,subcategory:sub,route_target:route,priority,requires_human_approval:approval,confidence,ai_summary:summary,action_summary:approval?'Review before any consequential action.':'Eligible for deterministic processor; ambiguous matches still require review.',detected_deadline:deadline&&Date.parse(deadline)?new Date(deadline).toISOString():null,detected_amount:amount?Number(amount.replace(/,/g,'')):null,detected_currency:amount?'GBP':null};
}
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 const secret=(req.headers.get('x-email-hub-worker-secret')||'').trim(),expected=(Deno.env.get('EMAIL_HUB_WORKER_SECRET')||'').trim();
 const auth=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
 const d=db();let allowed=!!expected&&secret===expected;
 if(!allowed&&auth){const{data}=await d.auth.getUser(auth);if(data.user){const{data:p}=await d.from('user_profiles').select('profile_role,is_active').eq('id',data.user.id).maybeSingle();allowed=p?.profile_role==='admin'&&p?.is_active!==false}}
 if(!allowed)return json({error:'unauthorized'},401);
 const body=await req.json().catch(()=>({}));const id=body?.messageId?String(body.messageId):null;
 let q=d.from('email_hub_messages').select('*').in('route_status',['pending','failed']).order('received_at',{ascending:true}).limit(Math.min(100,Number(body?.limit||50)));
 if(id)q=d.from('email_hub_messages').select('*').eq('id',id).limit(1);
 const{data:messages,error}=await q;if(error)return json({error:'load_failed'},503);
 const out:any[]=[];
 for(const m of messages||[]){try{const c=classify(m);const{data:updated,error:e}=await d.from('email_hub_messages').update({...c,route_status:c.confidence<.75?'needs_review':'routed',processing_error:null,updated_at:new Date().toISOString()}).eq('id',m.id).select('id,category,priority,route_status,route_target,requires_human_approval').single();if(e)throw e;await d.from('email_hub_events').insert({message_id:m.id,event_type:'classified_and_routed',detail:{category:c.category,route_target:c.route_target,confidence:c.confidence,requires_human_approval:c.requires_human_approval}});out.push(updated)}catch(e:any){await d.from('email_hub_messages').update({route_status:'failed',processing_error:String(e?.message||e).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',m.id);out.push({id:m.id,error:true})}}
 return json({success:true,processed:out.length,messages:out});
});