import {NextResponse} from 'next/server';
import {requireVerifiedSuperAdmin,AccessDenied} from '@/lib/access-control/admin';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private','Vary':'Authorization'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const origins=new Set(['https://centralhub.network','https://main--centralhubnetwork.netlify.app']);
function date(s:unknown):string|null{
 if(s==null||s==='')return null;
 if(typeof s!=='string'||!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(s))throw new AccessDenied('Invalid case date.',400);
 const d=new Date(s);
 if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==s)throw new AccessDenied('Invalid case date.',400);
 return s;
}
export async function POST(request:Request){try{
 if(!origins.has(request.headers.get('origin')||'')||
  !['same-origin','none'].includes(request.headers.get('sec-fetch-site')||'same-origin'))
  throw new AccessDenied('Same-origin request required.',403);
 if(Number(request.headers.get('content-length')||0)>2048)throw new AccessDenied('Case request too large.',413);
 const {admin,actorId}=await requireVerifiedSuperAdmin(request);
 const b=await request.json().catch(()=>null);
 const company=typeof b?.company==='string'?b.company:'';
 const employee=typeof b?.employee==='string'?b.employee:'';
 const occupation=typeof b?.occupation==='string'?b.occupation.trim():'';
 const title=typeof b?.title==='string'?b.title.trim():'';
 if(!UUID.test(company)||!UUID.test(employee)||occupation.length>20||title.length>120||b?.humanReviewAcknowledged!==true)
  throw new AccessDenied('Review the company, employee and case details.',400);
 const visa=date(b?.visaExpiry),followup=date(b?.rightToWorkFollowup);
 if(!visa&&!followup)throw new AccessDenied('Enter at least one review date.',400);
 const c=await admin.from('store_business_identity').select('id').eq('id',company).maybeSingle();
 if(c.error||!c.data)throw new AccessDenied('Employer is unavailable.',403);
 const r=await admin.rpc('ch_hr_admin_create_sponsor_case_draft',{
  p_company_id:company,p_employee_id:employee,p_occupation_code:occupation,p_job_title:title,
  p_visa_expiry:visa,p_rtw_followup:followup,p_actor:actorId
 });
 if(r.error)throw new AccessDenied('The case was not saved. Confirm the employee is in this employer.',409);
 return NextResponse.json({id:r.data,status:'review_required',liveUKVISubmission:false},{status:201,headers});
}catch(e){return NextResponse.json({error:e instanceof AccessDenied?e.message:'Sponsor review unavailable.'},{status:e instanceof AccessDenied?e.status:503,headers});}}
