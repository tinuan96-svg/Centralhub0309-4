import {NextResponse} from 'next/server';
import {requireVerifiedSuperAdmin,AccessDenied} from '@/lib/access-control/admin';
export const runtime='nodejs'; export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private','Vary':'Authorization'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const origins=new Set(['https://centralhub.network','https://main--centralhubnetwork.netlify.app']);
function reject(e:unknown){return NextResponse.json({error:e instanceof AccessDenied?e.message:'HR task operation unavailable.'},{status:e instanceof AccessDenied?e.status:503,headers});}
async function verifyCompany(admin:Awaited<ReturnType<typeof requireVerifiedSuperAdmin>>['admin'],companyId:string){
 if(!UUID.test(companyId))throw new AccessDenied('Select an employer.',400);
 const r=await admin.from('store_business_identity').select('id').eq('id',companyId).maybeSingle();
 if(r.error||!r.data)throw new AccessDenied('Employer not found or unavailable.',403);
}
export async function GET(request:Request){try{
 const {admin}=await requireVerifiedSuperAdmin(request);
 const companyId=new URL(request.url).searchParams.get('company')||'';
 await verifyCompany(admin,companyId);
 const result=await admin.rpc('ch_hr_admin_task_list',{p_company_id:companyId});
 if(result.error)throw new AccessDenied('Compliance tasks unavailable.',503);
 return NextResponse.json({tasks:result.data||[],mode:'human-review',externalSubmissionEnabled:false},{headers});
}catch(e){return reject(e)}}
export async function POST(request:Request){try{
 const origin=request.headers.get('origin')||'';
 if(!origins.has(origin)||!['same-origin','none'].includes(request.headers.get('sec-fetch-site')||'same-origin'))
  throw new AccessDenied('Same-origin request required.',403);
 const size=Number(request.headers.get('content-length')||0);
 if(!Number.isFinite(size)||size>2048)throw new AccessDenied('Task review request too large.',413);
 const {admin,actorId}=await requireVerifiedSuperAdmin(request);
 const body=await request.json().catch(()=>null);
 const company=typeof body?.company==='string'?body.company:'';
 const task=typeof body?.task==='string'?body.task:'';
 const action=body?.action;
 const note=typeof body?.note==='string'?body.note.trim():'';
 if(!UUID.test(task)||!['complete','reopen'].includes(action)||body?.humanReviewed!==true||
    (action==='complete'&&(note.length<20||note.length>400))||note.length>400)
  throw new AccessDenied('Verify the task and record a review note (20–400 characters).',400);
 await verifyCompany(admin,company);
 const result=await admin.rpc('ch_hr_admin_review_task',{
  p_company_id:company,p_task_id:task,p_actor:actorId,p_action:action,p_note:note
 });
 if(result.error)throw new AccessDenied('Task review was not recorded. Refresh and verify its status.',409);
 return NextResponse.json({task,status:result.data,reviewedBy:'authorised_super_admin',externalSubmission:false},{headers});
}catch(e){return reject(e)}}
