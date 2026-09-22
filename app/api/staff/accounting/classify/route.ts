import {StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic';export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const CATEGORIES=new Set(['revenue','cogs','variable_cost','operating_expense','finance_cost',
 'tax','asset','liability','equity','transfer','other']);

/** Accountant categorisation ONLY. Cannot change amount, bank balance,
 * invoice payment, settled/reconciled flag, ledger or payout details. */
export async function POST(request:Request){
 try{
  const context=await requireStaffContext(request);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const id=body?.bank_transaction_id,storeId=body?.store_id,category=body?.accounting_category;
  if(typeof id!=='string'||!UUID.test(id)||typeof storeId!=='string'||!UUID.test(storeId)||
     typeof category!=='string'||!CATEGORIES.has(category))
    throw new StaffAccessDenied('Select an assigned bank transaction and a valid accounting category',400);
  requireStaffPermission(context,'finance.view',storeId);
  requireStaffPermission(context,'finance.edit',storeId);
  const {data,error}=await context.admin.rpc('ch_staff_classify_bank_transaction',{
    p_actor:context.userId,p_bank_transaction_id:id,p_store_id:storeId,p_category:category
  });
  if(error){
    if(error.code==='42501')throw new StaffAccessDenied('Finance access or store assignment was revoked',403);
    if(error.code==='P0002')throw new StaffAccessDenied('This bank transaction cannot be changed; it may be reconciled or assigned elsewhere',409);
    if(error.code==='22023')throw new StaffAccessDenied('Invalid accounting category',400);
    throw error;
  }
  return Response.json({success:true,bank_transaction_id:data,accounting_category:category,
    amount_changed:false,reconciled:false},{headers:{'Cache-Control':'no-store, private'}});
 }catch(error){return staffErrorResponse(error);}
}
