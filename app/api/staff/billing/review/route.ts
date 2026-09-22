import {StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic';export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

/** Review ONLY. No finance posting, invoice issuance or money movement. */
export async function POST(request:Request){
 try{
  const context=await requireStaffContext(request);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const documentId=body?.document_id,storeId=body?.store_id,decision=body?.decision,note=body?.note;
  if(typeof documentId!=='string'||!UUID.test(documentId)||
     typeof storeId!=='string'||!UUID.test(storeId)||
     (decision!=='reviewed'&&decision!=='needs_correction')||
     typeof note!=='string'||note.length>1000||(decision==='needs_correction'&&note.trim().length<5))
    throw new StaffAccessDenied('Provide a valid document, store, review decision and review note',400);
  requireStaffPermission(context,'billing.view',storeId);
  requireStaffPermission(context,'billing.edit',storeId);
  const {data,error}=await context.admin.rpc('ch_staff_review_billing_document',{
    p_actor:context.userId,p_document_id:documentId,p_store_id:storeId,
    p_decision:decision,p_note:note.trim()
  });
  if(error){
    if(error.code==='42501')throw new StaffAccessDenied('Billing access or assigned store was revoked',403);
    if(error.code==='P0002')throw new StaffAccessDenied('This document is unavailable for review',409);
    if(error.code==='23514')throw new StaffAccessDenied('Invoice number, date, GBP currency and gross amount must be verified first',409);
    if(error.code==='22023')throw new StaffAccessDenied('Invalid billing review',400);
    throw error;
  }
  return Response.json({success:true,review_id:data,document_id:documentId,decision,
    posting_changed:false,invoice_issued:false},{headers:{'Cache-Control':'no-store, private'}});
 }catch(error){return staffErrorResponse(error);}
}
