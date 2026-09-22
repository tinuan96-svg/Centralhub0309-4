import {
  StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse
} from '@/lib/access-control/staff';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only claims an eligible paid order for picking. This route never accepts
 * arbitrary status, order field, quantity, financial or shipping mutations.
 */
export async function POST(request:Request){
  try{
    const context=await requireStaffContext(request);
    const payload=await request.json().catch(()=>null) as Record<string,unknown>|null;
    const orderId=payload?.order_id,storeId=payload?.store_id;
    if(typeof orderId!=='string'||!UUID.test(orderId)||
      typeof storeId!=='string'||!UUID.test(storeId)){
      throw new StaffAccessDenied('Select a valid order and assigned store',400);
    }
    requireStaffPermission(context,'fulfilment.view',storeId);
    requireStaffPermission(context,'fulfilment.pick',storeId);
    const {data,error}=await context.admin.rpc('ch_staff_claim_picking',{
      p_actor:context.userId,p_order_id:orderId,p_store_id:storeId
    });
    if(error){
      if(error.code==='42501')
        throw new StaffAccessDenied('Picking permission or store access was revoked',403);
      if(error.code==='P0002')
        throw new StaffAccessDenied('Order is unavailable or another employee has claimed it. Refresh the queue.',409);
      if(error.code==='22023')throw new StaffAccessDenied('Invalid order',400);
      throw error;
    }
    if(data!==orderId)throw new Error('Unexpected picking claim result');
    return Response.json({success:true,order_id:orderId,warehouse_status:'picking'},
      {headers:{'Cache-Control':'no-store, private'}});
  }catch(error){return staffErrorResponse(error);}
}
