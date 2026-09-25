import {NextResponse} from 'next/server';
import {requireVerifiedSuperAdmin,AccessDenied} from '@/lib/access-control/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store, private','Vary':'Authorization'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedOrigins=new Set(['https://centralhub.network','https://main--centralhubnetwork.netlify.app']);
const errorResponse=(error:unknown)=>{
  if(error instanceof AccessDenied)return NextResponse.json({error:error.message},{status:error.status,headers:noStore});
  // Never log request contents or confidential HR records.
  return NextResponse.json({error:'HR operation unavailable; no records changed if this request was rejected.'},{status:503,headers:noStore});
};
async function verifyCompany(admin:Awaited<ReturnType<typeof requireVerifiedSuperAdmin>>['admin'],companyId:string){
  if(!UUID.test(companyId))throw new AccessDenied('Select a registered company',400);
  const {data,error}=await admin.from('store_business_identity').select('id').eq('id',companyId).maybeSingle();
  if(error||!data)throw new AccessDenied('Company is not registered for HR access',403);
}
export async function GET(request:Request){
  try{
    const {admin}=await requireVerifiedSuperAdmin(request);
    const {data:companies,error}=await admin.from('store_business_identity')
      .select('id,store_id,legal_company_name,trading_name').order('legal_company_name');
    if(error)throw new AccessDenied('HR company directory unavailable',503);
    const query=new URL(request.url).searchParams;
    const company=query.get('company')||'';
    if(!company)return NextResponse.json({companies:companies||[],snapshot:null},{headers:noStore});
    await verifyCompany(admin,company);
    const {data,error:readError}=await admin.rpc('ch_hr_admin_snapshot',{p_company_id:company});
    if(readError)throw new AccessDenied('Private HR records unavailable',503);
    return NextResponse.json({companies:companies||[],snapshot:data},{headers:noStore});
  }catch(error){return errorResponse(error)}
}
export async function POST(request:Request){
  try{
    const origin=request.headers.get('origin');
    if(!origin||!allowedOrigins.has(origin)||(request.headers.get('sec-fetch-site')&&!['same-origin','none'].includes(request.headers.get('sec-fetch-site')!)))
      throw new AccessDenied('Same-origin confirmation required',403);
    if(Number(request.headers.get('content-length')||0)>4096)throw new AccessDenied('Request too large',413);
    const {admin,actorId}=await requireVerifiedSuperAdmin(request);
    const input=await request.json().catch(()=>null);
    if(!input||input.action!=='create_employee_draft'||typeof input.company!=='string')
      throw new AccessDenied('Unsupported HR action',400);
    const company=input.company;
    const employeeNumber=typeof input.employee_number==='string'?input.employee_number.trim():'';
    const fullName=typeof input.full_name==='string'?input.full_name.trim():'';
    const title=typeof input.job_title==='string'?input.job_title.trim():'';
    const start=typeof input.start_date==='string'?input.start_date:'';
    if(!/^[a-zA-Z0-9._-]{1,32}$/.test(employeeNumber)||fullName.length<1||fullName.length>200||
       title.length>120||!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(start)||
       !Number.isFinite(Date.parse(start))||new Date(start).toISOString().slice(0,10)!==start)
      throw new AccessDenied('Check draft employee fields',400);
    await verifyCompany(admin,company);
    const {data,error}=await admin.rpc('ch_hr_admin_create_draft_employee',{
      p_company_id:company,p_employee_number:employeeNumber,p_full_name:fullName,
      p_start_date:start,p_job_title:title,p_actor:actorId
    });
    if(error){
      if(error.code==='23505')throw new AccessDenied('This employee number is already assigned to this company',409);
      throw new AccessDenied('Unable to save draft employee',503);
    }
    return NextResponse.json({id:data,status:'draft'},{status:201,headers:noStore});
  }catch(error){return errorResponse(error)}
}
