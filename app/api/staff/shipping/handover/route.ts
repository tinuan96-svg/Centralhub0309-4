import {StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

/** Confirms PHYSICAL handover of a previously booked/labelled shipment.
 * Does not allow arbitrary lifecycle updates or book/cancel DHL shipments.
 * The database rechecks live identity, four permissions, store and shipment
 * evidence inside the same transaction as shipment/order/audit changes.
 */
export async function POST(request:Request){
 try{
  const context=await requireStaffContext(request);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const orderId=body?.order_id,storeId=body?.store_id,shipmentId=body?.shipment_id;
  if(typeof orderId!=='string'||!UUID.test(orderId)||
     typeof storeId!=='string'||!UUID.test(storeId)||
     typeof shipmentId!=='string'||!UUID.test(shipmentId)||
     body?.physical_handover_confirmed!==true)
    throw new StaffAccessDenied('Confirm physical courier handover for the selected order, store and shipment',400);
  for(const permission of ['fulfilment.view','fulfilment.dispatch','shipping.view','shipping.edit']){
    requireStaffPermission(context,permission,storeId);
  }
  const {data,error}=await context.admin.rpc('ch_staff_confirm_courier_handover',{
    p_actor:context.userId,p_order_id:orderId,p_store_id:storeId,p_shipment_id:shipmentId
  });
  if(error){
    if(error.code==='42501')throw new StaffAccessDenied('Shipping permission or assigned store access has been revoked',403);
    if(error.code==='P0002')throw new StaffAccessDenied('Order or shipment is no longer available for handover. Refresh before trying again.',409);
    if(error.code==='23514')throw new StaffAccessDenied('The booked shipment, label or tracking evidence requires manager review.',409);
    if(error.code==='22023')throw new StaffAccessDenied('Invalid handover request',400);
    throw error;
  }
  if(data!==shipmentId)throw new Error('Unexpected courier handover response');
  return Response.json({success:true,order_id:orderId,shipment_id:shipmentId,shipment_status:'collected'},{
    headers:{'Cache-Control':'no-store, private'}
  });
 }catch(error){return staffErrorResponse(error);}
}
