import {StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic'; export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:Request){
 try{
  const context=await requireStaffContext(request);
  const payload=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const orderId=payload?.order_id,storeId=payload?.store_id,duration=payload?.duration_seconds;
  if(typeof orderId!=='string'||!UUID.test(orderId)||typeof storeId!=='string'||!UUID.test(storeId)||
    typeof duration!=='number'||!Number.isInteger(duration)||duration<0||duration>43200)
    throw new StaffAccessDenied('Invalid picking completion request',400);
  requireStaffPermission(context,'fulfilment.view',storeId);
  requireStaffPermission(context,'fulfilment.pick',storeId);
  const {data,error}=await context.admin.rpc('ch_staff_complete_picking',{
    p_actor:context.userId,p_order_id:orderId,p_store_id:storeId,p_duration_seconds:duration
  });
  if(error){
    if(error.code==='42501')throw new StaffAccessDenied('Picking permission or store access was revoked',403);
    if(error.code==='23514')throw new StaffAccessDenied('Every order line must be picked or explicitly skipped before completion',409);
    if(error.code==='P0002')throw new StaffAccessDenied('This picking session is no longer owned by you or is no longer active',409);
    if(error.code==='22023')throw new StaffAccessDenied('Invalid picking completion request',400);
    throw error;
  }
  if(data!==orderId)throw new Error('Unexpected picking completion result');
  return Response.json({success:true,order_id:orderId,warehouse_status:'packing',order_status:'packing'},
    {headers:{'Cache-Control':'no-store, private'}});
 }catch(error){return staffErrorResponse(error);}
}
