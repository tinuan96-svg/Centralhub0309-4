import {StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic';export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
export async function POST(request:Request){
 try{
  const context=await requireStaffContext(request);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const transactionId=body?.bank_transaction_id,storeId=body?.store_id,orderNumber=body?.order_number;
  if(typeof transactionId!=='string'||!UUID.test(transactionId)||
    typeof storeId!=='string'||!UUID.test(storeId)||
    typeof orderNumber!=='string'||orderNumber.trim().length<3||orderNumber.length>80||
    body?.confirm_exact_single_order_match!==true)
    throw new StaffAccessDenied('Confirm an exact reference and amount for one paid order in your assigned store',400);
  requireStaffPermission(context,'finance.view',storeId);
  requireStaffPermission(context,'finance.reconcile',storeId);
  const {data,error}=await context.admin.rpc('ch_staff_reconcile_exact_order_credit',{
   p_actor:context.userId,p_transaction_id:transactionId,p_store_id:storeId,
   p_order_number:orderNumber.trim()
  });
  if(error){
   if(error.code==='42501')throw new StaffAccessDenied('Reconciliation permission or store access was revoked',403);
   if(error.code==='P0002')throw new StaffAccessDenied('Transaction or order is already reconciled or not eligible',409);
   if(error.code==='23514')throw new StaffAccessDenied('The bank reference, amount or order does not match exactly; use manager review',409);
   if(error.code==='22023')throw new StaffAccessDenied('Invalid reconciliation request',400);
   throw error;
  }
  if(data!==transactionId)throw new Error('Unexpected reconciliation result');
  return Response.json({success:true,bank_transaction_id:transactionId,
    reconciliation_source:'staff_exact_order_match'},{headers:{'Cache-Control':'no-store, private'}});
 }catch(error){return staffErrorResponse(error);}
}
