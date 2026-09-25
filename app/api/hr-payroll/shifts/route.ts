import {NextResponse} from 'next/server';
import {requireVerifiedSuperAdmin,AccessDenied} from '@/lib/access-control/admin';
export const runtime='nodejs';export const dynamic='force-dynamic';
const h={'Cache-Control':'no-store, private','Vary':'Authorization'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const origins=new Set(['https://centralhub.network','https://main--centralhubnetwork.netlify.app']);
const bad=(e:unknown)=>NextResponse.json({error:e instanceof AccessDenied?e.message:'Shift service unavailable.'},{status:e instanceof AccessDenied?e.status:503,headers:h});
async function employer(admin:Awaited<ReturnType<typeof requireVerifiedSuperAdmin>>['admin'],id:string){
 if(!uuid.test(id))throw new AccessDenied('Select an employer.',400);
 const r=await admin.from('store_business_identity').select('id').eq('id',id).maybeSingle();
 if(r.error||!r.data)throw new AccessDenied('Employer unavailable.',403);
}
export async function GET(request:Request){try{
 const {admin}=await requireVerifiedSuperAdmin(request);
 const company=new URL(request.url).searchParams.get('company')||'';
 await employer(admin,company);
 const r=await admin.rpc('ch_hr_admin_shift_list',{p_company_id:company});
 if(r.error)throw new AccessDenied('Shift data unavailable.',503);
 return NextResponse.json({shifts:r.data||[],payrollSync:false},{headers:h});
}catch(e){return bad(e)}}
export async function POST(request:Request){try{
 if(!origins.has(request.headers.get('origin')||'')||
 !['same-origin','none'].includes(request.headers.get('sec-fetch-site')||'same-origin'))
 throw new AccessDenied('Same-origin request required.',403);
 if(Number(request.headers.get('content-length')||0)>2048)throw new AccessDenied('Shift request too large.',413);
 const {admin,actorId}=await requireVerifiedSuperAdmin(request);
 const b=await request.json().catch(()=>null);
 const company=typeof b?.company==='string'?b.company:'';
 await employer(admin,company);
 if(b?.action==='plan'){
  const employee=typeof b.employee==='string'?b.employee:'';
  const start=typeof b.start==='string'?b.start:'',end=typeof b.end==='string'?b.end:'';
  const breaks=b.breakMinutes;
  if(!uuid.test(employee)||!Number.isInteger(breaks)||breaks<0||breaks>960||
    !Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||start.length>40||end.length>40)
   throw new AccessDenied('Check employee, dates, and break length.',400);
  const r=await admin.rpc('ch_hr_admin_plan_shift',{
   p_company_id:company,p_employee_id:employee,p_start:start,p_end:end,p_break_minutes:breaks,p_actor:actorId
  });
  if(r.error)throw new AccessDenied('Shift could not be planned. Check for overlaps or invalid working hours.',409);
  return NextResponse.json({id:r.data,status:'planned',issued:false},{status:201,headers:h});
 }
 if(b?.action==='publish'){
  if(!uuid.test(b.shift)||b.humanReviewed!==true)
   throw new AccessDenied('An authorised human must confirm the shift.',400);
  const r=await admin.rpc('ch_hr_admin_publish_shift',{p_company_id:company,p_shift_id:b.shift,p_actor:actorId});
  if(r.error)throw new AccessDenied('Shift not issued. Only active workers and planned shifts are eligible.',409);
  return NextResponse.json({id:b.shift,status:r.data,issued:true,externalSubmission:false},{headers:h});
 }
 throw new AccessDenied('Unsupported shift action.',400);
}catch(e){return bad(e)}}
