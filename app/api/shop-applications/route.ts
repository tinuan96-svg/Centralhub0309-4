import { NextResponse } from 'next/server';
import { AccessDenied, requireVerifiedSuperAdmin } from '@/lib/access-control/admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Authorization'};
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function failure(e:unknown){const code=e instanceof AccessDenied?e.status:503;return NextResponse.json({error:e instanceof AccessDenied?e.message:'CentralHub application review is temporarily unavailable.'},{status:code,headers});}
export async function GET(request:Request){try{
 const {admin}=await requireVerifiedSuperAdmin(request);
 const [applications,demoRequests]=await Promise.all([
   admin.from('shop_applications').select('id,reference,business_name,contact_email,selected_plan,application_payload,status,admin_notes,reviewed_by,verified_by_admin,created_at,updated_at').order('created_at',{ascending:false}).limit(100),
   admin.from('shop_demo_requests').select('id,reference,full_name,business_name,contact_email,message,created_at').order('created_at',{ascending:false}).limit(100)
 ]);
 if(applications.error||demoRequests.error)throw new AccessDenied('CentralHub application queue is unavailable.',503);
 return NextResponse.json({applications:applications.data||[],demoRequests:demoRequests.data||[]},{headers});
}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 const {admin,actorId}=await requireVerifiedSuperAdmin(request);
 if(Number(request.headers.get('content-length')||0)>3000)throw new AccessDenied('Request too large.',413);
 let body:any;try{body=await request.json()}catch{throw new AccessDenied('Invalid request.',400)}
 if(!idPattern.test(String(body?.id||''))||!['under_review','info_requested','approved','rejected'].includes(body?.action))throw new AccessDenied('Invalid review request.',400);
 if(body.action==='approved'&&body.verified!==true)throw new AccessDenied('Confirm verification before approval.',400);
 const {data,error}=await admin.rpc('shop_review_application',{p_id:body.id,p_action:body.action,p_note:String(body.note||'').slice(0,1000),p_reviewer:actorId,p_verified:body.verified===true});
 if(error)throw new AccessDenied('Review could not be saved. Refresh and try again.',409);
 return NextResponse.json({application:{id:data.id,status:data.status,updated_at:data.updated_at}},{headers});
}catch(e){return failure(e)}}
