import {NextResponse} from 'next/server';
import {requireVerifiedSuperAdmin,AccessDenied} from '@/lib/access-control/admin';
export const runtime='nodejs';export const dynamic='force-dynamic';
const h={'Cache-Control':'no-store, private','Vary':'Authorization'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const origins=new Set(['https://centralhub.network','https://main--centralhubnetwork.netlify.app']);
const allowed=new Set(['annual','sick','unpaid','maternity','paternity','adoption','parental','other']);
const err=(e:unknown)=>NextResponse.json({error:e instanceof AccessDenied?e.message:'Leave request unavailable.'},{status:e instanceof AccessDenied?e.status:503,headers:h});
function validDate(s:unknown){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||
 !Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new AccessDenied('Invalid leave date.',400);return s;}
export async function POST(request:Request){try{
 if(!origins.has(request.headers.get('origin')||'')||
 !['same-origin','none'].includes(request.headers.get('sec-fetch-site')||'same-origin'))throw new AccessDenied('Same-origin request required.',403);
 if(Number(request.headers.get('content-length')||0)>2048)throw new AccessDenied('Request too large.',413);
 const {admin,actorId}=await requireVerifiedSuperAdmin(request);const b=await request.json().catch(()=>null);
 const company=typeof b?.company==='string'?b.company:'';
 const employee=typeof b?.employee==='string'?b.employee:'';
 const type=b?.leaveType;
 if(!uuid.test(company)||!uuid.test(employee)||!allowed.has(type)||b?.humanReviewed!==true)
 throw new AccessDenied('Check company, employee, leave type, and human review.',400);
 const start=validDate(b.startsOn),end=validDate(b.endsOn);
 const c=await admin.from('store_business_identity').select('id').eq('id',company).maybeSingle();
 if(c.error||!c.data)throw new AccessDenied('Employer not available.',403);
 const r=await admin.rpc('ch_hr_admin_create_leave_request',{
  p_company_id:company,p_employee_id:employee,p_leave_type:type,p_start:start,p_end:end,p_actor:actorId
 });
 if(r.error)throw new AccessDenied('Leave request was not recorded. Review employment and overlapping requests.',409);
 return NextResponse.json({id:r.data,status:'pending',payrollEffect:false,leaveEntitlementCalculated:false},{status:201,headers:h});
}catch(e){return err(e)}}
